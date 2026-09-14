// lib/meta/criativos.ts — guarda o criativo dos anúncios que gastaram na janela do sync.
//
// hash = o que define a VERSÃO do criativo (tipo, vídeo, texto, título, id do criativo). A
// miniatura fica de fora do hash: é URL assinada, muda toda hora sem o criativo mudar.

import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { CriativoAnuncio, ProviderMeta } from "@/lib/meta/gateway";

export function hashCriativo(c: CriativoAnuncio): string {
  return createHash("sha1").update([c.creativeId ?? "", c.tipo ?? "", c.videoId ?? "", c.title ?? "", c.body ?? ""].join("|")).digest("hex").slice(0, 16);
}

export async function guardarCriativos(p: {
  provider: ProviderMeta; token: string; clientId: string; accountId: string; adIds: string[]; dry?: boolean;
}): Promise<{ lidos: number; gravados: number }> {
  if (!p.adIds.length) return { lidos: 0, gravados: 0 };
  const lista = await p.provider.criativos({ token: p.token, adIds: p.adIds });
  const agora = new Date().toISOString();
  const linhas = lista.map((c) => ({
    ad_id: c.adId, hash: hashCriativo(c), client_id: p.clientId, meta_ad_account_id: p.accountId,
    ad_name: c.adName ?? null, effective_status: c.effectiveStatus ?? null, creative_id: c.creativeId ?? null,
    tipo: c.tipo ?? null, thumb_url: c.thumbUrl ?? null, image_url: c.imageUrl ?? null, video_id: c.videoId ?? null,
    body: c.body ?? null, title: c.title ?? null, cta: c.cta ?? null, asset_feed_spec: c.assetFeedSpec ?? null,
    capturado_em: agora,
  }));
  if (p.dry || !linhas.length) return { lidos: lista.length, gravados: 0 };
  // Mesma versão: renova miniatura/status/capturado_em (primeira_vez fica). Versão nova: linha nova.
  const { error } = await supabaseAdmin.from("creative_snapshots").upsert(linhas, { onConflict: "ad_id,hash" });
  if (error) throw new Error(`creative_snapshots: ${error.message}`);
  return { lidos: lista.length, gravados: linhas.length };
}
