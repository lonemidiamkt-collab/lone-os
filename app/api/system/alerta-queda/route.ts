export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText, csSendGroupDocument } from "@/lib/cs/notify";
import { carregarQuemFoiBem, ontemSP, type FoiBem } from "@/lib/traffic/resultado-dia";
import { resultadoDiaPdfHtml, legendaResultadoDia, textoResultadoDia, type QuedaDia } from "@/lib/reports/resultadoDiaPdf";
import { carregarVistos } from "@/lib/traffic/hoje/vistos";
import { estaVisto, nivelDaAnomalia } from "@/lib/traffic/hoje/visto";

// POST /api/system/alerta-queda — avisa o time quando o resultado de um cliente cai.
//
// PRA QUE (Roberto): "alerta de queda antes do cliente perceber, isso é bom pra gente".
//
// A detecção já existia: o defense-scan roda a cada 15 min, compara com a média dos 7 dias e grava
// em anomaly_alerts (spend caiu 80%, cpl subiu 80%, ctr caiu 50%, impressions caiu 70%). O que
// faltava era o aviso SAIR do banco — 58 alertas numa semana, nenhum notificado. Detectar sem
// avisar é o mesmo que não detectar.
//
// TRÊS TRAVAS CONTRA VIRAR RUÍDO. O Roberto já disse que recebe textão demais no grupo, e alerta
// que ninguém lê é pior que alerta nenhum:
//   1. só critical/high — medium não acorda ninguém;
//   2. uma linha por CLIENTE (o pior sintoma dele), não uma por métrica: um anúncio que parou
//      dispara spend, impressions e ctr ao mesmo tempo, e são o mesmo problema;
//   3. notified_at — o mesmo alerta nunca é avisado duas vezes.

const ROTULO: Record<string, { texto: (p: number) => string; ordem: number }> = {
  spend:       { texto: () => "parou de gastar", ordem: 0 },
  impressions: { texto: (p) => `entrega caiu ${Math.abs(Math.round(p))}%`, ordem: 1 },
  cpl:         { texto: (p) => `custo por conversa subiu ${Math.round(p)}%`, ordem: 2 },
  ctr:         { texto: (p) => `cliques caíram ${Math.abs(Math.round(p))}%`, ordem: 3 },
};

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;

  // Últimas 24h. Alerta de anteontem já não é "antes do cliente perceber".
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: lidos, error } = await supabaseAdmin
    .from("anomaly_alerts")
    .select("id, client_id, metric, severity, percent_change, current_value, baseline_value, metric_date")
    .is("notified_at", null).is("acknowledged_at", null)
    .in("severity", ["critical", "high"])
    .gte("detected_at", desde)
    .order("detected_at", { ascending: false });

  if (error) return NextResponse.json({ error: `leitura falhou: ${error.message}` }, { status: 500 });
  // 4ª trava (Leva 4): queda que alguém marcou como "visto" no Hoje/Defesa Ativa não sai no grupo por
  // 24h, a menos que piore. Não marca notified_at — se o visto vencer ainda dentro da janela, avisa.
  const { mapa: vistos } = await carregarVistos();
  const alertas = (lidos ?? []).filter((a) =>
    !estaVisto(vistos, a.client_id as string, "entrega", nivelDaAnomalia(a.severity as string)));

  // Nomes: um alerta com UUID no lugar do nome do cliente não serve pra ninguém agir.
  const ids = [...new Set(alertas.map((a) => a.client_id as string))];
  const { data: clientes } = ids.length
    ? await supabaseAdmin.from("clients").select("id, name, active, draft_status").in("id", ids)
    : { data: [] as { id: string; name: string | null; active: boolean | null; draft_status: string | null }[] };
  const porId = new Map((clientes ?? []).map((c) => [c.id as string, c]));

  // Um item por cliente, com o sintoma mais grave. Cliente inativo ou rascunho não entra: verba
  // parada ali é o esperado, não uma queda.
  const porCliente = new Map<string, { nome: string; sintoma: string; severidade: string; ids: string[] }>();
  for (const a of alertas) {
    const c = porId.get(a.client_id as string);
    if (!c || c.active === false || c.draft_status != null) continue;
    const r = ROTULO[a.metric as string];
    if (!r) continue;
    const atual = porCliente.get(a.client_id as string);
    const sintoma = r.texto(Number(a.percent_change) || 0);
    if (!atual) {
      porCliente.set(a.client_id as string, {
        nome: (c.name as string) ?? "(sem nome)", sintoma, severidade: a.severity as string, ids: [a.id as string],
      });
    } else {
      atual.ids.push(a.id as string);
      // Fica com o sintoma mais explicativo (spend parado > entrega caiu > custo subiu > ctr).
      const ordemAtual = Object.entries(ROTULO).find(([, v]) => atual.sintoma.startsWith(v.texto(0).slice(0, 6)))?.[1].ordem ?? 9;
      if (r.ordem < ordemAtual) { atual.sintoma = sintoma; atual.severidade = a.severity as string; }
    }
  }

  // Alerta de cliente inativo/rascunho: marca como notificado pra não reprocessar.
  const deInativos = alertas.filter((a) => !porCliente.has(a.client_id as string)).map((a) => a.id as string);
  if (deInativos.length) {
    await supabaseAdmin.from("anomaly_alerts").update({ notified_at: new Date().toISOString() }).in("id", deInativos);
  }

  const quedas: QuedaDia[] = [...porCliente.values()]
    .sort((a, b) => (a.severidade === "critical" ? 0 : 1) - (b.severidade === "critical" ? 0 : 1))
    .map(({ nome, sintoma, severidade }) => ({ nome, sintoma, severidade }));

  // O lado bom (Roberto, 24/09): quem foi acima da própria média ontem, pelos dias FECHADOS.
  // Quem está na lista de queda não entra aqui. Falha ao ler não derruba o aviso de queda.
  const { ontem, bons } = await carregarQuemFoiBem(new Set(porCliente.keys()))
    .catch((e) => { console.error("[alerta-queda] quem foi bem:", e); return { ontem: ontemSP(), bons: [] as FoiBem[] }; });

  if (!quedas.length && !bons.length) {
    return NextResponse.json({ ok: true, alertas: alertas.length, clientes: 0, bons: 0, enviado: false,
      vistos: (lidos?.length ?? 0) - alertas.length });
  }

  const legenda = legendaResultadoDia(quedas, bons, ontem);
  const texto = textoResultadoDia(quedas, bons, ontem);
  if (dry) return NextResponse.json({ ok: true, dry: true, alertas: alertas.length, clientes: quedas.length, bons: bons.length, legenda, texto });

  const jid = process.env.CS_TRAFFIC_GROUP_JID || "";
  if (!jid) return NextResponse.json({ error: "CS_TRAFFIC_GROUP_JID não configurado" }, { status: 500 });

  // PDF com legenda curta (o Roberto pediu PDF no lugar do textão); se o gerador falhar, vai o texto.
  const { htmlToPdf } = await import("@/lib/traffic/renderPdf");
  const { loadLoneLogo } = await import("@/lib/cs/roteiro-pdf");
  const logo = await loadLoneLogo().catch(() => "");
  const pdf = await htmlToPdf(resultadoDiaPdfHtml(quedas, bons, ontem, logo));
  const formato = pdf.ok && pdf.buffer ? "pdf" : "texto";
  const r = formato === "pdf"
    ? await csSendGroupDocument(jid, pdf.buffer!.toString("base64"), `resultado-de-ontem-${ontem}.pdf`, legenda)
    : await csSendGroupText(jid, texto, undefined, { origem: "alerta-queda", destino: "interno" });
  if (!r.ok) return NextResponse.json({ error: r.error, clientes: quedas.length, bons: bons.length }, { status: 500 });

  // Só marca como notificado DEPOIS de o envio confirmar. Marcar antes perderia o alerta se a
  // Evolution estivesse fora — e ninguém saberia que houve queda.
  const notificados = [...porCliente.values()].flatMap((c) => c.ids);
  if (notificados.length) {
    await supabaseAdmin.from("anomaly_alerts").update({ notified_at: new Date().toISOString() }).in("id", notificados);
  }

  return NextResponse.json({ ok: true, alertas: alertas.length, clientes: quedas.length, bons: bons.length, formato, enviado: true });
}
