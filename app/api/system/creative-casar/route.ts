export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { comExecucao, anotar } from "@/lib/obs/correlacao";
import { hashDaUrl, distancia, LIMIAR_MESMA_ARTE } from "@/lib/imagem/phash";

// POST /api/system/creative-casar?max=150 — (1) calcula o phash dos anúncios e das artes entregues
// que ainda não têm; (2) casa anúncio ↔ arte do MESMO cliente pela distância; (3) preenche
// child_ad_id na genealogia quando a arte casada é uma variação replicada. Cron diário 07:35.
export async function POST(req: NextRequest) {
  const gate = await requireCronOrUser(req);
  if (gate) return gate;
  const max = Math.min(500, Math.max(10, Number(req.nextUrl.searchParams.get("max") ?? 150) || 150));
  return comExecucao({ origem: "cron:creative-casar", ator: "cron" }, async () => {
    let hashAnuncios = 0, hashArtes = 0, casados = 0, filhos = 0;
    const erros: string[] = [];

    // 1a. anúncios sem phash (versão mais recente por ad, com miniatura)
    const { data: cri } = await supabaseAdmin.from("creative_snapshots").select("ad_id, hash, thumb_url, image_url").is("phash", null).order("capturado_em", { ascending: false }).limit(max);
    for (const c of cri ?? []) {
      const url = (c.thumb_url as string) || (c.image_url as string);
      if (!url) continue;
      const h = await hashDaUrl(url);
      if (!h) continue;
      const { error } = await supabaseAdmin.from("creative_snapshots").update({ phash: h }).eq("ad_id", c.ad_id).eq("hash", c.hash);
      if (error) erros.push(`ad ${c.ad_id}: ${error.message.slice(0, 50)}`); else hashAnuncios++;
    }
    // 1b. artes entregues sem phash (últimos 120 dias; referência não conta)
    const desde = new Date(Date.now() - 120 * 864e5).toISOString();
    const { data: artes } = await supabaseAdmin.from("card_attachments").select("id, url").is("phash", null).neq("tipo", "referencia").gte("created_at", desde).order("created_at", { ascending: false }).limit(max);
    for (const a of artes ?? []) {
      const h = await hashDaUrl(a.url as string);
      if (!h) continue;
      const { error } = await supabaseAdmin.from("card_attachments").update({ phash: h }).eq("id", a.id);
      if (error) erros.push(`arte ${a.id}: ${error.message.slice(0, 50)}`); else hashArtes++;
    }

    // 2. casar: anúncios com phash e sem elo × artes do mesmo cliente
    const { data: semElo } = await supabaseAdmin.from("creative_snapshots").select("ad_id, hash, client_id, phash").not("phash", "is", null).is("content_card_id", null).limit(2000);
    const { data: artesHash } = await supabaseAdmin.from("card_attachments").select("id, card_id, phash").not("phash", "is", null).gte("created_at", desde).limit(5000);
    const cardIds = [...new Set((artesHash ?? []).map((a) => a.card_id as string))];
    const { data: cards } = cardIds.length ? await supabaseAdmin.from("content_cards").select("id, client_id, design_request_id").in("id", cardIds) : { data: [] as Record<string, unknown>[] };
    const cardInfo = new Map((cards ?? []).map((c) => [c.id as string, c]));
    const porCliente = new Map<string, { attId: string; cardId: string; phash: string }[]>();
    for (const a of artesHash ?? []) {
      const ci = cardInfo.get(a.card_id as string);
      if (!ci?.client_id) continue;
      const lista = porCliente.get(ci.client_id as string) ?? [];
      lista.push({ attId: a.id as string, cardId: a.card_id as string, phash: a.phash as string });
      porCliente.set(ci.client_id as string, lista);
    }
    const agora = new Date().toISOString();
    for (const s of semElo ?? []) {
      const cands = porCliente.get(s.client_id as string) ?? [];
      let melhor: { cardId: string; d: number } | null = null;
      for (const c of cands) { const d = distancia(s.phash as string, c.phash); if (d <= LIMIAR_MESMA_ARTE && (!melhor || d < melhor.d)) melhor = { cardId: c.cardId, d }; }
      if (!melhor) continue;
      const ci = cardInfo.get(melhor.cardId);
      const drId = (ci?.design_request_id as string) ?? null;
      const { error } = await supabaseAdmin.from("creative_snapshots").update({ content_card_id: melhor.cardId, design_request_id: drId, casado_em: agora }).eq("ad_id", s.ad_id).eq("hash", s.hash);
      if (error) { erros.push(`casar ${s.ad_id}: ${error.message.slice(0, 50)}`); continue; }
      casados++;
      // 3. genealogia: a arte casada é uma variação replicada? então o filho foi ao ar.
      if (drId) {
        const { data: lin } = await supabaseAdmin.from("creative_lineage").update({ child_ad_id: s.ad_id }).eq("child_design_request_id", drId).is("child_ad_id", null).select("id");
        filhos += lin?.length ?? 0;
      }
    }
    anotar(`casar: ${hashAnuncios} anúncios e ${hashArtes} artes com hash; ${casados} casados; ${filhos} filhos no ar`);
    return NextResponse.json({ ok: erros.length === 0, hashAnuncios, hashArtes, casados, filhos, erros: erros.slice(0, 8) });
  });
}
export const GET = POST;
