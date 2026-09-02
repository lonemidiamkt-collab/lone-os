export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";

// POST /api/system/traffic-policy — deriva a política de tráfego de cada cliente do próprio histórico.
//
// Uma tabela vazia não serve pra nada: seria o mesmo destino do briefing, que existia desde sempre e
// ficou com 19 de 50 preenchidos porque dependia de alguém sentar e preencher. Aqui a política nasce
// do que o cliente JÁ entrega, e fica marcada como `derivada` — quem abrir sabe que é ponto de
// partida, não decisão tomada.
//
// A MEDIANA, não a média: um dia ruim de R$40 por conversa puxa a média e faria a meta nascer
// frouxa, aceitando como normal um custo que não é.
//
// ?dry=1 mostra o que faria · ?clientId= um só · ?refazer=1 recalcula até as já revisadas

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const soCliente = req.nextUrl.searchParams.get("clientId") || "";
  const refazer = req.nextUrl.searchParams.get("refazer") === "1";

  let q = supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia")
    .not("meta_ad_account_id", "is", null).neq("meta_ad_account_id", "")
    .or("active.is.null,active.eq.true").is("draft_status", null);
  if (soCliente) q = q.eq("id", soCliente);
  const { data: clientes, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Política revisada por gente NÃO é sobrescrita: o número que o gestor ajustou vale mais que
  // qualquer derivação. Só volta a ser calculada com ?refazer=1.
  const { data: existentes } = await supabaseAdmin
    .from("client_traffic_policy").select("client_id, origem");
  const revisadas = new Set((existentes ?? []).filter((p) => p.origem === "revisada").map((p) => p.client_id as string));
  const jaTem = new Set((existentes ?? []).map((p) => p.client_id as string));

  const desde = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const { data: metricas } = await supabaseAdmin.from("metric_snapshots")
    .select("client_id, metric_date, spend, conversions").gte("metric_date", desde);

  const porCliente = new Map<string, { spend: number; conv: number }[]>();
  for (const m of metricas ?? []) {
    const id = m.client_id as string;
    porCliente.set(id, [...(porCliente.get(id) ?? []), { spend: Number(m.spend) || 0, conv: Number(m.conversions) || 0 }]);
  }

  const mediana = (v: number[]) => {
    if (!v.length) return null;
    const s = [...v].sort((a, b) => a - b);
    const i = Math.floor(s.length / 2);
    return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
  };

  const feitas: Record<string, unknown>[] = [];
  const semBase: string[] = [];

  for (const c of clientes ?? []) {
    const nome = (c.nome_fantasia as string) || (c.name as string);
    if (revisadas.has(c.id as string) && !refazer) continue;

    const dias = porCliente.get(c.id as string) ?? [];
    const comGasto = dias.filter((d) => d.spend > 0);
    const totalConv = dias.reduce((s, d) => s + d.conv, 0);
    const totalGasto = dias.reduce((s, d) => s + d.spend, 0);

    // Sem volume, não dá pra derivar meta honesta — e meta chutada é pior que meta ausente, porque
    // o sistema passa a julgar o cliente por um número inventado.
    if (comGasto.length < 7 || totalConv < 10) {
      semBase.push(`${nome}: ${comGasto.length} dias com gasto, ${totalConv} conversas`);
      continue;
    }

    // CPL diário de cada dia que teve conversa; a mediana desses é o que o cliente entrega quando
    // as coisas estão normais.
    const cplsDiarios = dias.filter((d) => d.conv > 0).map((d) => d.spend / d.conv);
    const cplMeta = mediana(cplsDiarios) ?? totalGasto / totalConv;
    const orcamentoDia = mediana(comGasto.map((d) => d.spend)) ?? 0;

    const politica = {
      client_id: c.id,
      kpi: "conversa",
      cpl_meta: Math.round(cplMeta * 100) / 100,
      // 40% acima da mediana ainda acontece em dia ruim normal; 2x já é outra história.
      cpl_alerta: Math.round(cplMeta * 1.4 * 100) / 100,
      cpl_critico: Math.round(cplMeta * 2 * 100) / 100,
      orcamento_diario: Math.round(orcamentoDia * 100) / 100,
      orcamento_mensal: Math.round(orcamentoDia * 30 * 100) / 100,
      // Evidência mínima proporcional ao porte: exigir 5 conversas de quem faz 60 por mês é
      // razoável; de quem faz 12, é pedir meia semana de espera antes de qualquer decisão.
      conversas_minimas: Math.max(3, Math.min(8, Math.round(totalConv / 12))),
      gasto_minimo_decisao: Math.max(30, Math.round(orcamentoDia)),
      origem: "derivada",
      updated_at: new Date().toISOString(),
    };

    feitas.push({
      cliente: nome, cpl_meta: politica.cpl_meta, cpl_critico: politica.cpl_critico,
      orcamento_dia: politica.orcamento_diario, conversas_minimas: politica.conversas_minimas,
      novo: !jaTem.has(c.id as string),
    });

    if (!dry) {
      await supabaseAdmin.from("client_traffic_policy").upsert(politica, { onConflict: "client_id" });
    }
  }

  return NextResponse.json({
    ok: true, dry,
    clientes: clientes?.length ?? 0,
    politicas: feitas.length,
    preservadas_revisadas: revisadas.size,
    sem_base: semBase.length,
    detalhe: feitas.slice(0, 10),
    sem_base_lista: semBase.slice(0, 8),
  });
}
