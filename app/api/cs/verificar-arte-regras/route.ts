export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { fetchClientCsRules, insertNotification } from "@/lib/supabase/queries";
import { loadBriefingCombinado } from "@/lib/cs/load-briefing";
import { revisarArte } from "@/lib/cs/revisao-arte";

const isImageUrl = (u: string) => /^https?:\/\//.test(u) && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u);

// POST /api/cs/verificar-arte-regras { cardId } — VERIFICAÇÃO AUTOMÁTICA da arte entregue contra as
// REGRAS do cliente (ex: "não usar vermelho"). Roda no fluxo de entrega do designer.
// Regra de custo (pedido do Roberto): SÓ chama a IA de visão se o cliente TEM regras cadastradas —
// clientes sem regra não gastam IA. Se a IA achar problema, cria uma NOTIFICAÇÃO pro time.
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { cardId } = (await req.json().catch(() => ({}))) as { cardId?: string };
  if (!cardId) return NextResponse.json({ error: "cardId obrigatório" }, { status: 400 });

  const { data: card } = await supabaseAdmin
    .from("content_cards").select("id, title, briefing, image_url, client_id, client_name, social_media").eq("id", cardId).maybeSingle();
  if (!card) return NextResponse.json({ error: "card não encontrado" }, { status: 404 });

  // GATE 1: só verifica se o cliente tem REGRAS de arte cadastradas (não roteiro). Sem regra → pula (sem IA).
  const rules = (await fetchClientCsRules(card.client_id as string)).filter((r) => r.escopo !== "roteiro");
  if (rules.length === 0) return NextResponse.json({ skipped: "sem regras" });

  if (!isOpenAIConfigured()) return NextResponse.json({ skipped: "IA não configurada" });

  // Arte a revisar = capa (image_url) ou 1º anexo.
  let arteUrl = (card.image_url as string) || "";
  if (!isImageUrl(arteUrl)) {
    const { data: att } = await supabaseAdmin
      .from("card_attachments").select("url").eq("card_id", cardId).order("position", { ascending: true }).limit(1).maybeSingle();
    arteUrl = (att?.url as string) || arteUrl;
  }
  if (!isImageUrl(arteUrl)) return NextResponse.json({ skipped: "sem imagem direta (pode ser link do Drive)" });

  const { data: cli } = await supabaseAdmin
    .from("clients").select("name, nome_fantasia, fixed_briefing, campaign_briefing").eq("id", card.client_id as string).maybeSingle();
  const briefing = await loadBriefingCombinado(card.client_id as string, (cli?.fixed_briefing as string) || (cli?.campaign_briefing as string));
  const regras = rules.map((r) => `${r.texto} (${r.escopo})`);

  const r = await revisarArte({
    imageUrl: arteUrl,
    clienteNome: (cli?.nome_fantasia as string) || (cli?.name as string) || (card.client_name as string) || "Cliente",
    briefing, regras,
    temaEsperado: `${card.title as string}${card.briefing ? ` — ${(card.briefing as string).slice(0, 300)}` : ""}`,
  });
  if (!r.ok || !r.data) return NextResponse.json({ error: r.error || "falha na revisão" }, { status: 500 });

  // Se a IA apontou problema (arte NÃO ok), notifica o time — a arte pode estar violando uma regra
  // do cliente. O detalhe fica na revisão (o social/designer abre o card e clica em "Revisar arte").
  const problemas = (r.data.problemas ?? []) as string[];
  if (!r.data.ok && problemas.length > 0) {
    const quem = (card.social_media as string) ? `@${(card.social_media as string).split(" ")[0]} ` : "";
    await insertNotification({
      type: "content",
      title: `⚠️ Arte pode violar regra — ${(card.client_name as string) || "cliente"}`,
      body: `${quem}"${card.title as string}": ${r.data.resumo || problemas[0]}. Abra o card e clique em "Revisar arte" pra ver o detalhe.`,
      clientId: card.client_id as string,
    });
    return NextResponse.json({ notified: true, ...r.data });
  }
  return NextResponse.json({ ...r.data });
}
