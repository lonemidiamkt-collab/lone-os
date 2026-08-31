// lib/cs/briefing-design-card.ts — monta o briefing da arte a partir de um card, sem depender de
// alguém clicar num botão.
//
// PRA QUE (Roberto, 30/08): 27% das artes voltavam pra refazer, e lendo os 134 motivos de
// reprovação de 60 dias o padrão é quase sempre o mesmo — "bloco desalinhado com o padrão do
// cliente", "seguir os padrões das referências", e duas vezes "colocou a logo de outro cliente".
//
// O briefing por IA já resolvia isso: ele injeta as REGRAS VISUAIS do cliente e os MOTIVOS DAS
// REPROVAÇÕES ANTERIORES no pedido que chega ao designer. Só que era um botão dentro do card, e
// foi usado em 46 dos 510 cards — 9%. A ferramenta certa existia e quase ninguém acionava.
//
// Agora roda sozinho quando o card vira pedido de design. O designer recebe "não usar laranja,
// logo no rodapé, padrão da referência X" ANTES de abrir o editor, em vez de descobrir depois.

import { supabaseAdmin } from "@/lib/supabase/server";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { fetchClientCsRules } from "@/lib/supabase/queries";
import { loadBriefingCombinado, loadBriefingForClient } from "@/lib/cs/load-briefing";
import { gerarBriefingDesign, formatBriefingDesign } from "@/lib/cs/briefing-design";

/**
 * Devolve o briefing pronto pro designer, ou null quando não dá pra montar.
 * NUNCA lança: briefing é um plus no fluxo de criação do pedido — se falhar, o pedido segue com o
 * texto que o social escreveu.
 */
export async function briefingDesignDoCard(cardId: string): Promise<string | null> {
  try {
    if (!isOpenAIConfigured()) return null;

    const { data: card } = await supabaseAdmin
      .from("content_cards")
      .select("id, title, briefing, observations, format, due_date, client_id, client_name")
      .eq("id", cardId).maybeSingle();
    if (!card?.client_id) return null;

    const { data: cli } = await supabaseAdmin
      .from("clients").select("name, nome_fantasia, nicho, industry, fixed_briefing, campaign_briefing")
      .eq("id", card.client_id as string).maybeSingle();
    const clienteNome = (cli?.nome_fantasia as string) || (cli?.name as string)
      || (card.client_name as string) || "Cliente";

    const [briefing, estruturado, csRules, reworkRes] = await Promise.all([
      loadBriefingCombinado(card.client_id as string,
        (cli?.fixed_briefing as string) || (cli?.campaign_briefing as string)),
      loadBriefingForClient({ clientId: card.client_id as string, nome: clienteNome,
        nicho: (cli?.nicho as string) || undefined }),
      fetchClientCsRules(card.client_id as string),
      supabaseAdmin.from("cs_rework_events").select("reason")
        .eq("client_id", card.client_id as string).not("reason", "is", null)
        .order("created_at", { ascending: false }).limit(20),
    ]);

    const regras = csRules.filter((r) => r.escopo !== "roteiro").map((r) => `${r.texto} (${r.escopo})`);
    const reprovacoesRecentes = [
      ...new Set((reworkRes.data ?? []).map((r) => (r.reason as string)?.trim()).filter(Boolean)),
    ].slice(0, 8);

    // Sem regra E sem histórico de reprovação, o briefing por IA acrescenta pouco ao que o social
    // já escreveu — e custa uma chamada. Cliente novo entra nesse caso até ter história.
    if (!regras.length && !reprovacoesRecentes.length) return null;

    const b = estruturado.briefing;
    const r = await gerarBriefingDesign({
      clienteNome,
      clienteNicho: (cli?.nicho as string) || (cli?.industry as string) || undefined,
      titulo: (card.title as string) || "post",
      briefingCard: [card.briefing as string, card.observations as string].filter(Boolean).join("\n") || undefined,
      formato: (card.format as string) || undefined,
      dataPost: (card.due_date as string) || undefined,
      briefing,
      tomVoz: b.tomVoz, produtosDestaque: b.produtosDestaque,
      palavrasProibidas: b.palavrasProibidas, publicoAlvo: b.publicoAlvo,
      regras, reprovacoesRecentes,
    });
    if (!r.ok || !r.data) return null;

    return formatBriefingDesign(r.data, clienteNome,
      (card.format as string) || undefined, (card.due_date as string) || undefined);
  } catch (err) {
    console.error("[briefing-design-card] falhou (ignorado):", String(err));
    return null;
  }
}
