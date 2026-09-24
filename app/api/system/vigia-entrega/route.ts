export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";
import { mencionar } from "@/lib/cs/mencao";
import { podeReceber, hojeSP } from "@/lib/clients/pausa";
import { temTrafego } from "@/lib/clients/servico";
import { buscarInsightHoje } from "@/lib/defense/insights-hoje";
import { carregarVistos } from "@/lib/traffic/hoje/vistos";
import { estaVisto } from "@/lib/traffic/hoje/visto";
import {
  HORA_VIGIA_SP, gastouHoje, quemVigiar, textoVigia, type ContaParaVigiar, type Parada,
} from "@/lib/defense/vigia-entrega";

// POST /api/system/vigia-entrega — Leva 7A (N1). Conta ativa que vinha gastando e não gastou NADA
// hoje até as 11h → uma mensagem no GRUPO DE TRÁFEGO (interno) marcando o gestor de cada conta.
// Regras e o porquê: lib/defense/vigia-entrega.ts. Nunca manda para grupo de cliente.
//
// ?dry=1 lê a Meta e devolve a mensagem sem gravar nem enviar · ?forcar=1 roda antes das 11h (teste).
// Nasce DESLIGADO (automation_settings, migração 20260925120000).

function horaSP(d = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(d));
}

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const forcar = req.nextUrl.searchParams.get("forcar") !== null;

  const agora = new Date();
  if (!forcar && horaSP(agora) < HORA_VIGIA_SP) {
    return NextResponse.json({ ok: true, skipped: true, motivo: `antes das ${HORA_VIGIA_SP}h a Meta ainda pode estar atrasada` });
  }
  const hoje = hojeSP(agora);

  const [{ data: cfg }, { data: ajustes }, { data: contas, error: eContas }, { data: clientes, error: eCli }] = await Promise.all([
    supabaseAdmin.from("agency_settings").select("value").eq("key", "meta_token").maybeSingle(),
    supabaseAdmin.from("agency_settings").select("value").eq("key", "hidden_ad_accounts").maybeSingle(),
    supabaseAdmin.from("ad_accounts").select("client_id, meta_account_id, account_status, last_3d_avg_spend"),
    supabaseAdmin.from("clients").select("id, name, nome_fantasia, assigned_traffic, service_type, active, churned_at, paused_at, paused_until"),
  ]);
  const token = cfg?.value as string | undefined;
  if (!token) return NextResponse.json({ error: "meta_token ausente" }, { status: 500 });
  if (eContas || eCli) return NextResponse.json({ error: (eContas ?? eCli)!.message }, { status: 500 });

  let ocultas: string[] = [];
  try { const v = JSON.parse((ajustes?.value as string) ?? "[]"); ocultas = Array.isArray(v) ? v.map(String) : []; } catch { ocultas = []; }
  const { mapa: vistos } = await carregarVistos();
  const porId = new Map((clientes ?? []).map((c) => [c.id as string, c]));

  const candidatas: ContaParaVigiar[] = [];
  for (const a of contas ?? []) {
    const c = porId.get(a.client_id as string);
    if (!c || !podeReceber(c as never, agora) || !temTrafego(c as never)) continue;
    candidatas.push({
      clientId: c.id as string,
      nome: ((c.nome_fantasia as string) || (c.name as string) || "(sem nome)"),
      gestor: (c.assigned_traffic as string) ?? null,
      metaAccountId: a.meta_account_id as string,
      status: a.account_status as number | null,
      media3d: a.last_3d_avg_spend != null ? Number(a.last_3d_avg_spend) : null,
      oculta: ocultas.includes(a.meta_account_id as string),
      visto: estaVisto(vistos, c.id as string, "entrega", "critical", agora),
    });
  }
  const vigiar = quemVigiar(candidatas);

  // Uma leitura de hoje por conta (a mesma do defense-scan). Falha de leitura NÃO vira "parada".
  const paradas: (ContaParaVigiar & { gasto: number })[] = [];
  const falhas: { cliente: string; erro: string }[] = [];
  for (const c of vigiar) {
    try {
      const linha = await buscarInsightHoje(c.metaAccountId, token, hoje);
      const gasto = gastouHoje(linha);
      if (gasto === 0) paradas.push({ ...c, gasto });
    } catch (e) {
      falhas.push({ cliente: c.nome, erro: (e instanceof Error ? e.message : String(e)).slice(0, 120) });
    }
  }

  // Um cliente pode ter duas contas: avisa uma vez por cliente (a que gastava mais).
  const porCliente = new Map<string, (typeof paradas)[number]>();
  for (const p of paradas) {
    const atual = porCliente.get(p.clientId);
    if (!atual || (p.media3d ?? 0) > (atual.media3d ?? 0)) porCliente.set(p.clientId, p);
  }

  // Já avisado hoje (pelo vigia ou pelo alerta-queda) ou já reconhecido na Defesa: não repete.
  const ids = [...porCliente.keys()];
  const { data: existentes } = ids.length
    ? await supabaseAdmin.from("anomaly_alerts").select("id, client_id, notified_at, acknowledged_at")
        .eq("metric", "spend").eq("metric_date", hoje).in("client_id", ids)
    : { data: [] as { id: string; client_id: string; notified_at: string | null; acknowledged_at: string | null }[] };
  const alertaDe = new Map((existentes ?? []).map((e) => [e.client_id as string, e]));
  const avisar = [...porCliente.values()].filter((p) => {
    const e = alertaDe.get(p.clientId);
    return !e || (!e.notified_at && !e.acknowledged_at);
  });

  const mencoes = await Promise.all(avisar.map((p) => mencionar(p.gestor)));
  const lista: Parada[] = avisar.map((p, i) => ({ clientId: p.clientId, nome: p.nome, media3d: p.media3d ?? 0, gestorTrecho: mencoes[i].trecho }));
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(agora);
  const texto = lista.length ? textoVigia(lista, hora) : null;

  const resumo = { vigiadas: vigiar.length, paradas: porCliente.size, avisar: lista.length, falhas };
  if (dry) return NextResponse.json({ ok: true, dry: true, ...resumo, clientes: lista.map((l) => l.nome), texto });
  if (!lista.length) return NextResponse.json({ ok: true, enviado: false, ...resumo });

  // A linha de anomalia do dia (o Hoje e a Defesa mostram). O defense-scan pode já ter criado.
  const idsAlerta: string[] = [];
  for (const p of avisar) {
    const e = alertaDe.get(p.clientId);
    if (e) { idsAlerta.push(e.id as string); continue; }
    const { data: nova, error } = await supabaseAdmin.from("anomaly_alerts").insert({
      client_id: p.clientId, meta_ad_account_id: p.metaAccountId, metric: "spend", severity: "critical",
      current_value: 0, baseline_value: p.media3d ?? 0, percent_change: -100, metric_date: hoje,
      description: `Gasto ZERO hoje até as ${hora} (a conta gastava ~R$ ${(p.media3d ?? 0).toFixed(2)}/dia). Pagamento, reprovação ou campanha pausada?`,
    }).select("id").maybeSingle();
    if (error) console.error("[vigia-entrega] anomaly_alerts:", p.nome, error.message);
    else if (nova?.id) idsAlerta.push(nova.id as string);
  }

  const jid = process.env.CS_TRAFFIC_GROUP_JID || "";
  if (!jid) return NextResponse.json({ error: "CS_TRAFFIC_GROUP_JID não configurado", ...resumo }, { status: 500 });
  const r = await csSendGroupText(jid, texto!, undefined, { origem: "vigia-entrega", destino: "interno" }, mencoes.flatMap((m) => m.jids));
  if (!r.ok) return NextResponse.json({ error: r.error, ...resumo }, { status: 500 });

  // Só marca depois de o envio confirmar — o alerta-queda da manhã seguinte não repete.
  if (idsAlerta.length) {
    await supabaseAdmin.from("anomaly_alerts").update({ notified_at: new Date().toISOString() }).in("id", idsAlerta);
  }
  return NextResponse.json({ ok: true, enviado: true, ...resumo, clientes: lista.map((l) => l.nome) });
}
