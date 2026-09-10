// lib/cs/sentimento.ts — TERMÔMETRO DE SATISFAÇÃO. Lê uma mensagem que o CLIENTE mandou no grupo
// dele com a agência e classifica se há INSATISFAÇÃO / risco de churn. Objetivo: o time agir ANTES
// de o cliente sair. Provider: gpt-4o-mini (barato — roda em msg de cliente). Nunca lança.
//
// TREINAMENTO 10/09/2026 — auditei os 66 alertas disparados desde 16/07. ~50 eram falso-positivo.
// A mudança central não é mais um exemplo no prompt (a versão anterior JÁ trazia a frase exata do
// Império dos Pisos como NEUTRO e mesmo assim alertou): é obrigar o modelo a NOMEAR DE QUEM ele
// está falando, no campo `sobre`. Só "agencia" pode virar alerta — quem decide isso é o portão em
// lib/cs/portao-satisfacao.ts. Julgar "sobre quem é isso" é uma pergunta que o modelo acerta;
// julgar "isso é risco médio ou alto" não é.

import { chatJson } from "@/lib/ai/openai";
import type { OpenAiResult } from "@/lib/ai/openai";
import type { SobreOQue } from "@/lib/cs/portao-satisfacao";

export interface SentimentoOutput {
  sentimento: "positivo" | "neutro" | "negativo";
  risco: "baixo" | "medio" | "alto"; // risco de insatisfação/desgaste da relação
  churn: boolean;                     // sinal EXPLÍCITO de querer encerrar o CONTRATO com a agência
  sobre: SobreOQue;                   // de quem/de quê ele está falando — decide se pode virar alerta
  motivo: string;                     // 1 frase curta: o que na fala indica isso (cita o trecho)
}

const SOBRE = ["agencia", "peca", "negocio_do_cliente", "terceiro", "resultado_campanha", "operacional", "indefinido"];

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["sentimento", "risco", "churn", "sobre", "motivo"],
  properties: {
    sentimento: { type: "string", enum: ["positivo", "neutro", "negativo"] },
    risco: { type: "string", enum: ["baixo", "medio", "alto"] },
    churn: { type: "boolean" },
    sobre: { type: "string", enum: SOBRE },
    motivo: { type: "string" },
  },
};

const SYSTEM = `Você lê UMA mensagem que um CLIENTE mandou no grupo de WhatsApp da agência de marketing
dele (Lone Mídia) e avalia a SATISFAÇÃO/relação. O time só é avisado quando o cliente está ficando
insatisfeito COM A AGÊNCIA. Falso alarme é o erro caro: cansa o time, ensina a ignorar o alerta e
derruba o score do cliente à toa. Na dúvida, silêncio.

━━ PRIMEIRO decida "sobre" — DE QUEM/DE QUÊ ele está falando. É o campo que mais importa:
- "agencia" .............. o atendimento da Lone: prazo, entrega, retorno, o que foi combinado e não
                           veio, sumiço, ter que cobrar toda vez. É o ÚNICO valor que pode virar alerta.
- "peca" ................. a arte/vídeo/legenda/medida/cor/áudio em si, inclusive apontando erro ou
                           dizendo "não gostei". Isso é o trabalho acontecendo, não é insatisfação.
- "negocio_do_cliente" ... a loja dele, o movimento, o preço dele, o estoque, a rotina dele.
- "terceiro" ............. funcionário, sócio, fornecedor, o cliente final DELE, a concorrência.
- "resultado_campanha" ... custo por lead, volume de mensagem, conversão, vendas. É assunto do gestor
                           de tráfego — importante, mas NÃO é "cliente insatisfeito".
- "operacional" .......... fato sem carga: "não chegou ainda", "n tá carregando", remarcar horário,
                           aviso técnico, correção de informação.
- "indefinido" ........... você não consegue dizer de quem/de quê é. Mensagem solta, fragmento, gíria.
                           NUNCA invente um motivo pra encaixar em "agencia" — use "indefinido".

━━ DEPOIS classifique:
- sentimento: positivo (elogio, agradecimento, alívio, animação), neutro (assunto normal, pedido,
  correção, fato), negativo (reclamação com carga, irritação, decepção, cobrança ríspida).
- risco: baixo (tranquilo), medio (incômodo real, insistência, tom seco de quem já falou antes),
  alto (bravo, decepção forte, "não tô gostando", "sempre a mesma coisa").
- churn: true SÓ se o objeto for o CONTRATO/parceria com a agência ("quero cancelar", "vamos encerrar
  o contrato", "não vamos continuar com vocês"). Cancelar um login, trocar de banco, abortar uma
  pauta ou parar UM formato NÃO é churn.
- motivo: 1 frase citando o trecho. Se não der pra citar um trecho que sustente, é "indefinido".

━━ ERROS REAIS que este agente cometeu (mensagens de verdade, veredicto correto ao lado):
"Ele é desenrolado mas não faz . Agora vai. Depois do puxão de orelha ! 👏👏👏"
  → terceiro, positivo. Ela está ELOGIANDO o funcionário dela. Palmas não são reclamação.
"Eu só não gostei desse aqui na hora de falar do valor, acho que ficou melhor deixar igual o último"
  → peca, neutro. Ele está escolhendo entre versões.
"Medida está errada, e 45 x 45" / "O modelo do piso está errado" / "Pegou muito o som externo"
  → peca, neutro. Apontar erro na peça é o cliente participando.
"Movimento parado" / "Não estamos tendo muitas vendas on-line não"
  → negocio_do_cliente, neutro. É a loja dele, não a agência.
"Família o custo por conversa está muito alto" / "Saquarema dobrou o custo por lead"
  → resultado_campanha. Vai pro tráfego, não é insatisfação com o atendimento.
"N funcionamos" / "Não chegou ainda" / "N tá carregando" / "Esse aqui não"
  → operacional ou indefinido, neutro. Curto demais pra ter carga.
"Larga o aço" / "Ficar gastando dinheiro com velho é pica" / "Deu ruim"
  → indefinido, neutro. Gíria e brincadeira não são termômetro.
"Cancelei o login" → operacional, churn FALSE. "Vou fazer de outro banco" → indefinido, churn FALSE.
"vamos abortar essa missão [dos vídeos das visitas]" → operacional, churn FALSE — é uma pauta, não o contrato.
"Eu entendo perfeitamente o que vcs estão cobrando. Mas não to conseguindo resolver tudo, não dá tempo"
  → operacional, neutro. Ele está se DESCULPANDO por estar devendo material — o oposto de insatisfação.
"Muitas msg sem retorno algum" / "recebemos msgs, a maioria sem resposta" / "1 atendimento, não tivemos resposta"
  → resultado_campanha. QUEM não respondeu aqui é o LEAD dele, não a Lone. "Sem resposta" só é
    "agencia" quando o silêncio é DA AGÊNCIA: "vocês não me respondem", "não tive resposta de vocês",
    "mandei no grupo e ninguém respondeu". Confira sempre quem é o sujeito que ficou calado.
"Algumas msgs chegam em horários fora do nosso expediente, quando abro me coloco à disposição"
  → negocio_do_cliente. Ele está descrevendo a rotina de atendimento DELE.

━━ ISSO SIM é "agencia" e deve alertar:
"quero deixar claro o ponto da minha insatisfação com a falta de acompanhamento"
"estou realmente indignado com essa situação, já tem praticamente uma semana"
"Não tive resposta!@all" / "cadê a arte que pedi semana passada?" / "de novo a mesma coisa, já falei"
"Já era para estar programado para hoje" / "gostaria de ver sobre os relatórios, não tivemos retorno"
"a gente acaba sendo enrolado" / "Quem fornece relatório somos nós. Esse grupo é exatamente para isso"

A pergunta que decide tudo: ele está falando DE COMO ESTÁ SENDO ATENDIDO pela Lone, ou de outra
coisa? Se for outra coisa, o campo "sobre" tem que dizer qual. Responda APENAS no JSON do schema.`;

export async function analisarSentimentoCliente(mensagem: string): Promise<OpenAiResult<SentimentoOutput>> {
  return chatJson<SentimentoOutput>({
    model: "gpt-4o-mini",
    schemaName: "cs_sentimento",
    schema: SCHEMA,
    maxTokens: 200,
    temperature: 0,
    system: SYSTEM,
    user: `Mensagem do cliente: "${mensagem.slice(0, 600)}"\n\nClassifique (JSON).`,
  });
}
