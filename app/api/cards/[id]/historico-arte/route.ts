export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/cards/[id]/historico-arte — a etapa de design do card, contada (Leva 5b).
// Entregas (versões em creative_deliveries) e alterações pedidas (a reprovação do social vira
// cs_rework_events; o ajuste do cliente e toda "pedir alteração" ficam no ops_log da transição).
// O card aberto mostra isto no lugar do modal de "demanda" que o designer tinha à parte.

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";

export interface EntregaArte { versao: number; por: string; em: string; substituida: boolean; motivoRevisao: string | null }
export interface AlteracaoArte { em: string; por: string | null; motivo: string | null; origem: "social" | "transicao" }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Card inválido" }, { status: 400 });

  const [entregas, retrabalho, ops] = await Promise.all([
    supabaseAdmin.from("creative_deliveries").select("version, delivered_by, delivered_at, status, revision_reason")
      .eq("card_id", id).order("version", { ascending: false }).limit(30),
    supabaseAdmin.from("cs_rework_events").select("created_at, reviewed_by, reason")
      .eq("card_id", id).order("created_at", { ascending: false }).limit(30),
    supabaseAdmin.from("ops_log").select("created_at, actor, after")
      .eq("card_id", id).eq("action", "design:pedir_alteracao").order("created_at", { ascending: false }).limit(30),
  ]);
  if (entregas.error) return NextResponse.json({ error: entregas.error.message }, { status: 500 });

  const alteracoes: AlteracaoArte[] = [];
  for (const r of retrabalho.data ?? []) {
    alteracoes.push({ em: r.created_at as string, por: (r.reviewed_by as string) ?? null, motivo: (r.reason as string) ?? null, origem: "social" });
  }
  // A transição registra toda alteração (social, cliente, CS). A do social já veio acima: só entra a
  // que não tem par no retrabalho (mesmo minuto) — ajuste do cliente no portal ou no WhatsApp.
  const minuto = (s: string) => s.slice(0, 16);
  const jaTem = new Set(alteracoes.map((a) => minuto(a.em)));
  for (const o of ops.data ?? []) {
    const em = o.created_at as string;
    if (jaTem.has(minuto(em))) continue;
    const depois = (o.after as { card?: { alteracao_motivo?: string | null } } | null)?.card;
    alteracoes.push({ em, por: (o.actor as string) ?? null, motivo: depois?.alteracao_motivo ?? null, origem: "transicao" });
  }
  alteracoes.sort((a, b) => b.em.localeCompare(a.em));

  return NextResponse.json({
    entregas: (entregas.data ?? []).map((e): EntregaArte => ({
      versao: e.version as number,
      por: (e.delivered_by as string) ?? "",
      em: e.delivered_at as string,
      substituida: e.status === "substituida",
      motivoRevisao: (e.revision_reason as string) ?? null,
    })),
    alteracoes,
  });
}
