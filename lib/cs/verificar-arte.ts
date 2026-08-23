// lib/cs/verificar-arte.ts — confere a arte entregue contra as REGRAS do cliente, na hora da entrega.
//
// A lógica já existia em app/api/cs/verificar-arte-regras/route.ts desde que foi escrita — e NUNCA
// foi chamada por lugar nenhum: zero notificações geradas na base inteira. O núcleo saiu da rota
// pra cá para poder rodar do servidor, sem sessão de usuário, no momento em que o designer entrega.
//
// É a segunda metade do pedido do Roberto: o agente aprende a regra na correção do cliente
// (lib/cs/aprender-correcao.ts) e a COBRA aqui, antes da peça chegar ao cliente de novo.

import { supabaseAdmin } from "@/lib/supabase/server";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { fetchClientCsRules, insertNotification } from "@/lib/supabase/queries";
import { loadBriefingCombinado } from "@/lib/cs/load-briefing";
import { revisarArte } from "@/lib/cs/revisao-arte";

const isImageUrl = (u: string) => /^https?:\/\//.test(u) && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u);

export type ResultadoVerificacao =
  | { status: "pulado"; motivo: string }
  | { status: "ok" }
  | { status: "alertado"; problemas: string[]; resumo: string };

/**
 * Não lança nunca: verificar a arte é bônus no fluxo de entrega — se falhar, a entrega segue.
 * Só gasta IA quando o cliente TEM regra cadastrada (trava de custo pedida pelo Roberto).
 */
export async function verificarArteDoCard(cardId: string): Promise<ResultadoVerificacao> {
  try {
    const { data: card } = await supabaseAdmin
      .from("content_cards")
      .select("id, title, briefing, image_url, client_id, client_name, social_media")
      .eq("id", cardId).maybeSingle();
    if (!card?.client_id) return { status: "pulado", motivo: "card sem cliente" };

    // Regras de ARTE e gerais. Roteiro não conta — é outro produto.
    const rules = (await fetchClientCsRules(card.client_id as string)).filter((r) => r.escopo !== "roteiro");
    if (rules.length === 0) return { status: "pulado", motivo: "cliente sem regras" };
    if (!isOpenAIConfigured()) return { status: "pulado", motivo: "IA off" };

    let arteUrl = (card.image_url as string) || "";
    if (!isImageUrl(arteUrl)) {
      const { data: att } = await supabaseAdmin
        .from("card_attachments").select("url").eq("card_id", cardId)
        .order("position", { ascending: true }).limit(1).maybeSingle();
      arteUrl = (att?.url as string) || arteUrl;
    }
    // Entrega por link do Drive é comum aqui: sem imagem direta a visão não tem o que olhar.
    if (!isImageUrl(arteUrl)) return { status: "pulado", motivo: "sem imagem direta" };

    const { data: cli } = await supabaseAdmin
      .from("clients").select("name, nome_fantasia, fixed_briefing, campaign_briefing")
      .eq("id", card.client_id as string).maybeSingle();
    const briefing = await loadBriefingCombinado(
      card.client_id as string, (cli?.fixed_briefing as string) || (cli?.campaign_briefing as string),
    );

    const r = await revisarArte({
      imageUrl: arteUrl,
      clienteNome: (cli?.nome_fantasia as string) || (cli?.name as string) || (card.client_name as string) || "Cliente",
      briefing,
      regras: rules.map((x) => `${x.texto} (${x.escopo})`),
      temaEsperado: `${card.title as string}${card.briefing ? ` — ${(card.briefing as string).slice(0, 300)}` : ""}`,
    });
    if (!r.ok || !r.data) return { status: "pulado", motivo: r.error || "falha na revisão" };

    const problemas = (r.data.problemas ?? []) as string[];
    if (r.data.ok || problemas.length === 0) return { status: "ok" };

    const quem = (card.social_media as string) ? `@${(card.social_media as string).split(" ")[0]} ` : "";
    await insertNotification({
      type: "content",
      title: `⚠️ Arte pode violar regra — ${(card.client_name as string) || "cliente"}`,
      body: `${quem}"${card.title as string}": ${r.data.resumo || problemas[0]}. Abra o card e clique em "Revisar arte" pra ver o detalhe.`,
      clientId: card.client_id as string,
    });
    return { status: "alertado", problemas, resumo: (r.data.resumo as string) || problemas[0] };
  } catch (err) {
    console.error("[CS/verificar-arte] falhou (ignorado):", String(err));
    return { status: "pulado", motivo: "erro" };
  }
}
