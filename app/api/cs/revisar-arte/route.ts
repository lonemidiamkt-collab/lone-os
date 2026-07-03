export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { fetchClientCsRules } from "@/lib/supabase/queries";
import { loadBriefingCombinado } from "@/lib/cs/load-briefing";
import { revisarArte } from "@/lib/cs/revisao-arte";

const isImageUrl = (u: string) => /^https?:\/\//.test(u) && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u);

// POST /api/cs/revisar-arte { cardId } — revisa a arte ENTREGUE (card.image_url) contra o briefing,
// por IA de visão. Só roda em imagem pública direta (não em link de Drive).
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!isOpenAIConfigured()) return NextResponse.json({ error: "IA não configurada" }, { status: 503 });

  const { cardId } = (await req.json().catch(() => ({}))) as { cardId?: string };
  if (!cardId) return NextResponse.json({ error: "cardId obrigatório" }, { status: 400 });

  const { data: card } = await supabaseAdmin
    .from("content_cards").select("id, title, briefing, image_url, client_id").eq("id", cardId).maybeSingle();
  if (!card) return NextResponse.json({ error: "card não encontrado" }, { status: 404 });

  // Arte a revisar = capa do card (a entrega vira a capa). Fallback: 1º anexo do card.
  let arteUrl = (card.image_url as string) || "";
  if (!isImageUrl(arteUrl)) {
    const { data: att } = await supabaseAdmin
      .from("card_attachments").select("url").eq("card_id", cardId).order("position", { ascending: true }).limit(1).maybeSingle();
    arteUrl = (att?.url as string) || arteUrl;
  }
  if (!isImageUrl(arteUrl)) {
    return NextResponse.json({ error: "Sem imagem direta pra revisar (a arte pode estar como link do Drive)." }, { status: 422 });
  }

  const { data: cli } = await supabaseAdmin
    .from("clients").select("name, nome_fantasia, fixed_briefing, campaign_briefing").eq("id", card.client_id as string).maybeSingle();
  const briefing = await loadBriefingCombinado(card.client_id as string, (cli?.fixed_briefing as string) || (cli?.campaign_briefing as string));
  const rules = (await fetchClientCsRules(card.client_id as string)).filter((r) => r.escopo !== "roteiro").map((r) => `${r.texto} (${r.escopo})`);

  const r = await revisarArte({
    imageUrl: arteUrl,
    clienteNome: (cli?.nome_fantasia as string) || (cli?.name as string) || "Cliente",
    briefing, regras: rules,
    temaEsperado: `${card.title as string}${card.briefing ? ` — ${(card.briefing as string).slice(0, 300)}` : ""}`,
  });
  if (!r.ok || !r.data) return NextResponse.json({ error: r.error || "falha na revisão" }, { status: 500 });
  return NextResponse.json({ ...r.data });
}
