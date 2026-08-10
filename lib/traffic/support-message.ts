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

// ── SEGUNDA — tráfego (legenda do relatório de 7 dias) ──
const MONDAY_REPORT: string[] = [
  "Bom dia! Segue o relatório da semana passada. Qualquer dúvida sobre os números, é só chamar.",
  "Oi, pessoal. Mandando aqui o relatório dos últimos 7 dias. Se quiser que eu explique algum número, me chama.",
  "Bom dia. Relatório da semana aí. Dá uma olhada e me fala se surgir alguma dúvida.",
  "Oi, gente. Segue o resumo da semana pra vocês acompanharem. Estou por aqui se precisar.",
  "Bom dia! Relatório da última semana. Qualquer coisa é só falar.",
];

/** Reenvio: relatório corrigido após instabilidade da Meta (mensagem específica, sem variação). */
export const RESEND_REPORT_MESSAGE =
  "Oi, pessoal. O relatório que mandei hoje de manhã veio com *alguns números incompletos* — " +
  "deu instabilidade na Meta bem na hora em que ele foi gerado. Segue a *versão corrigida*. " +
  "Desculpa o transtorno, e qualquer dúvida me chama.";

// ── SEGUNDA — só-social: início de semana + oferta de arte ──
const MONDAY_SOCIAL: string[] = [
  "Bom dia! Começando a semana por aqui. Tem alguma promoção ou novidade pra divulgar? Me manda que eu preparo a arte.",
  "Oi, pessoal. Se tiver algo pra postar essa semana — oferta, aviso, novidade — manda aqui que a gente faz.",
  "Bom dia. Alguma novidade pra essa semana? Se tiver, me passa que eu já coloco na fila.",
  "Oi, gente. Tem alguma data ou promoção essa semana que vocês queiram divulgar?",
  "Bom dia! Me conta se tem algo pra postar essa semana que eu já preparo.",
];

// ── QUARTA — tráfego: meio de semana, disponibilidade (NÃO pergunta resultado) ──
const WED_TRAFFIC: string[] = [
  "Oi, pessoal. Passando pra dizer que as campanhas seguem rodando e sendo acompanhadas por aqui. Qualquer coisa, é só chamar.",
  "Bom dia. Tudo certo com os anúncios. Se precisar de algum ajuste ou quiser divulgar algo novo, me fala.",
  "Oi, gente. Seguimos de olho nas campanhas. Precisando de alguma coisa, estou por aqui.",
  "Bom dia! Só passando pra avisar que está tudo sendo acompanhado. Qualquer dúvida me chama.",
  "Oi, pessoal. As campanhas estão rodando normal. Se tiver algo que queiram ajustar, me avisa.",
];

// ── QUARTA — só-social: meio de semana, foco em arte ──
const WED_SOCIAL: string[] = [
  "Oi, pessoal. Tem alguma novidade pra postar? Me manda que eu preparo a arte.",
  "Bom dia. Se tiver alguma promoção ou aviso pra divulgar, é só mandar aqui.",
  "Oi, gente. Alguma coisa nova essa semana pra colocar nas redes?",
  "Bom dia! Me fala se tem algo pra postar que eu já cuido.",
  "Oi. Passando pra ver se tem alguma novidade pra divulgar por aí.",
];

// ── SEXTA — tráfego: fechamento de semana, disponibilidade ──
const FRI_TRAFFIC: string[] = [
  "Oi, pessoal. Fechando a semana por aqui, campanhas rodando normal. Qualquer coisa no fim de semana, é só chamar.",
  "Bom dia. Semana fechando e está tudo sendo acompanhado. Se precisar de algo, me fala.",
  "Oi, gente. Tudo certo com os anúncios. Precisando de alguma coisa, estou por aqui.",
  "Bom dia! Fechando a semana. Se surgir qualquer necessidade, me chama.",
  "Oi, pessoal. Semana encerrando com as campanhas rodando. Qualquer dúvida, é só falar.",
];

// ── SEXTA — só-social: fechamento de semana, foco em arte ──
const FRI_SOCIAL: string[] = [
  "Oi, pessoal. Tem alguma coisa pra postar no fim de semana? Me manda que eu preparo.",
  "Bom dia. Se tiver promoção de fim de semana pra divulgar, é só mandar aqui.",
  "Oi, gente. Querem deixar algum post programado pro fim de semana?",
  "Bom dia! Alguma novidade pra divulgar antes do fim de semana?",
  "Oi. Se tiver algo pra postar, me fala que eu já cuido.",
];

/** Segunda: legenda do relatório de 7 dias (tráfego). Uma das 5 variações. */
export function mondayReportMessage(): string { return pick(MONDAY_REPORT); }
/** Segunda: clientes só-social (sem relatório). Uma das 5 variações. */
export function mondaySocialMessage(): string { return pick(MONDAY_SOCIAL); }
/** Suporte (tráfego) qua/sex. Uma das 5 variações do dia. */
export function supportMessageFor(kind: ClientMsgKind): string { return pick(kind === "fri" ? FRI_TRAFFIC : WED_TRAFFIC); }
/** Só-social qua/sex. Uma das 5 variações do dia. */
export function socialMessageFor(kind: ClientMsgKind): string { return pick(kind === "fri" ? FRI_SOCIAL : WED_SOCIAL); }
