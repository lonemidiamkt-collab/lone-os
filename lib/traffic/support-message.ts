// lib/traffic/support-message.ts — mensagens enviadas nos grupos dos clientes (seg/qua/sex).
//
// TOM: gente de agência escrevendo no WhatsApp, não marca falando com público. O Roberto leu a
// versão anterior e disse que estava "muito chat gpt" — e estava: toda mensagem terminava em
// emoji, empilhava exclamação e vinha cheia de motivação vazia ("Sextou! 🥳", "semana nova,
// energia nova", "com chave de ouro"). Ninguém digita assim pro cliente.
//
// As regras que mantêm isso humano:
//   · uma ou duas frases, e acabou;
//   · no MÁXIMO um emoji, e quase sempre nenhum;
//   · uma exclamação por mensagem, no máximo;
//   · nada de motivacional — o cliente quer saber se está tudo certo e o que precisa mandar;
//   · varia o começo (nem toda mensagem abre com "Bom dia").
//
// 5 variações por tipo, sorteadas a cada envio, pra não repetir texto no mesmo grupo.

export type ClientMsgKind = "monday" | "wed" | "fri";

const pick = (a: string[]): string => a[Math.floor(Math.random() * a.length)];

/**
 * Escolhe evitando o que o grupo recebeu por último.
 *
 * O sorteio puro não tem memória: nada impedia o mesmo cliente receber a mesma frase duas semanas
 * seguidas — e é isso que faz a mensagem parecer robô, mais até do que o texto em si. Quem chama
 * passa as últimas mensagens enviadas àquele grupo (elas já estão em `cs_outbound`).
 *
 * Se TODAS as opções já foram usadas recentemente, sorteia normal: repetir é melhor que não mandar.
 */
export function escolherFrase(pool: string[], recentes: string[] = []): string {
  const usadas = new Set(recentes.map((t) => t.trim()));
  const livres = pool.filter((f) => !usadas.has(f.trim()));
  return pick(livres.length ? livres : pool);
}

// ── SEGUNDA — tráfego (legenda do relatório de 7 dias) ──
// SEGUNDA SEMPRE DESEJA A SEMANA (pedido do Roberto, 10/08): semana abençoada e com vendas. É o
// tom da casa no começo da semana. O que varia é o jeito de dizer — repetir a mesma frase toda
// segunda em 40 grupos vira carimbo, e carimbo o cliente para de ler.
const MONDAY_REPORT: string[] = [
  "Bom dia! Segue o relatório da semana passada. Que essa semana seja abençoada e cheia de vendas pra vocês. Qualquer dúvida nos números, é só chamar.",
  "Oi, pessoal. Mandando o relatório dos últimos 7 dias. Desejo uma semana abençoada e com muita venda. Se quiser que eu explique algum número, me chama.",
  "Bom dia. Relatório da semana aí. Que a semana seja de bênção e de bons resultados pra vocês. Me fala se surgir alguma dúvida.",
  "Oi, gente. Segue o resumo da semana. Uma semana abençoada e com as vendas em alta pra vocês. Estou por aqui se precisar.",
  "Bom dia! Relatório da última semana pra vocês acompanharem. Que Deus abençoe a semana e que venha muita venda. Qualquer coisa é só falar.",
];

/** Reenvio: relatório corrigido após instabilidade da Meta (mensagem específica, sem variação). */
export const RESEND_REPORT_MESSAGE =
  "Oi, pessoal. O relatório que mandei hoje de manhã veio com *alguns números incompletos* — " +
  "deu instabilidade na Meta bem na hora em que ele foi gerado. Segue a *versão corrigida*. " +
  "Desculpa o transtorno, e qualquer dúvida me chama.";

// ── SEGUNDA — só-social: início de semana + oferta de arte ──
const MONDAY_SOCIAL: string[] = [
  "Bom dia! Que essa semana seja abençoada e cheia de vendas pra vocês. Tem alguma promoção ou novidade pra divulgar? Me manda que eu preparo a arte.",
  "Oi, pessoal. Semana nova começando — que seja abençoada e com muita venda. Se tiver algo pra postar, manda aqui que a gente faz.",
  "Bom dia. Uma semana abençoada e de bons negócios pra vocês. Tem novidade pra essa semana? Me passa que eu já coloco na fila.",
  "Oi, gente. Que a semana seja de bênção e de vendas boas. Tem alguma data ou promoção que vocês queiram divulgar?",
  "Bom dia! Que Deus abençoe a semana de vocês e traga muita venda. Me conta se tem algo pra postar que eu já preparo.",
];

// ── QUARTA — tráfego: meio de semana, disponibilidade (NÃO pergunta resultado) ──
//
// Roberto (10/09): "as mensagens que ele envia para os grupos ficam sempre a mesma coisa e fica
// robótico." Eram cinco por tipo, sorteadas sem memória: em 40 grupos, três vezes por semana, o
// mesmo cliente reencontrava a mesma frase a cada duas semanas.
//
// Mas o número não era o problema principal — a FORMA era. As cinco tinham a mesma estrutura:
// saudação + status + "qualquer coisa me chama". Trocar as palavras mantendo o esqueleto continua
// soando a carimbo. As de agora variam o formato: algumas abrem pela pergunta, algumas não têm
// saudação, algumas são de uma linha só.
const WED_TRAFFIC: string[] = [
  "Oi, pessoal. Passando pra dizer que as campanhas seguem rodando e sendo acompanhadas por aqui. Qualquer coisa, é só chamar.",
  "Bom dia. Tudo certo com os anúncios. Se precisar de algum ajuste ou quiser divulgar algo novo, me fala.",
  "Oi, gente. Seguimos de olho nas campanhas. Precisando de alguma coisa, estou por aqui.",
  "Bom dia! Só passando pra avisar que está tudo sendo acompanhado. Qualquer dúvida me chama.",
  "Oi, pessoal. As campanhas estão rodando normal. Se tiver algo que queiram ajustar, me avisa.",
  "Tem alguma novidade essa semana que valha colocar no anúncio? Me fala que eu ajusto.",
  "Campanhas rodando por aqui. Se aparecer alguma promoção no meio da semana, me manda.",
  "Oi! Alguma coisa mudou aí no estoque ou no preço que a gente precise refletir nos anúncios?",
  "Passando rápido: está tudo certo de nosso lado. Se precisar de algo, é só falar.",
  "Bom dia. Continuo acompanhando os anúncios. Me avisa se quiser mudar alguma coisa.",
  "E aí, pessoal? Tudo certo com as campanhas por aqui. Qualquer necessidade, me chama.",
  "Oi. Se tiver algum produto que vocês queiram empurrar mais essa semana, me diz.",
];

// ── QUARTA — só-social: meio de semana, foco em arte ──
const WED_SOCIAL: string[] = [
  "Oi, pessoal. Tem alguma novidade pra postar? Me manda que eu preparo a arte.",
  "Bom dia. Se tiver alguma promoção ou aviso pra divulgar, é só mandar aqui.",
  "Oi, gente. Alguma coisa nova essa semana pra colocar nas redes?",
  "Bom dia! Me fala se tem algo pra postar que eu já cuido.",
  "Oi. Passando pra ver se tem alguma novidade pra divulgar por aí.",
  "Chegou produto novo ou tem alguma promoção rolando? Me manda que eu faço a arte.",
  "Alguma data ou ação essa semana que vocês queiram divulgar?",
  "Oi! Se tiver foto de produto novo, pode mandar aqui que eu aproveito no post.",
  "Tem algo acontecendo na loja essa semana pra gente postar?",
  "Bom dia. Qualquer novidade que queiram nas redes, é só me passar.",
  "E aí? Alguma coisa pra divulgar essa semana?",
  "Oi, pessoal. Estou montando os posts — se tiver algo específico pra entrar, me avisa.",
];

// ── SEXTA — tráfego: fechamento de semana, disponibilidade ──
const FRI_TRAFFIC: string[] = [
  "Oi, pessoal. Fechando a semana por aqui, campanhas rodando normal. Qualquer coisa no fim de semana, é só chamar.",
  "Bom dia. Semana fechando e está tudo sendo acompanhado. Se precisar de algo, me fala.",
  "Oi, gente. Tudo certo com os anúncios. Precisando de alguma coisa, estou por aqui.",
  "Bom dia! Fechando a semana. Se surgir qualquer necessidade, me chama.",
  "Oi, pessoal. Semana encerrando com as campanhas rodando. Qualquer dúvida, é só falar.",
  "Vão fazer alguma ação no fim de semana? Me avisa que eu reforço no anúncio.",
  "Campanhas seguem no ar durante o fim de semana. Qualquer coisa me chama.",
  "Oi! Tem promoção de fim de semana? Dá tempo de colocar no anúncio ainda hoje.",
  "Fechando a semana por aqui. Se precisar de mim no sábado, é só mandar mensagem.",
  "Bom dia. Deixo tudo rodando pro fim de semana. Qualquer ajuste, me fala.",
  "E aí, pessoal? Semana fechada de nosso lado, anúncios no ar. Bom fim de semana.",
  "Oi. Alguma coisa que vocês queiram mudar antes do fim de semana?",
];

// ── SEXTA — só-social: fechamento de semana, foco em arte ──
const FRI_SOCIAL: string[] = [
  "Oi, pessoal. Tem alguma coisa pra postar no fim de semana? Me manda que eu preparo.",
  "Bom dia. Se tiver promoção de fim de semana pra divulgar, é só mandar aqui.",
  "Oi, gente. Querem deixar algum post programado pro fim de semana?",
  "Bom dia! Alguma novidade pra divulgar antes do fim de semana?",
  "Oi. Se tiver algo pra postar, me fala que eu já cuido.",
  "Vão abrir sábado? Se quiser, eu faço um post avisando o horário.",
  "Tem alguma ação pro fim de semana que valha divulgar hoje?",
  "Oi! Última chamada pra post de fim de semana — me manda que dá tempo.",
  "Fechando a semana. Qualquer coisa pra postar, é só mandar aqui.",
  "Bom dia. Se tiver foto ou promoção pro fim de semana, aproveito e já preparo.",
  "E aí, pessoal? Algo pra divulgar antes do fim de semana?",
  "Oi. Deixo algum post programado pro sábado? Me diz o que quer divulgar.",
];

/** Segunda: legenda do relatório de 7 dias (tráfego). Uma das 5 variações. */
export function mondayReportMessage(recentes: string[] = []): string { return escolherFrase(MONDAY_REPORT, recentes); }
/** Segunda: clientes só-social (sem relatório). Uma das 5 variações. */
export function mondaySocialMessage(recentes: string[] = []): string { return escolherFrase(MONDAY_SOCIAL, recentes); }
/** Suporte (tráfego) qua/sex. Uma das 5 variações do dia. */
export function supportMessageFor(kind: ClientMsgKind, recentes: string[] = []): string {
  return escolherFrase(kind === "fri" ? FRI_TRAFFIC : WED_TRAFFIC, recentes);
}
/** Só-social qua/sex. Uma das 5 variações do dia. */
export function socialMessageFor(kind: ClientMsgKind, recentes: string[] = []): string {
  return escolherFrase(kind === "fri" ? FRI_SOCIAL : WED_SOCIAL, recentes);
}
