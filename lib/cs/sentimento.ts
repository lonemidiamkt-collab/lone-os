// lib/cs/sentimento.ts — TERMÔMETRO DE SATISFAÇÃO. Lê uma mensagem que o CLIENTE mandou no grupo
// dele com a agência e classifica se há INSATISFAÇÃO / risco de churn. Objetivo: o time agir ANTES
// de o cliente sair. Provider: gpt-4o-mini (barato — roda em msg de cliente). Nunca lança.

import { chatJson } from "@/lib/ai/openai";
import type { OpenAiResult } from "@/lib/ai/openai";

export interface SentimentoOutput {
  sentimento: "positivo" | "neutro" | "negativo";
  risco: "baixo" | "medio" | "alto"; // risco de insatisfação/desgaste da relação
  churn: boolean;                     // sinal EXPLÍCITO de querer pausar/cancelar/sair
  motivo: string;                     // 1 frase curta: o que na fala indica isso (cita o trecho)
}

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["sentimento", "risco", "churn", "motivo"],
  properties: {
    sentimento: { type: "string", enum: ["positivo", "neutro", "negativo"] },
    risco: { type: "string", enum: ["baixo", "medio", "alto"] },
    churn: { type: "boolean" },
    motivo: { type: "string" },
  },
};

const SYSTEM = `Você lê UMA mensagem que um CLIENTE mandou no grupo de WhatsApp da agência de marketing
dele e avalia a SATISFAÇÃO/relação. O objetivo é o time agir cedo se o cliente estiver ficando
insatisfeito. Seja PRECISO — falso alarme cansa o time e faz ignorarem o alerta.

Classifique:
- sentimento: positivo (elogio, agradecimento, animação), neutro (pedido/assunto normal, sem carga),
  negativo (reclamação, irritação, decepção, cobrança ríspida).
- risco (de desgaste/churn): baixo (tranquilo), medio (incômodo real, insistência, tom seco de quem
  já falou antes), alto (bravo, ameaça de sair, decepção forte, "não tô gostando", "sempre a mesma coisa").
- churn: true SÓ se houver sinal EXPLÍCITO de querer pausar/cancelar/sair ("quero cancelar", "vou
  parar", "não vale a pena", "pensando em encerrar").
- motivo: 1 frase citando o que indica (o trecho).

⚠️ NÃO confunda PEDIDO NORMAL com insatisfação. Pedir uma arte, um ajuste, tirar dúvida, mandar
material = NEUTRO. "Muda o preço pra R$30" NÃO é reclamação. Só é negativo/risco se houver TOM de
insatisfação de verdade: frustração, repetição irritada ("de novo isso?"), decepção, rispidez,
cobrança de atraso ("cadê? já faz dias"). Elogio/obrigado = positivo, risco baixo, churn false.
Na dúvida entre neutro e negativo, escolha NEUTRO (não gere alarme fraco).

⚠️ A DISTINÇÃO QUE MAIS ERRA: criticar A PEÇA é diferente de estar insatisfeito COM A AGÊNCIA.
Cliente dizendo o que quer diferente numa arte é o trabalho acontecendo — é assim que ele participa,
e virar alerta toda vez ensina o time a ignorar o alerta.
NEUTRO (é ajuste de arte, mesmo com "não gostei"):
  "não gostei desse aqui na hora de falar o valor, acho melhor deixar igual o último"
  "essa cor não ficou boa, troca"
  "prefiro a primeira versão"
  "não curti a fonte, dá pra mudar?"
NEGATIVO (é a RELAÇÃO, não a peça):
  "não tô gostando do trabalho de vocês"
  "de novo a mesma coisa, já falei isso três vezes"
  "cadê a arte que pedi semana passada?"
  "vocês não me respondem"
A pergunta que separa: ele está falando DA PEÇA ou DE COMO ESTÁ SENDO ATENDIDO? Se for da peça,
é NEUTRO — por mais que use "não gostei".
Responda APENAS no JSON do schema.`;

export async function analisarSentimentoCliente(mensagem: string): Promise<OpenAiResult<SentimentoOutput>> {
  return chatJson<SentimentoOutput>({
    model: "gpt-4o-mini",
    schemaName: "cs_sentimento",
    schema: SCHEMA,
    maxTokens: 160,
    temperature: 0,
    system: SYSTEM,
    user: `Mensagem do cliente: "${mensagem.slice(0, 600)}"\n\nClassifique (JSON).`,
  });
}
