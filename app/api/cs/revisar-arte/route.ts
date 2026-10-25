export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { fetchClientCsRules } from "@/lib/supabase/queries";
import { loadBriefingCombinado } from "@/lib/cs/load-briefing";
import { revisarArte } from "@/lib/cs/revisao-arte";
import { carregarArtesParaIa } from "@/lib/conteudo/artes-para-ia-server";
import { resumoDaConferencia, type ConferenciaDaArte } from "@/lib/conteudo/artes-para-ia";

// POST /api/cs/revisar-arte { cardId } — "Revisar arte" no card: confere as artes ENTREGUES contra o
// briefing, por IA de visão. Só roda em imagem pública direta (não em link de Drive).
//
// 24/10/2026 (auditoria de erro recuperável, 2.10): pegava a capa do card ou o 1º anexo — em geral
// a REFERÊNCIA do social — e dizia "sem erros" sobre a imagem errada. Agora confere TODAS as artes
// da entrega atual (a mesma escolha do "Enviar pro cliente"), uma por uma, e devolve quais viu
// (miniaturas na tela), quais não conseguiu ver e o que ficou de fora.

/** Quantas artes a IA confere ao mesmo tempo. */
const EM_PARALELO = 4;
/** Não começa arte nova depois disto — a resposta precisa voltar antes do proxy desistir (~100 s). */
const ORCAMENTO_MS = 70_000;

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!isOpenAIConfigured()) return NextResponse.json({ error: "A IA não está configurada no servidor — confira a arte à mão." }, { status: 503 });

  const { cardId } = (await req.json().catch(() => ({}))) as { cardId?: string };
  if (!cardId) return NextResponse.json({ error: "cardId obrigatório" }, { status: 400 });

  const { data: card, error: eCard } = await supabaseAdmin
    .from("content_cards").select("id, title, briefing, image_url, client_id").eq("id", cardId).maybeSingle();
  if (eCard) return NextResponse.json({ error: `Não consegui ler o card: ${eCard.message}` }, { status: 500 });
  if (!card) return NextResponse.json({ error: "card não encontrado" }, { status: 404 });

  const lidas = await carregarArtesParaIa(cardId, card.image_url as string | null, Infinity);
  if (!lidas.ok) return NextResponse.json({ error: `Não consegui revisar: ${lidas.erro}.` }, { status: 500 });
  const escolha = lidas.artes;
  if (!escolha.artes.length) {
    return NextResponse.json({ error: escolha.erro ?? "Não há arte de entrega com imagem para revisar." }, { status: 422 });
  }

  const { data: cli } = await supabaseAdmin
    .from("clients").select("name, nome_fantasia, fixed_briefing, campaign_briefing").eq("id", card.client_id as string).maybeSingle();
  const briefing = await loadBriefingCombinado(card.client_id as string, (cli?.fixed_briefing as string) || (cli?.campaign_briefing as string));
  const rules = (await fetchClientCsRules(card.client_id as string)).filter((r) => r.escopo !== "roteiro").map((r) => `${r.texto} (${r.escopo})`);
  const clienteNome = (cli?.nome_fantasia as string) || (cli?.name as string) || "Cliente";
  const temaEsperado = `${card.title as string}${card.briefing ? ` — ${(card.briefing as string).slice(0, 300)}` : ""}`;

  const total = escolha.artes.length;
  const inicio = Date.now();
  const resultados: ConferenciaDaArte[] = new Array(total);
  let proxima = 0;
  const trabalhador = async () => {
    while (proxima < total) {
      const i = proxima++;
      const a = escolha.artes[i];
      if (Date.now() - inicio > ORCAMENTO_MS) {
        resultados[i] = { n: a.n, url: a.url, vista: false, motivo: "o tempo da conferência acabou", problemas: [] };
        continue;
      }
      const r = await revisarArte({ imageUrl: a.url, clienteNome, briefing, regras: rules, temaEsperado, posicao: { n: a.n, total } });
      resultados[i] = r.ok && r.data
        ? { n: a.n, url: a.url, vista: true, problemas: r.data.ok ? [] : r.data.problemas }
        : { n: a.n, url: a.url, vista: false, motivo: r.error ?? "erro desconhecido", problemas: [] };
    }
  };
  await Promise.all(Array.from({ length: Math.min(EM_PARALELO, total) }, trabalhador));

  const resumo = resumoDaConferencia(resultados, escolha);
  return NextResponse.json({
    ok: resumo.ok,
    resumo: resumo.resumo,
    problemas: resumo.problemas,
    nota: resumo.nota,
    artes: resultados.map((r) => ({ n: r.n, url: r.url, vista: r.vista, motivo: r.motivo ?? null })),
    total: escolha.total,
  });
}
