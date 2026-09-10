export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { registrarHistorico, type EventoHistorico } from "@/lib/clients/historico";

// O HISTÓRICO OPERACIONAL, ALIMENTADO PELOS FATOS.
//
// Roberto (10/09): "na aba histórico operacional ainda segue sem fazer histórico de forma
// automática, e não está sendo feito para todos os clientes."
//
// POR QUE UM CRON E NÃO INSTRUMENTAR CADA ESCRITA: os eventos que importam nascem em dez lugares
// diferentes (board do social, board do designer, agente no WhatsApp, sync da Meta). Instrumentar
// os dez significa dez chances de esquecer um — e foi assim que a versão anterior morreu: quem
// escrevia era o estado em memória do app, e quando as telas passaram a falar com o banco, ninguém
// percebeu que a aba tinha parado. Em 11/05.
//
// Varrendo o BANCO, a fonte é o fato consumado. Um caminho novo de escrita entra no histórico sem
// ninguém lembrar de nada.
//
// Cron sugerido: `0 * * * *` (de hora em hora). `?dias=120` para recuperar o passado.

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const dias = Math.min(Number(req.nextUrl.searchParams.get("dias") ?? 3) || 3, 400);
  const desde = new Date(Date.now() - dias * 86400_000).toISOString();
  const seco = req.nextUrl.searchParams.get("dry") !== null;

  const eventos: EventoHistorico[] = [];

  // ── 1. POST PUBLICADO ────────────────────────────────────────────────────
  // O desfecho que o sistema mais custou a registrar. É o fato que prova entrega.
  const { data: publicados } = await supabaseAdmin
    .from("content_cards")
    .select("client_id, title, publish_verified_at, social_media")
    .not("publish_verified_at", "is", null)
    .gte("publish_verified_at", desde)
    .is("archived_at", null);
  for (const c of publicados ?? []) {
    eventos.push({
      clientId: c.client_id as string, tipo: "content",
      ator: (c.social_media as string) || "Sistema",
      descricao: `Post publicado: "${(c.title as string) || "sem título"}"`,
      quando: c.publish_verified_at as string, chave: "post",
    });
  }

  // ── 2. ARTE ENTREGUE ─────────────────────────────────────────────────────
  const { data: entregues } = await supabaseAdmin
    .from("content_cards")
    .select("client_id, title, designer_delivered_at")
    .not("designer_delivered_at", "is", null)
    .gte("designer_delivered_at", desde)
    .is("archived_at", null);
  for (const c of entregues ?? []) {
    eventos.push({
      clientId: c.client_id as string, tipo: "design", ator: "Designer",
      descricao: `Arte entregue: "${(c.title as string) || "sem título"}"`,
      quando: c.designer_delivered_at as string, chave: "arte",
    });
  }

  // ── 3. PEDIDO DO CLIENTE ─────────────────────────────────────────────────
  // O que o cliente pediu no grupo e o agente classificou. É a metade da história que só existia
  // no WhatsApp — e quem abre a ficha meses depois não tem como ir lá procurar.
  const { data: pedidos } = await supabaseAdmin
    .from("cs_demandas")
    .select("client_id, resumo, tipo, author, created_at")
    .not("client_id", "is", null)
    .gte("created_at", desde);
  for (const d of pedidos ?? []) {
    const resumo = (d.resumo as string) || (d.tipo as string) || "pedido";
    eventos.push({
      clientId: d.client_id as string, tipo: "chat",
      ator: (d.author as string) || "Cliente",
      descricao: `Pedido do cliente: ${resumo.slice(0, 160)}`,
      quando: d.created_at as string, chave: "pedido",
    });
  }

  // ── 4. RELATÓRIO ENVIADO ─────────────────────────────────────────────────
  const { data: relatorios } = await supabaseAdmin
    .from("cs_outbound")
    .select("client_id, origem, created_at")
    .in("origem", ["relatorio", "cs-relatorio", "relatorio-semanal"])
    .eq("enviado", true)
    .not("client_id", "is", null)
    .gte("created_at", desde);
  for (const r of relatorios ?? []) {
    eventos.push({
      clientId: r.client_id as string, tipo: "report", ator: "Sistema",
      descricao: "Relatório enviado ao cliente",
      quando: r.created_at as string, chave: "relatorio",
    });
  }

  if (seco) {
    const porTipo = eventos.reduce((a, e) => { a[e.tipo] = (a[e.tipo] ?? 0) + 1; return a; }, {} as Record<string, number>);
    return NextResponse.json({
      ok: true, dry: true, dias,
      candidatos: eventos.length, porTipo,
      clientes: new Set(eventos.map((e) => e.clientId)).size,
    });
  }

  // A dedup é por descrição idêntica no mesmo dia (ver lib/clients/historico): rodar de hora em
  // hora não multiplica linha.
  let gravados = 0;
  for (const e of eventos) { await registrarHistorico(e); gravados += 1; }

  return NextResponse.json({
    ok: true, dias, processados: gravados,
    clientes: new Set(eventos.map((e) => e.clientId)).size,
  });
}
