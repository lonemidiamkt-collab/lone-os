export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { fetchClientCsRules } from "@/lib/supabase/queries";
import { loadBriefingCombinado } from "@/lib/cs/load-briefing";
import { gerarLegenda } from "@/lib/cs/legenda";
import { describeImage } from "@/lib/cs/vision";
import { carregarArtesParaIa } from "@/lib/conteudo/artes-para-ia-server";
import { descricaoDasArtes } from "@/lib/conteudo/artes-para-ia";

/**
 * Quantas artes a legenda descreve (uma chamada de visão por arte, em paralelo).
 * 24/10/2026 (auditoria de erro recuperável, 2.11): descrevia só a capa do card — num carrossel a
 * legenda falava da 1ª arte, e quando a capa era a referência do social, falava da referência.
 * Agora são as artes da ENTREGA ATUAL, na ordem; a tela diz quantas a IA viu.
 */
const MAX_ARTES = 5;

// Busca a arte (image_url do card) e descreve o que aparece nela por visão. É isso que faz a
// legenda BATER com a arte (antes ela escrevia só do nicho do cliente e descasava). Nunca lança.
async function descreverArteDoCard(imageUrl?: string | null): Promise<string | undefined> {
  if (!imageUrl) return undefined;
  try {
    if (imageUrl.startsWith("data:")) {
      const v = await describeImage(imageUrl);
      return v.ok && v.descricao ? v.descricao : undefined;
    }
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return undefined;
    const mime = res.headers.get("content-type") || "image/jpeg";
    if (!mime.startsWith("image/")) return undefined;
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    const v = await describeImage(b64, mime);
    return v.ok && v.descricao ? v.descricao : undefined;
  } catch {
    return undefined; // arte inacessível → cai no modo genérico (título/briefing)
  }
}

// POST /api/cs/legenda { cardId } — gera a legenda pronta do post (não salva; a UI guarda no
// campo caption quando o social confirmar). Usa o briefing do cliente (o que acabamos de anexar).
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!isOpenAIConfigured()) return NextResponse.json({ error: "IA não configurada" }, { status: 503 });

  const { cardId } = (await req.json().catch(() => ({}))) as { cardId?: string };
  if (!cardId) return NextResponse.json({ error: "cardId obrigatório" }, { status: 400 });

  const { data: card } = await supabaseAdmin
    .from("content_cards").select("id, title, briefing, format, client_id, client_name, image_url").eq("id", cardId).maybeSingle();
  if (!card) return NextResponse.json({ error: "card não encontrado" }, { status: 404 });

  const { data: cli } = await supabaseAdmin
    .from("clients").select("name, nome_fantasia, nicho, industry, fixed_briefing, campaign_briefing").eq("id", card.client_id as string).maybeSingle();
  const briefing = await loadBriefingCombinado(card.client_id as string, (cli?.fixed_briefing as string) || (cli?.campaign_briefing as string));
  const rules = (await fetchClientCsRules(card.client_id as string)).filter((r) => r.escopo !== "roteiro").map((r) => `${r.texto} (${r.escopo})`);
  // A legenda BATE com a arte: descreve as artes ENTREGUES (nunca a referência), na ordem.
  const lidas = await carregarArtesParaIa(cardId, card.image_url as string | null, MAX_ARTES);
  if (!lidas.ok) return NextResponse.json({ error: `Não consegui ler as artes do card (${lidas.erro}) — tente de novo.` }, { status: 500 });
  const escolha = lidas.artes;
  const descricoes = await Promise.all(escolha.artes.map((a) => descreverArteDoCard(a.url)));
  const vistas = descricoes.filter(Boolean).length;
  const arteDescricao = descricaoDasArtes(descricoes);

  const r = await gerarLegenda({
    clienteNome: (cli?.nome_fantasia as string) || (cli?.name as string) || (card.client_name as string) || "Cliente",
    clienteNicho: (cli?.nicho as string) || (cli?.industry as string) || undefined,
    briefing, regras: rules,
    titulo: (card.title as string) || "post",
    briefingCard: (card.briefing as string) || undefined,
    formato: (card.format as string) || undefined,
    arteDescricao,
  });
  if (!r.ok || !r.data) return NextResponse.json({ error: r.error || "falha ao gerar" }, { status: 500 });
  // O que a IA olhou — a tela mostra junto da sugestão ("vendo 3 de 3 artes" / "sem arte entregue").
  const nota = escolha.total === 0
    ? "Sem arte entregue no card: a legenda foi escrita pelo tema e pelo briefing — confira quando a arte chegar."
    : vistas === 0
      ? "Não consegui ver a arte: a legenda foi escrita pelo tema e pelo briefing — confira se bate com a arte."
      : `Escrita vendo ${vistas} de ${escolha.total} arte${escolha.total > 1 ? "s" : ""} da entrega.`;
  return NextResponse.json({ legenda: r.data.legenda, hashtags: r.data.hashtags, artes: { vistas, total: escolha.total }, nota });
}
