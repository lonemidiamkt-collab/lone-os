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
import { requireCronOrUser } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { responsavelDeTrafego } from "@/lib/cs/mencao";
import { temTrafego } from "@/lib/clients/servico";
import { statusPorResultado, saiDeOnboarding, ROTULO, type Veredito } from "@/lib/traffic/status-resultado";
import { spNow, ymd } from "@/lib/cs/vigilancia";

const MANUAL_VALE_DIAS = 7;

interface Mudanca { cliente: string; de: string; para: string; motivo: string }

export async function POST(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;
  const preview = req.nextUrl.searchParams.get("preview") !== null;

  const hoje = ymd(spNow());
  const desde = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [cliRes, metRes, polRes, contasRes] = await Promise.all([
    supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, status, status_origem, status_atualizado_em, service_type, created_at")
      .eq("lifecycle", "ativo"),
    supabaseAdmin.from("metric_snapshots")
      .select("client_id, spend, conversions")
      .gte("metric_date", desde).lt("metric_date", hoje),
    supabaseAdmin.from("client_traffic_policy")
      .select("client_id, cpl_alerta, cpl_critico, conversas_minimas"),
    supabaseAdmin.from("ad_accounts").select("client_id"),
  ]);
  if (cliRes.error) return NextResponse.json({ error: cliRes.error.message }, { status: 500 });

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

  const mudancas: Mudanca[] = [];
  const mantidos: string[] = [];
  const manuaisRespeitados: string[] = [];
  const semBase: string[] = [];
  const escritas: { id: string; status: string; motivo: string }[] = [];

  for (const c of cliRes.data ?? []) {
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
        escritas.push({ id, status: "good", motivo });
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
        escritas.push({ id, status: "good", motivo: v.motivo });
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
    escritas.push({ id, status: v.status, motivo: v.motivo });
  }

  if (preview) {
    return NextResponse.json({ ok: true, preview: true, mudancas, manuaisRespeitados, semBase, mantidosEmOnboarding: mantidos, total: escritas.length });
  }

  // Grava. Uma escrita por cliente; o motivo vai junto para o card.
  let gravados = 0;
  for (const e of escritas) {
    const { error } = await supabaseAdmin.from("clients").update({
      status: e.status, status_origem: "auto", status_motivo: e.motivo, status_atualizado_em: new Date().toISOString(),
    }).eq("id", e.id);
    if (!error) gravados++;
  }

  // Avisa o gestor com o que mudou. Sem mudança, uma linha só — silêncio não diz se rodou.
  const { data: cfg } = await supabaseAdmin.from("agency_settings").select("value").eq("key", "traffic_alert_group_jid").single();
  const jid = cfg?.value as string | undefined;
  let avisado = false;
  if (jid) {
    const gestor = await responsavelDeTrafego().catch(() => ({ trecho: "", jids: [] as string[], notifica: false }));
    const rot = (s: string) => ROTULO[s as keyof typeof ROTULO] ?? s;
    const porFaixa = (f: string) => mudancas.filter((m) => m.para === f);
    const linhas = (f: string) => porFaixa(f).map((m) => `• *${m.cliente}* — ${rot(m.de)} → ${rot(m.para)}\n  _${m.motivo}_`).join("\n");
    const corpo = mudancas.length
      ? [
          porFaixa("at_risk").length ? `🔴 *Em risco*\n${linhas("at_risk")}` : "",
          porFaixa("average").length ? `🟠 *Resultados médios*\n${linhas("average")}` : "",
          porFaixa("good").length ? `🟢 *Bons resultados*\n${linhas("good")}` : "",
        ].filter(Boolean).join("\n\n")
      : "Nenhuma mudança esta semana — todos seguem na faixa em que estavam.";
    const texto =
      `📊 *Status dos clientes pelo resultado do anúncio* — ${spNow().toLocaleDateString("pt-BR")}\n` +
      `${gestor.trecho ? `${gestor.trecho} ` : ""}revisei conta por conta (CPL dos últimos 7 dias × meta de cada um).\n\n` +
      corpo +
      (manuaisRespeitados.length ? `\n\n_Mantive como você deixou (arraste recente): ${manuaisRespeitados.join(", ")}._` : "") +
      (semBase.length ? `\n\n_Sem base para julgar: ${semBase.join("; ")}._` : "") +
      `\n\nSe discordar de algum, é só arrastar no *Status Clientes* — o arraste vale por 7 dias antes de eu reavaliar.`;
    const r = await csSendGroupText(jid, texto, undefined, { origem: "status-clientes", destino: "interno" }, gestor.jids).catch(() => ({ ok: false }));
    avisado = !!r.ok;
  }

  console.log(`[status-clientes] ${hoje} gravados=${gravados} mudancas=${mudancas.length} manuais=${manuaisRespeitados.length} avisado=${avisado}`);
  return NextResponse.json({ ok: true, gravados, mudancas, manuaisRespeitados, semBase, mantidosEmOnboarding: mantidos, avisado });
}
