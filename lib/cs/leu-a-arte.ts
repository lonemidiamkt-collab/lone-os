// lib/cs/leu-a-arte.ts — o cliente JÁ FALOU sobre a arte que está esperando aprovação?
//
// O Roberto: "não só isso, mas a IA verifica se o cliente respondeu sobre a arte ou não, pois aí
// pode dar bagunça."
//
// Ele está certo. Conferir o card (status + carimbo de aprovado) só cobre o que o TIME registrou.
// A conversa real acontece no grupo: o cliente escreve "pode postar", "ficou ótima", "muda o
// preço" — e ninguém mexe no card. Se o agente então pergunta "conseguiu dar uma olhada na arte?",
// o cliente entende que a gente não lê o que ele escreve. É pior que não mandar mensagem.
//
// Aqui a gente lê o que ELE falou desde que a arte foi pro lado dele, e classifica. Só cobra
// aprovação de quem realmente não se manifestou.
//
// Na dúvida, NÃO cobra: silêncio nosso custa menos que cobrar quem já respondeu.

import { chatJson } from "@/lib/ai/openai";
import { supabaseAdmin } from "@/lib/supabase/server";

export type RespostaSobreArte =
  | "aprovou"        // deu o ok
  | "pediu_ajuste"   // respondeu pedindo mudança
  | "nao_falou"      // falou de outras coisas, mas não da arte
  | "silencio";      // não escreveu nada desde então

export interface LeituraDaArte {
  resposta: RespostaSobreArte;
  /** Só cobra aprovação quando ele realmente não se manifestou sobre a arte. */
  podeCobrar: boolean;
  /** O que embasou — vai pro preview, pro time conferir a decisão do agente. */
  evidencia?: string;
}

const SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false, required: ["resposta", "trecho"],
  properties: {
    resposta: { type: "string", enum: ["aprovou", "pediu_ajuste", "nao_falou"] },
    trecho: { type: ["string", "null"] },
  },
};

const SYSTEM = `Você lê mensagens que o CLIENTE de uma agência escreveu no grupo de WhatsApp e
responde uma coisa só: ele se manifestou sobre a ARTE que a agência mandou pra aprovação?

- "aprovou" ....... deu o ok de qualquer jeito: "pode postar", "ficou ótima", "isso", "perfeito",
                    "manda ver", "tá bom", um 👍 ou 👏 respondendo à arte.
- "pediu_ajuste" .. respondeu à arte pedindo mudança: preço, texto, foto, cor, "troca isso".
- "nao_falou" ..... escreveu no grupo, mas sobre OUTRO assunto (dúvida de campanha, recado da
                    loja, conversa solta). Não comentou a arte.

Na dúvida entre "aprovou" e "nao_falou", responda "aprovou": cobrar aprovação de quem já
respondeu passa a impressão de que ninguém lê o que ele escreve.

Em "trecho", copie a frase dele que sustenta a resposta (ou null se for "nao_falou").`;

/**
 * `desde` = quando a arte foi pro lado do cliente. Sem isso não dá pra saber o que é resposta
 * à arte e o que é conversa anterior.
 */
export async function clienteFalouDaArte(clientId: string, desde: string): Promise<LeituraDaArte> {
  try {
    const { data } = await supabaseAdmin
      .from("cs_message_corpus")
      .select("text, created_at")
      .eq("client_id", clientId).eq("is_team", false)
      .gte("created_at", desde)
      .order("created_at", { ascending: true }).limit(25);

    const falas = (data ?? []).map((m) => (m.text as string) || "").filter((t) => t.trim().length > 1);
    if (!falas.length) return { resposta: "silencio", podeCobrar: true };

    const r = await chatJson<{ resposta: RespostaSobreArte; trecho: string | null }>({
      model: "gpt-4o-mini", system: SYSTEM,
      user: `Mensagens do cliente depois de a arte ir pra aprovação:\n${falas.map((f) => `- ${f.slice(0, 200)}`).join("\n")}`,
      schema: SCHEMA, schemaName: "resposta_arte", maxTokens: 200, temperature: 0,
    });

    // IA fora do ar: ele FALOU alguma coisa e a gente não sabe o quê → não cobra.
    if (!r.ok || !r.data) return { resposta: "nao_falou", podeCobrar: false, evidencia: "não consegui ler a conversa" };

    const resposta = r.data.resposta;
    return {
      resposta,
      // Só cobra quem escreveu sobre outra coisa. Quem aprovou ou pediu ajuste, não.
      podeCobrar: resposta === "nao_falou",
      evidencia: r.data.trecho ?? undefined,
    };
  } catch {
    return { resposta: "nao_falou", podeCobrar: false, evidencia: "erro ao ler a conversa" };
  }
}
