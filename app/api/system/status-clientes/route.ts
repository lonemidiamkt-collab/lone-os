// app/api/system/status-clientes/route.ts — O STATUS DO KANBAN SAI DO RESULTADO DO ANÚNCIO.
//
// Roberto (13/09/2026): "faça em cima dos resultados de anúncio dos clientes e só. Verifique conta
// por conta e sempre faça essa troca no Status Clientes de acordo com esses resultados. Toda
// sexta-feira você faz essa análise, e pede pro Júlio fazer também."
//
// Roda toda sexta (cron) e a pedido (?force=1). Para cada cliente COM CONTRATO DE ANÚNCIO:
//   1. CPL real dos últimos 7 dias × política do cliente (lib/traffic/status-resultado.ts);
//   2. grava clients.status — a não ser que alguém tenha arrastado à mão há menos de 7 dias
//      (status_origem = manual): o Julio olhou e decidiu, a régua espera a próxima semana;
//   3. tira de onboarding quem passou dos 30 dias ou já tem resultado para ser julgado;
//   4. manda ao grupo de tráfego o que mudou, marcando o gestor, e pede que ele confira.
//
// Cliente só de social NÃO entra: não existe resultado de anúncio para julgar, e status por
// anúncio em quem não tem anúncio é o erro do Dumar de outra roupa. Regra em lib/clients/servico.
//
// A régua (cpl_alerta / cpl_critico) é a mesma do diagnóstico diário — client_traffic_policy,
// hoje derivada do histórico de cada cliente. O Julio pode apertar ou afrouxar por cliente.
//
// ?preview=1 calcula e devolve sem gravar nem avisar.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { responsavelDeTrafego } from "@/lib/cs/mencao";
import { temTrafego } from "@/lib/clients/servico";
import { metaAccountStatus } from "@/lib/budgets/account-status";
import { statusClientesPdfHtml, legendaStatusClientes, type DadosStatusClientes, type FaixaStatus } from "@/lib/reports/statusClientesPdf";
import { statusPorResultado, saiDeOnboarding, ROTULO, type Veredito } from "@/lib/traffic/status-resultado";
import { spNow, ymd } from "@/lib/cs/vigilancia";
import { estaPausado } from "@/lib/clients/pausa";

const MANUAL_VALE_DIAS = 7;

interface Mudanca { cliente: string; de: string; para: string; motivo: string }

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const preview = req.nextUrl.searchParams.get("preview") !== null;

  const hoje = ymd(spNow());
  const desde = ymd(spNow(new Date(Date.now() - 7 * 86400000)));

  const [cliRes, metRes, polRes, contasRes] = await Promise.all([
    supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, status, status_origem, status_atualizado_em, service_type, created_at, paused_at, paused_until")
      .eq("lifecycle", "ativo"),
    supabaseAdmin.from("metric_snapshots")
      .select("client_id, spend, conversions")
      .gte("metric_date", desde).lt("metric_date", hoje),
    supabaseAdmin.from("client_traffic_policy")
      .select("client_id, cpl_alerta, cpl_critico, conversas_minimas"),
    supabaseAdmin.from("ad_accounts").select("client_id, account_status, last_balance"),
  ]);
  // Qualquer leitura falha = aborta. Sem métricas todo mundo virava "Em risco" e o grupo era avisado.
  const falha = cliRes.error ?? metRes.error ?? polRes.error ?? contasRes.error;
  if (falha) {
    console.error("[status-clientes] leitura falhou, nada gravado nem avisado:", falha.message);
    return NextResponse.json({ ok: false, error: falha.message }, { status: 500 });
  }

  // Agrega 7 dias por cliente.
  const gasto = new Map<string, { gasto: number; conv: number }>();
  for (const m of metRes.data ?? []) {
    const k = m.client_id as string;
    const a = gasto.get(k) ?? { gasto: 0, conv: 0 };
    a.gasto += Number(m.spend) || 0; a.conv += Number(m.conversions) || 0;
    gasto.set(k, a);
  }
  const politica = new Map((polRes.data ?? []).map((p) => [p.client_id as string, p]));
  const temConta = new Set((contasRes.data ?? []).map((a) => a.client_id as string));
  const contaDe = new Map((contasRes.data ?? []).map((a) => [a.client_id as string, a]));
  // POR QUE NÃO GASTOU. "Sem gasto" não é resultado ruim — é anúncio parado, e o motivo muda a
  // conversa: conta desativada pela Meta é com o gestor, saldo zerado é com o cliente.
  const porQueParou = (id: string): string => {
    const a = contaDe.get(id);
    const st = a?.account_status != null ? Number(a.account_status) : null;
    if (st != null && st !== 1) return `sem gasto em 7 dias — conta ${metaAccountStatus(st).label.toLowerCase()} na Meta`;
    if (a?.last_balance != null && Number(a.last_balance) <= 0) return "sem gasto em 7 dias — saldo zerado";
    return "sem gasto em 7 dias — campanhas pausadas ou sem verba programada";
  };

  const mudancas: Mudanca[] = [];
  const mantidos: string[] = [];
  const manuaisRespeitados: string[] = [];
  const semBase: string[] = [];
  const escritas: { id: string; nome: string; status: string; motivo: string; semGasto?: boolean; soSocial?: boolean }[] = [];

  for (const c of cliRes.data ?? []) {
    if (estaPausado(c)) continue; // pausado não anuncia de propósito — não se julga resultado
    const nome = (c.nome_fantasia as string) || (c.name as string) || "Cliente";
    const id = c.id as string;
    const atual = (c.status as string) || "good";
    const diasDeCasa = Math.floor((Date.now() - new Date(c.created_at as string).getTime()) / 86400000);

    // Só quem contratou anúncio recebe status por resultado. O Dumar recebeu 9 mensagens de
    // campanha sem ter campanha por um código que decidia pela conta Meta em vez do contrato —
    // aqui não se repete. Mas a SAÍDA DO ONBOARDING vale para todos: o Atlas (só social) estava
    // há 146 dias lá porque nenhuma regra o tirava.
    if (!temTrafego({ service_type: c.service_type as string })) {
      if (atual === "onboarding" && diasDeCasa > 30) {
        const motivo = `${diasDeCasa}d de casa; só social — sem resultado de anúncio para julgar`;
        mudancas.push({ cliente: nome, de: atual, para: "good", motivo });
        escritas.push({ id, nome, status: "good", motivo, soSocial: true });
      }
      continue;
    }

    const g = gasto.get(id) ?? { gasto: 0, conv: 0 };
    const p = politica.get(id);
    const v: Veredito = statusPorResultado({
      gasto7d: g.gasto, conv7d: g.conv,
      cplAlerta: p?.cpl_alerta != null ? Number(p.cpl_alerta) : null,
      cplCritico: p?.cpl_critico != null ? Number(p.cpl_critico) : null,
      convMin: p?.conversas_minimas != null ? Number(p.conversas_minimas) : null,
      temConta: temConta.has(id),
    });

    // Onboarding: sai pela regra; enquanto não sai, não recebe status por resultado.
    if (atual === "onboarding" && !saiDeOnboarding(diasDeCasa, v)) { mantidos.push(nome); continue; }

    if (v.status === null) {
      // Sem base para julgar. Se estava em onboarding e passou do prazo, vira "good" por padrão
      // — sair de onboarding sem dado não pode virar "em risco" por falta de informação.
      if (atual === "onboarding") {
        mudancas.push({ cliente: nome, de: atual, para: "good", motivo: `${diasDeCasa}d de casa; ${v.motivo}` });
        escritas.push({ id, nome, status: "good", motivo: v.motivo });
      } else {
        semBase.push(`${nome} (${v.motivo})`);
      }
      continue;
    }

    // Arraste manual recente vale mais que a régua: alguém olhou e decidiu.
    const manualRecente = c.status_origem === "manual" && c.status_atualizado_em
      && (Date.now() - new Date(c.status_atualizado_em as string).getTime()) < MANUAL_VALE_DIAS * 86400000;
    if (manualRecente && atual !== "onboarding") { manuaisRespeitados.push(`${nome} (${ROTULO[atual as keyof typeof ROTULO] ?? atual})`); continue; }

    if (atual !== v.status) {
      mudancas.push({ cliente: nome, de: atual, para: v.status, motivo: v.motivo });
    }
    escritas.push({ id, nome, status: v.status, motivo: v.motivo, semGasto: g.gasto <= 0 });
  }

  // O panorama do PDF: só cliente de anúncio (o só-social que sai do onboarding é gravado, mas não
  // tem resultado de anúncio pra mostrar). Sem gasto vira faixa própria, com o porquê.
  const faixaDe = (e: (typeof escritas)[number]): FaixaStatus => (e.semGasto && e.status === "at_risk" ? "parado" : e.status as FaixaStatus);
  const panorama = escritas.filter((e) => !e.soSocial).map((e) => ({
    cliente: e.nome, faixa: faixaDe(e), motivo: faixaDe(e) === "parado" ? porQueParou(e.id) : e.motivo,
  }));

  if (preview) {
    return NextResponse.json({ ok: true, preview: true, mudancas, manuaisRespeitados, semBase, mantidosEmOnboarding: mantidos, total: escritas.length, panorama });
  }

  // Grava. Uma escrita por cliente; o motivo vai junto para o card.
  let gravados = 0;
  for (const e of escritas) {
    const { error } = await supabaseAdmin.from("clients").update({
      status: e.status, status_origem: "auto", status_motivo: e.motivo, status_atualizado_em: new Date().toISOString(),
    }).eq("id", e.id);
    if (!error) gravados++;
  }

  // Avisa o gestor. EM PDF (02/10): o texto tinha 1.771 caracteres e misturava "CPL acima do
  // crítico" com "conta sem gasto" no mesmo "Resultados ruins". O PDF mostra o panorama por faixa,
  // com quem mudou destacado; no grupo vai a legenda com os números e a marcação do gestor.
  const { data: cfg } = await supabaseAdmin.from("agency_settings").select("value").eq("key", "traffic_alert_group_jid").single();
  const jid = cfg?.value as string | undefined;
  let avisado = false;
  let formato: "pdf" | "texto" | null = null;
  if (jid) {
    const gestor = await responsavelDeTrafego().catch(() => ({ trecho: "", jids: [] as string[], notifica: false }));
    const rot = (st: string) => ROTULO[st as keyof typeof ROTULO] ?? st;
    const antesDe = new Map(mudancas.map((m) => [m.cliente, rot(m.de)]));
    const dados: DadosStatusClientes = {
      data: spNow().toLocaleDateString("pt-BR"),
      linhas: panorama.map((l) => ({ ...l, antes: antesDe.get(l.cliente) ?? null })),
      manuais: manuaisRespeitados,
      semBase,
    };
    try {
      const { htmlToPdf } = await import("@/lib/traffic/renderPdf");
      const { loadLoneLogo } = await import("@/lib/cs/roteiro-pdf");
      const { csSendGroupDocument } = await import("@/lib/cs/notify");
      const logo = await loadLoneLogo().catch(() => "");
      const pdf = await htmlToPdf(statusClientesPdfHtml(dados, logo));
      if (!pdf.ok || !pdf.buffer) throw new Error(pdf.error ?? "render falhou");
      const r = await csSendGroupDocument(jid, pdf.buffer.toString("base64"), `Status dos clientes ${hoje}.pdf`,
        legendaStatusClientes(dados, gestor.trecho), "application/pdf", gestor.jids);
      if (!r.ok) throw new Error(r.error ?? "envio falhou");
      avisado = true; formato = "pdf";
    } catch (e) {
      // Aviso que some porque o PDF caiu é pior que aviso comprido: vai o texto de antes.
      console.error("[status-clientes] PDF falhou, mandando como texto:", String(e));
      const porFaixa = (f: string) => mudancas.filter((m) => m.para === f);
      const linhas = (f: string) => porFaixa(f).map((m) => `• *${m.cliente}* — ${rot(m.de)} → ${rot(m.para)}\n  _${m.motivo}_`).join("\n");
      const corpo = mudancas.length
        ? [
            porFaixa("at_risk").length ? `🔴 *${ROTULO.at_risk}*\n${linhas("at_risk")}` : "",
            porFaixa("average").length ? `🟠 *Resultados médios*\n${linhas("average")}` : "",
            porFaixa("good").length ? `🟢 *Bons resultados*\n${linhas("good")}` : "",
          ].filter(Boolean).join("\n\n")
        : "Nenhuma mudança esta semana — todos seguem na faixa em que estavam.";
      const texto =
        `📊 *Status dos clientes pelo resultado do anúncio* — ${dados.data}\n` +
        `${gestor.trecho ? `${gestor.trecho} ` : ""}revisei conta por conta (CPL dos últimos 7 dias × meta de cada um).\n\n` +
        corpo +
        `\n\nSe discordar de algum, é só arrastar no *Status Clientes* — o arraste vale por 7 dias antes de eu reavaliar.`;
      const r = await csSendGroupText(jid, texto, undefined, { origem: "status-clientes", destino: "interno" }, gestor.jids).catch(() => ({ ok: false }));
      avisado = !!r.ok; formato = "texto";
    }
  }

  console.log(`[status-clientes] ${hoje} gravados=${gravados} mudancas=${mudancas.length} manuais=${manuaisRespeitados.length} avisado=${avisado} formato=${formato}`);
  return NextResponse.json({ ok: true, gravados, mudancas, manuaisRespeitados, semBase, mantidosEmOnboarding: mantidos, avisado, formato });
}
