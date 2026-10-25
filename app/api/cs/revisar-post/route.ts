export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { fetchClientCsRules } from "@/lib/supabase/queries";
import { loadBriefingCombinado } from "@/lib/cs/load-briefing";
import { revisarPost } from "@/lib/cs/revisao-post";
import { baixarComoDataUri } from "@/lib/cs/revisao-arte";
import { carregarArtesParaIa } from "@/lib/conteudo/artes-para-ia-server";
import { notaDeCobertura } from "@/lib/conteudo/artes-para-ia";

// POST /api/cs/revisar-post { cardId } — REVISÃO FINAL do post (arte + legenda + hashtags) antes
// de ir ao cliente/ar: coerência legenda×arte, preço inventado, palavra proibida, dado divergente,
// português. Funciona sem arte (revisa só a legenda). Não salva nada — sugestão pro social decidir.
//
// 24/10/2026 (auditoria de erro recuperável, 2.10): olhava a capa do card ou o 1º anexo — em geral
// a REFERÊNCIA do social — e num carrossel conferia a legenda contra uma arte só. Agora vão as artes
// da ENTREGA ATUAL (até MAX_ARTES, numa chamada só, na ordem) e a resposta diz quais a IA viu.
const MAX_ARTES = 10; // imagens numa chamada (custo/tamanho do pedido); acima disso, a tela diz quantas ficaram de fora

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!isOpenAIConfigured()) return NextResponse.json({ error: "IA não configurada" }, { status: 503 });

  const { cardId, caption: captionBody, hashtags: hashtagsBody } =
    (await req.json().catch(() => ({}))) as { cardId?: string; caption?: string; hashtags?: string };
  if (!cardId) return NextResponse.json({ error: "cardId obrigatório" }, { status: 400 });

  const { data: card, error: eCard } = await supabaseAdmin
    .from("content_cards")
    .select("id, title, briefing, caption, hashtags, format, image_url, client_id, client_name")
    .eq("id", cardId).maybeSingle();
  if (eCard) return NextResponse.json({ error: `Não consegui ler o card: ${eCard.message}` }, { status: 500 });
  if (!card) return NextResponse.json({ error: "card não encontrado" }, { status: 404 });

  // Artes = as da entrega atual (nunca a referência). Leitura que falha não vira "post sem arte".
  const lidas = await carregarArtesParaIa(cardId, card.image_url as string | null, MAX_ARTES);
  if (!lidas.ok) return NextResponse.json({ error: `Não consegui revisar: ${lidas.erro}.` }, { status: 500 });
  const escolha = lidas.artes;
  // Baixa e reduz aqui (a OpenAI desistia de baixar arte grande — ver baixarComoDataUri).
  const preparadas = await Promise.all(escolha.artes.map(async (a) => ({ ...a, dataUri: await baixarComoDataUri(a.url) })));
  const vistas = preparadas.filter((a) => a.dataUri);
  const temArte = vistas.length > 0;
  // Legenda/hashtags do editor (podem não estar salvas) têm prioridade sobre o banco.
  const legenda = typeof captionBody === "string" ? captionBody : ((card.caption as string) || "");
  const hashtags = typeof hashtagsBody === "string" ? hashtagsBody : ((card.hashtags as string) || "");
  if (!temArte && !legenda.trim()) {
    return NextResponse.json({ error: escolha.artes.length
      ? "Não consegui baixar a arte e o card não tem legenda — nada para revisar agora. Tente de novo."
      : "Nada pra revisar ainda: o card não tem arte entregue nem legenda." }, { status: 422 });
  }

  const { data: cli } = await supabaseAdmin
    .from("clients").select("name, nome_fantasia, nicho, industry, fixed_briefing, campaign_briefing")
    .eq("id", card.client_id as string).maybeSingle();
  const briefing = await loadBriefingCombinado(card.client_id as string, (cli?.fixed_briefing as string) || (cli?.campaign_briefing as string));
  const rules = (await fetchClientCsRules(card.client_id as string)).filter((r) => r.escopo !== "roteiro").map((r) => `${r.texto} (${r.escopo})`);

  const r = await revisarPost({
    imagens: vistas.map((a) => a.dataUri as string),
    clienteNome: (cli?.nome_fantasia as string) || (cli?.name as string) || (card.client_name as string) || "Cliente",
    clienteNicho: (cli?.nicho as string) || (cli?.industry as string) || undefined,
    titulo: (card.title as string) || "post",
    legenda,
    hashtags: hashtags || undefined,
    briefing, regras: rules,
    formato: (card.format as string) || undefined,
  });
  if (!r.ok || !r.data) return NextResponse.json({ error: r.error || "falha na revisão" }, { status: 500 });
  // O que a IA viu, para a tela mostrar (miniaturas) — e o que não viu, para ninguém achar que viu tudo.
  const naoBaixadas = preparadas.filter((a) => !a.dataUri);
  const nota = [
    escolha.artes.length || escolha.total ? notaDeCobertura(escolha, vistas.length) : "Sem arte entregue: revisei só a legenda.",
    naoBaixadas.length ? `Não consegui baixar ${naoBaixadas.map((a) => `a arte ${a.n}`).join(", ")} — confira à mão.` : "",
  ].filter(Boolean).join(" ");
  // Arte que não foi vista não ganha selo de aprovado (falha nunca vira sucesso).
  const parcial = naoBaixadas.length > 0 && r.data.aprovado;
  return NextResponse.json({
    ...r.data,
    aprovado: parcial ? false : r.data.aprovado,
    resumo: parcial ? `${r.data.resumo} — mas ${naoBaixadas.length === 1 ? "1 arte não foi vista" : `${naoBaixadas.length} artes não foram vistas`}` : r.data.resumo,
    comArte: temArte,
    artes: preparadas.map((a) => ({ n: a.n, url: a.url, vista: !!a.dataUri, motivo: a.dataUri ? null : "não consegui baixar a imagem" })),
    total: escolha.total,
    nota,
  });
}
