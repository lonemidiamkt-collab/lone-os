export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { fetchClientCsRules } from "@/lib/supabase/queries";
import { loadBriefingCombinado } from "@/lib/cs/load-briefing";
import { revisarPost } from "@/lib/cs/revisao-post";

const isImageUrl = (u: string) => /^https?:\/\//.test(u) && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u);

// POST /api/cs/revisar-post { cardId } — REVISÃO FINAL do post (arte + legenda + hashtags) antes
// de ir ao cliente/ar: coerência legenda×arte, preço inventado, palavra proibida, dado divergente,
// português. Funciona sem arte (revisa só a legenda). Não salva nada — sugestão pro social decidir.
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!isOpenAIConfigured()) return NextResponse.json({ error: "IA não configurada" }, { status: 503 });

  const { cardId, caption: captionBody, hashtags: hashtagsBody } =
    (await req.json().catch(() => ({}))) as { cardId?: string; caption?: string; hashtags?: string };
  if (!cardId) return NextResponse.json({ error: "cardId obrigatório" }, { status: 400 });

  const { data: card } = await supabaseAdmin
    .from("content_cards")
    .select("id, title, briefing, caption, hashtags, format, image_url, client_id, client_name")
    .eq("id", cardId).maybeSingle();
  if (!card) return NextResponse.json({ error: "card não encontrado" }, { status: 404 });

  // Arte = capa do card; fallback: 1º anexo. Sem imagem direta → revisa só a legenda (não bloqueia).
  let arteUrl = (card.image_url as string) || "";
  if (!isImageUrl(arteUrl)) {
    const { data: att } = await supabaseAdmin
      .from("card_attachments").select("url").eq("card_id", cardId).order("position", { ascending: true }).limit(1).maybeSingle();
    arteUrl = (att?.url as string) || arteUrl;
  }
  const temArte = isImageUrl(arteUrl);
  // Legenda/hashtags do editor (podem não estar salvas) têm prioridade sobre o banco.
  const legenda = typeof captionBody === "string" ? captionBody : ((card.caption as string) || "");
  const hashtags = typeof hashtagsBody === "string" ? hashtagsBody : ((card.hashtags as string) || "");
  if (!temArte && !legenda.trim()) {
    return NextResponse.json({ error: "Nada pra revisar ainda: o card não tem arte nem legenda." }, { status: 422 });
  }

  const { data: cli } = await supabaseAdmin
    .from("clients").select("name, nome_fantasia, nicho, industry, fixed_briefing, campaign_briefing")
    .eq("id", card.client_id as string).maybeSingle();
  const briefing = await loadBriefingCombinado(card.client_id as string, (cli?.fixed_briefing as string) || (cli?.campaign_briefing as string));
  const rules = (await fetchClientCsRules(card.client_id as string)).filter((r) => r.escopo !== "roteiro").map((r) => `${r.texto} (${r.escopo})`);

  const r = await revisarPost({
    imageUrl: temArte ? arteUrl : undefined,
    clienteNome: (cli?.nome_fantasia as string) || (cli?.name as string) || (card.client_name as string) || "Cliente",
    clienteNicho: (cli?.nicho as string) || (cli?.industry as string) || undefined,
    titulo: (card.title as string) || "post",
    legenda,
    hashtags: hashtags || undefined,
    briefing, regras: rules,
    formato: (card.format as string) || undefined,
  });
  if (!r.ok || !r.data) return NextResponse.json({ error: r.error || "falha na revisão" }, { status: 500 });
  return NextResponse.json({ ...r.data, comArte: temArte });
}
