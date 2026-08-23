export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { chatJson, isOpenAIConfigured } from "@/lib/ai/openai";
import { DEFINICAO_DE_REGRA, SCHEMA_REGRAS, filtrarRegras, gravarRegras } from "@/lib/cs/regras";
import { fetchClientCsRules } from "@/lib/supabase/queries";

// POST /api/system/cs-aprender-cards — o agente aprende com o que a EQUIPE escreve na plataforma.
//
// PRA QUE (Roberto, 22/08): "quando o social mídia ou designer envia um post e detalhes da criação
// em texto na plataforma, nosso agente poderia coletar esses dados e guardar como briefing".
//
// Medido antes de escrever: em 90 dias a equipe preencheu 478 briefings de card e deixou 249
// comentários, e NADA disso alimentava o aprendizado. É a fonte mais rica que existe — escrita por
// quem conhece o cliente — e estava intocada. Também é o caminho para os 18 clientes ativos sem
// nenhuma regra: eles são quietos no WhatsApp, mas têm cards.
//
// A REGRA DE OURO AQUI É RECORRÊNCIA. Um briefing de card fala de UM post ("post do dia dos pais,
// fundo azul"). Isso não é regra do cliente. Só vira regra o que se REPETE em vários cards — aí
// deixou de ser sobre a peça e passou a ser sobre o cliente.
//
// ?dry=1 não grava · ?clientId=… roda um cliente só · Cron: domingo, depois do cs-briefing-update.

const MIN_CARDS = 4;      // menos que isso não dá pra ver repetição
const JANELA_DIAS = 120;  // trimestre + folga: regra de cliente aparece devagar

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const onlyClient = req.nextUrl.searchParams.get("clientId");
  if (!isOpenAIConfigured()) return NextResponse.json({ error: "IA não configurada" }, { status: 503 });

  let q = supabaseAdmin.from("clients").select("id, name, nome_fantasia").or("active.is.null,active.eq.true");
  if (onlyClient) q = supabaseAdmin.from("clients").select("id, name, nome_fantasia").eq("id", onlyClient);
  const { data: clients } = await q;

  const desde = new Date(Date.now() - JANELA_DIAS * 86400000).toISOString();
  const resultados: { cliente: string; cards: number; novas: number; textos: string[] }[] = [];
  const semMaterial: string[] = [];

  for (const c of clients ?? []) {
    const nome = (c.nome_fantasia as string) || (c.name as string);

    const { data: cards } = await supabaseAdmin
      .from("content_cards").select("id, title, briefing, observations")
      .eq("client_id", c.id as string).gte("created_at", desde)
      .order("created_at", { ascending: false }).limit(60);

    const comTexto = (cards ?? []).filter((k) =>
      ((k.briefing as string) || "").trim().length > 25 || ((k.observations as string) || "").trim().length > 25);
    if (comTexto.length < MIN_CARDS) { semMaterial.push(nome); continue; }

    // Comentários dos cards: é onde o social explica a correção ao designer ("o cliente pediu o
    // telefone maior de novo") — normalmente mais revelador que o briefing.
    const { data: coments } = await supabaseAdmin
      .from("card_comments").select("body")
      .in("card_id", comTexto.map((k) => k.id as string))
      .order("created_at", { ascending: false }).limit(80);

    const material = [
      ...comTexto.map((k) => `[card] ${k.title as string}\n${((k.briefing as string) || "").slice(0, 400)}${(k.observations as string) ? `\nobs: ${(k.observations as string).slice(0, 200)}` : ""}`),
      ...(coments ?? []).map((m) => `[comentário] ${String(m.body).slice(0, 300)}`),
    ].join("\n---\n").slice(0, 14000);

    const regrasAtuais = (await fetchClientCsRules(c.id as string)).map((r) => r.texto);

    const r = await chatJson<{ regras: { texto: string; tipo: string }[] }>({
      model: "gpt-4o-mini",
      schemaName: "regras_dos_cards",
      schema: SCHEMA_REGRAS,
      maxTokens: 700,
      temperature: 0,
      system:
        `Você lê os briefings e comentários que a EQUIPE de uma agência escreveu nos cards de ` +
        `conteúdo de UM cliente, ao longo de meses, e extrai as REGRAS daquele cliente.\n\n` +
        `${DEFINICAO_DE_REGRA}\n\n` +
        `CRITÉRIO DECISIVO — RECORRÊNCIA:\n` +
        `Cada card fala de um post específico. Um detalhe que aparece em UM card é sobre aquele ` +
        `post, NÃO é regra. Só devolva o que se REPETE em cards diferentes, ou o que a equipe ` +
        `escreveu como instrução permanente ("sempre", "esse cliente não gosta", "lembrar que").\n` +
        `- "post do dia dos pais, fundo azul" (um card) → NÃO é regra\n` +
        `- fundo azul aparece em 6 cards → visual: usar fundo azul, é o padrão do cliente\n` +
        `- "o cliente sempre pede o telefone maior" → copy/visual: destacar o telefone\n` +
        `Máximo 4 regras. Se nada se repetir, devolva lista vazia — é o resultado mais comum.`,
      user: `Cliente: ${nome}\n\n${regrasAtuais.length ? `Regras JÁ registradas (não repita):\n${regrasAtuais.slice(0, 40).map((x) => `- ${x}`).join("\n")}\n\n` : ""}Material da equipe (${comTexto.length} cards, ${(coments ?? []).length} comentários):\n${material}`,
    });
    if (!r.ok || !r.data) continue;

    const candidatas = filtrarRegras(r.data.regras).slice(0, 4);
    if (!candidatas.length) continue;

    if (dry) {
      resultados.push({ cliente: nome, cards: comTexto.length, novas: candidatas.length, textos: candidatas.map((x) => x.texto) });
      continue;
    }

    const { gravadas } = await gravarRegras(c.id as string, candidatas, {
      author: "IA (cards da equipe)",
      capPorDia: 4, // job semanal: teto próprio, não come a cota do aprendizado do dia a dia
    });
    if (gravadas.length) {
      resultados.push({ cliente: nome, cards: comTexto.length, novas: gravadas.length, textos: gravadas.map((x) => x.texto) });
    }
  }

  return NextResponse.json({
    ok: true, dry,
    clientes_com_regra_nova: resultados.length,
    clientes_sem_material: semMaterial.length,
    detalhe: resultados,
  });
}
