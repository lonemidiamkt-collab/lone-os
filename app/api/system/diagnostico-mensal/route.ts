export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { loadLoneLogo } from "@/lib/cs/roteiro-pdf";
import { csSendGroupDocument, csSendGroupText } from "@/lib/cs/notify";
import { slug } from "@/lib/traffic/weekly-report";
import { coletar, periodoAnterior, periodoPadrao, selecionarClientes } from "@/lib/diagnostico-mensal/dados";
import { diagnosticoMensalHtml, legendaCliente } from "@/lib/diagnostico-mensal/pdf";
import type { Analise, DadosCliente } from "@/lib/diagnostico-mensal/analise";

// /api/system/diagnostico-mensal — o diagnóstico mensal de cada cliente, em PDF, no grupo de TRÁFEGO.
//
// Roberto (19/10/2026): "todo mês tem que ter diagnóstico de todos os clientes — bateu o dia 31, o
// diagnóstico do dia 1º ao 31". Quem recebe: clientes ativos com tráfego (lone_growth, assessoria_trafego,
// trafego_pago). Só-social fica fora. O destino é SEMPRE o grupo interno de tráfego: este PDF tem
// análise crítica da conta e nunca vai pro grupo do cliente.
//
// SEGURO POR PADRÃO: sem `enviar=1` nada sai do sistema.
//   (nada)                    → resumo em JSON de cada cliente (nota, pontos), sem PDF e sem envio.
//   ?clientId=<id>            → restringe a um cliente.
//   ?since=&until=            → período (AAAA-MM-DD). Padrão: no dia 1º o mês fechado; senão, 30 dias até ontem.
//   ?baixar=1&clientId=<id>   → devolve o PDF.   ?html=1&clientId=<id> → devolve o HTML.
//   ?enviar=1                 → gera e envia ao grupo de tráfego (um PDF por cliente).
//   ?enviar=1&force=1         → reenvia mesmo quem já recebeu no período.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function handle(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const q = req.nextUrl.searchParams;
  const clientId = q.get("clientId") || q.get("cliente");
  const baixar = q.get("baixar") === "1", html = q.get("html") === "1";
  const enviar = q.get("enviar") === "1", force = q.get("force") === "1";

  const base = periodoPadrao();
  const since = q.get("since") || base.de, until = q.get("until") || base.ate;
  if (!ISO.test(since) || !ISO.test(until) || since > until) {
    return NextResponse.json({ error: "since/until precisam ser AAAA-MM-DD com since <= until." }, { status: 400 });
  }
  const periodo = { de: since, ate: until };
  const anterior = periodoAnterior(since, until);

  const { elegiveis, foraSocial, pausados } = await selecionarClientes(clientId);
  if (clientId && !elegiveis.length) {
    return NextResponse.json({ error: "Cliente fora do escopo (inativo, pausado ou sem tráfego no contrato)." }, { status: 404 });
  }

  const logo = await loadLoneLogo().catch(() => "");
  const resultados: { cliente: string; nota: number | null; veredito: string; urgentes: number; pontos: number; investimento: number; erro?: string; enviado?: boolean }[] = [];
  const guardados: { d: DadosCliente; a: Analise }[] = [];

  let jid = "";
  if (enviar) {
    const { data: cfg } = await supabaseAdmin.from("agency_settings").select("value").eq("key", "traffic_alert_group_jid").single();
    jid = (cfg?.value as string) || "";
    if (!jid) return NextResponse.json({ error: "grupo de tráfego não configurado" }, { status: 500 });
  }

  for (const c of elegiveis) {
    const nome = c.nome_fantasia || c.name;
    try {
      const dados = await coletar(c, periodo, anterior);
      const { html: pagina, analise } = diagnosticoMensalHtml(dados, logo);
      guardados.push({ d: dados, a: analise });
      const linha = {
        cliente: nome, nota: analise.nota, veredito: analise.veredito,
        urgentes: analise.achados.filter((x) => x.gravidade === "alta").length,
        pontos: analise.achados.length, investimento: analise.atual.invest,
      };

      if (html) return new NextResponse(pagina, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

      if (baixar || enviar) {
        const chave = `diagnostico_mensal:${until}:${c.id}`;
        if (enviar && !force) {
          const { data: ja } = await supabaseAdmin.from("agency_settings").select("key").eq("key", chave).maybeSingle();
          if (ja) { resultados.push({ ...linha, enviado: false, erro: "já enviado neste período" }); continue; }
        }
        const pdf = await htmlToPdf(pagina);
        if (!pdf.ok || !pdf.buffer) { resultados.push({ ...linha, erro: `PDF: ${pdf.error ?? "falhou"}` }); continue; }
        if (baixar) {
          return new NextResponse(new Uint8Array(pdf.buffer), {
            headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="diagnostico-${slug(nome)}-${until}.pdf"` },
          });
        }
        const r = await csSendGroupDocument(jid, pdf.buffer.toString("base64"), `Diagnostico ${nome} ${since} a ${until}.pdf`, legendaCliente(dados, analise));
        if (r.ok) {
          await supabaseAdmin.from("agency_settings").upsert({ key: chave, value: new Date().toISOString() }, { onConflict: "key" });
        }
        resultados.push({ ...linha, enviado: r.ok, ...(r.ok ? {} : { erro: r.error }) });
        await sleep(2500); // o WhatsApp barra rajada de documentos
      } else {
        resultados.push(linha);
      }
    } catch (e) {
      resultados.push({ cliente: nome, nota: null, veredito: "", urgentes: 0, pontos: 0, investimento: 0, erro: e instanceof Error ? e.message : String(e) });
    }
  }

  // Fecho no grupo: o placar da carteira, do mais urgente ao mais saudável. É o que o Roberto lê primeiro.
  if (enviar && resultados.some((r) => r.enviado)) {
    const ok = resultados.filter((r) => r.enviado && r.nota != null).sort((a, b) => (a.nota ?? 0) - (b.nota ?? 0));
    const linhas = ok.slice(0, 8).map((r) => `• ${r.cliente} — ${r.nota}/100${r.urgentes ? ` (${r.urgentes} urgente${r.urgentes > 1 ? "s" : ""})` : ""}`);
    const falhas = resultados.filter((r) => r.erro && r.enviado !== false);
    await csSendGroupText(jid, [
      `✅ *Diagnóstico mensal enviado* — ${resultados.filter((r) => r.enviado).length} clientes, período ${since.split("-").reverse().join("/")} a ${until.split("-").reverse().join("/")}.`,
      linhas.length ? `\n*Os que mais precisam de atenção (menor nota):*\n${linhas.join("\n")}` : "",
      falhas.length ? `\n⚠️ ${falhas.length} não gerou: ${falhas.map((f) => f.cliente).join(", ")}` : "",
    ].filter(Boolean).join("\n")).catch(() => {});
  }

  return NextResponse.json({
    ok: true, periodo, anterior, enviado: enviar,
    escopo: { clientes: elegiveis.length, fora_por_ser_so_social: foraSocial, pausados },
    resultados,
  });
}

export const GET = handle;
export const POST = handle;
