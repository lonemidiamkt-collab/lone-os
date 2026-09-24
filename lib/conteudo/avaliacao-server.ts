// lib/conteudo/avaliacao-server.ts — grava a AVALIAÇÃO da arte (aprovada / alteração pedida).
// Server-only. Saiu de /api/content-cards/update para servir também à transição de design
// (lib/conteudo/producao-server.ts): a reprovação do social é uma avaliação E uma volta pro designer.

import { supabaseAdmin } from "@/lib/supabase/server";

export interface Avaliacao {
  status: "approved" | "rejected" | string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reason?: string | null;
}

/**
 * Uma avaliação vigente por card. INSERT-FIRST (não delete-first): grava a nova e SÓ ENTÃO apaga as
 * anteriores — se o insert falhar, o card não fica sem avaliação nenhuma; e dois revisores juntos não
 * deixam duas linhas.
 *
 * Reprovação também vai para cs_rework_events (append-only): o delete acima apaga o histórico, e a
 * taxa de retrabalho por social/cliente é medida por esse log.
 */
export async function registrarAvaliacao(cardId: string, a: Avaliacao): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { data: nova, error } = await supabaseAdmin.from("content_approvals").insert({
    card_id: cardId,
    status: a.status,
    reviewed_by: a.reviewedBy ?? null,
    reviewed_at: a.reviewedAt ?? null,
    reason: a.reason ?? null,
  }).select("id").single();
  if (error) return { ok: false, erro: error.message };
  if (nova?.id) {
    await supabaseAdmin.from("content_approvals").delete().eq("card_id", cardId).neq("id", nova.id as string);
  }

  if (a.status === "rejected") {
    try {
      const { data: card } = await supabaseAdmin
        .from("content_cards").select("client_id, client_name, social_media").eq("id", cardId).maybeSingle();
      await supabaseAdmin.from("cs_rework_events").insert({
        card_id: cardId,
        client_id: card?.client_id ?? null,
        client_name: card?.client_name ?? null,
        social_media: card?.social_media ?? null,
        reviewed_by: a.reviewedBy ?? null,
        reason: a.reason ?? null,
      });
    } catch (e) {
      console.error("[avaliacao] rework log falhou (ignorado):", e);
    }
  }
  return { ok: true };
}
