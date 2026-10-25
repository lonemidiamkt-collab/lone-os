// lib/conteudo/artes-para-ia-server.ts — lê do banco o que lib/conteudo/artes-para-ia.ts decide:
// os anexos do card e a entrega atual. Server-only. Leitura que FALHA volta como falha — "sem arte"
// seria mentira (a revisão diria que não havia o que conferir).

import { supabaseAdmin } from "@/lib/supabase/server";
import { artesParaIa, type ArtesParaIa } from "@/lib/conteudo/artes-para-ia";
import type { AnexoDoCard } from "@/lib/cs/envio-aprovacao";

export async function carregarArtesParaIa(
  cardId: string,
  capaDoCard: string | null | undefined,
  max: number,
): Promise<{ ok: true; artes: ArtesParaIa } | { ok: false; erro: string }> {
  const [atts, entrega] = await Promise.all([
    supabaseAdmin.from("card_attachments").select("id, url, position, tipo, delivery_id").eq("card_id", cardId).order("position", { ascending: true }),
    supabaseAdmin.from("creative_deliveries").select("id").eq("card_id", cardId).eq("status", "entregue")
      .order("version", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (atts.error) return { ok: false, erro: `não consegui ler as artes do card (${atts.error.message})` };
  if (entrega.error) return { ok: false, erro: `não consegui ler a entrega da arte (${entrega.error.message})` };
  return { ok: true, artes: artesParaIa((atts.data ?? []) as AnexoDoCard[], (entrega.data?.id as string) ?? null, capaDoCard ?? null, max) };
}
