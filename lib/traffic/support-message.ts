// lib/traffic/support-message.ts — mensagens enviadas nos grupos dos clientes.
// Tom positivo, próximo e motivacional. Servem de base (podem variar no futuro,
// quando virarem configuráveis por cliente).

export type ClientMsgKind = "monday" | "wed" | "fri";

/** Segunda: acompanha o PDF de 7 dias (vira a legenda do relatório). */
export const MONDAY_REPORT_MESSAGE =
  "Olá, bom dia, amigos! Estou enviando aqui para vocês o nosso relatório da última semana. " +
  "Espero que a nossa semana seja positiva, que a gente gere muitas vendas e que a gente vá " +
  "atrás do melhor resultado possível. 🚀";

/** Reenvio: relatório corrigido após instabilidade da Meta (legenda do PDF). */
export const RESEND_REPORT_MESSAGE =
  "Olá, pessoal! 👋 Identificamos que o relatório enviado hoje de manhã veio com *alguns " +
  "números incompletos*, por causa de uma instabilidade na plataforma da Meta no momento da " +
  "geração. Já corrigimos — segue agora a *versão correta e completa* do relatório dos últimos " +
  "7 dias. Obrigado pela compreensão e qualquer dúvida estamos à disposição! 🚀";

/** Segunda, clientes só-social (sem relatório de tráfego): início de semana + oferta de arte. */
export const MONDAY_SOCIAL_MESSAGE =
  "Olá, bom dia, amigos! Começando mais uma semana com tudo! 🚀 Que seja uma ótima semana " +
  "pra vocês. Tem alguma novidade, aviso ou promoção pra essa semana que a gente possa " +
  "desenvolver uma arte? É só mandar aqui que a gente cuida. 🎨";

/** Quarta, clientes só-social: meio de semana com foco em arte (sem linguagem de tráfego). */
export const WEDNESDAY_SOCIAL_MESSAGE =
  "Olá, pessoal! Ótima quarta-feira pra vocês! 🎨 Como estão as coisas por aí? Se tiver alguma " +
  "novidade, promoção ou data especial chegando, é só mandar aqui que a gente desenvolve a arte " +
  "pra vocês. 🚀";

/** Sexta, clientes só-social: fechamento de semana com foco em arte. */
export const FRIDAY_SOCIAL_MESSAGE =
  "Olá, pessoal! Sextou! 🎉 Pra fechar a semana: tem alguma arte, post ou novidade que vocês " +
  "queiram que a gente prepare pro fim de semana ou pra próxima? É só chamar aqui que a gente " +
  "cuida. 🎨";

/** Quarta: meio de semana — mostra disponibilidade/suporte (NÃO pergunta resultado). */
export const WEDNESDAY_MESSAGE =
  "Olá, pessoal! Ótima quarta-feira pra vocês! 🚀 Passando pra reforçar que seguimos acompanhando " +
  "as campanhas de perto por aqui. Qualquer dúvida, ajuste ou novidade que queiram divulgar, é só " +
  "chamar — estamos à disposição pra dar todo o suporte. 💪";

/** Sexta: fechamento de semana — mostra disponibilidade/suporte (NÃO pergunta resultado). */
export const FRIDAY_MESSAGE =
  "Olá, pessoal! Sextou! 🎉 Fechando a semana com tudo por aqui e seguimos monitorando as campanhas " +
  "de perto. Se precisarem de qualquer coisa — um ajuste, uma arte ou tirar uma dúvida — é só chamar. " +
  "Estamos à disposição pra ajudar no que for preciso! 🚀";

/** Texto de suporte (tráfego) para os dias sem relatório (qua/sex). */
export function supportMessageFor(kind: ClientMsgKind): string {
  return kind === "fri" ? FRIDAY_MESSAGE : WEDNESDAY_MESSAGE;
}

/** Texto para clientes SÓ-SOCIAL (sem tráfego) nos dias sem relatório (qua/sex). */
export function socialMessageFor(kind: ClientMsgKind): string {
  return kind === "fri" ? FRIDAY_SOCIAL_MESSAGE : WEDNESDAY_SOCIAL_MESSAGE;
}
