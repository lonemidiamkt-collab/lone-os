// lib/traffic/support-message.ts — mensagens enviadas nos grupos dos clientes (seg/qua/sex).
// Tom positivo, próximo e motivacional. 5 VARIAÇÕES por tipo, escolhidas aleatoriamente a cada
// envio — mesma intenção/lógica do dia, texto diferente, pra não ficar robotizado.

export type ClientMsgKind = "monday" | "wed" | "fri";

const pick = (a: string[]): string => a[Math.floor(Math.random() * a.length)];

// ── SEGUNDA — tráfego (legenda do relatório de 7 dias): entrega o relatório + início de semana ──
const MONDAY_REPORT: string[] = [
  "Olá, bom dia, amigos! Estou enviando aqui pra vocês o nosso relatório da última semana. Espero que a nossa semana seja positiva, que a gente gere muitas vendas e vá atrás do melhor resultado possível. 🚀",
  "Bom dia, pessoal! 👋 Segue o relatório da semana que passou. Bora pra cima nessa nova semana — muito resultado e muitas vendas pra vocês! 🚀",
  "Oi, gente! Começando a semana com o relatório dos últimos 7 dias em mãos. Que essa semana renda ainda mais — tamo junto pra buscar o melhor resultado! 📊🚀",
  "Bom dia, amigos! Aqui está o resumo da última semana pra vocês acompanharem. Semana nova, energia nova — vamos fazer acontecer! 💪",
  "Olá! ☀️ Enviando o relatório da semana anterior. Que a semana que começa traga muitos clientes e ótimos números pra vocês. Conta com a gente! 🚀",
];

/** Reenvio: relatório corrigido após instabilidade da Meta (mensagem específica, sem variação). */
export const RESEND_REPORT_MESSAGE =
  "Olá, pessoal! 👋 Identificamos que o relatório enviado hoje de manhã veio com *alguns " +
  "números incompletos*, por causa de uma instabilidade na plataforma da Meta no momento da " +
  "geração. Já corrigimos — segue agora a *versão correta e completa* do relatório dos últimos " +
  "7 dias. Obrigado pela compreensão e qualquer dúvida estamos à disposição! 🚀";

// ── SEGUNDA — só-social: início de semana + oferta de arte ──
const MONDAY_SOCIAL: string[] = [
  "Olá, bom dia, amigos! Começando mais uma semana com tudo! 🚀 Que seja uma ótima semana pra vocês. Tem alguma novidade, aviso ou promoção pra essa semana que a gente possa desenvolver uma arte? É só mandar aqui que a gente cuida. 🎨",
  "Bom dia, pessoal! Segunda-feira chegou e a gente já tá a postos! 🎨 Tem alguma promoção, novidade ou data especial essa semana? Manda aqui que transformamos em arte. 🚀",
  "Oi, gente! Que essa semana seja das boas! 💪 Se tiver algo pra divulgar — oferta, aviso, novidade — é só chamar que a gente cria a arte pra vocês. 🎨",
  "Olá! ☀️ Semana nova começando! Alguma ideia, campanha ou promoção que vocês querem colocar no ar? Manda pra gente que cuidamos de tudo. 🚀🎨",
  "Bom dia, amigos! Bora fazer essa semana valer! 🚀 Tem novidade pra postar? É só mandar aqui que a gente desenvolve a arte certinha pra vocês. 🎨",
];

// ── QUARTA — tráfego: meio de semana, disponibilidade/suporte (NÃO pergunta resultado) ──
const WED_TRAFFIC: string[] = [
  "Olá, pessoal! Ótima quarta-feira pra vocês! 🚀 Passando pra reforçar que seguimos acompanhando as campanhas de perto. Qualquer dúvida, ajuste ou novidade que queiram divulgar, é só chamar — estamos à disposição pra dar todo o suporte. 💪",
  "Oi, gente! Meio de semana e a gente segue de olho nas campanhas por aqui. 👀 Precisando de qualquer coisa — um ajuste, uma dúvida ou uma nova divulgação — é só chamar! 🚀",
  "Bom dia, amigos! Quarta chegando com tudo! 💪 Continuamos monitorando os anúncios de perto. Se surgir alguma novidade ou dúvida, estamos por aqui à disposição. 🙌",
  "Olá, pessoal! Passando no meio da semana pra dizer que está tudo sendo acompanhado de perto por aqui. 📊 Qualquer necessidade, é só falar que a gente resolve junto! 🚀",
  "Oi! ☀️ Boa quarta! Seguimos cuidando das campanhas de perto. Tem algo que queiram ajustar ou divulgar? Conta com a gente pro que precisar. 💪",
];

// ── QUARTA — só-social: meio de semana, foco em arte ──
const WED_SOCIAL: string[] = [
  "Olá, pessoal! Ótima quarta-feira pra vocês! 🎨 Como estão as coisas por aí? Se tiver alguma novidade, promoção ou data especial chegando, é só mandar aqui que a gente desenvolve a arte. 🚀",
  "Oi, gente! Meio de semana por aí! 🎨 Alguma promoção ou novidade pra postar? Manda aqui que criamos a arte pra vocês. 🚀",
  "Bom dia, amigos! Boa quarta! 💪 Tem alguma ideia ou aviso que vocês querem transformar em post? É só chamar que a gente cuida. 🎨",
  "Olá! ☀️ Quarta-feira é ótimo dia pra manter as redes ativas! Tem algo novo pra divulgar? Manda pra gente que a gente prepara. 🎨🚀",
  "Oi, pessoal! Passando pra ver se tem novidade pra essa semana. 🎨 Qualquer arte que precisarem, é só mandar aqui! 🙌",
];

// ── SEXTA — tráfego: fechamento de semana, disponibilidade/suporte ──
const FRI_TRAFFIC: string[] = [
  "Olá, pessoal! Sextou! 🎉 Fechando a semana com tudo por aqui e seguimos monitorando as campanhas de perto. Se precisarem de qualquer coisa — um ajuste, uma arte ou tirar uma dúvida — é só chamar. Estamos à disposição! 🚀",
  "Oi, gente! Sexta chegou! 🎉 Semana fechando e a gente segue de olho em tudo por aqui. Precisando de algo pro fim de semana, é só falar! 💪",
  "Bom dia, amigos! Sextou! 🥳 Fechamos a semana acompanhando os anúncios de perto. Qualquer ajuste ou novidade, estamos à disposição. 🚀",
  "Olá! ☀️ Boa sexta! Pra encerrar a semana: seguimos cuidando das campanhas de perto. Se surgir qualquer necessidade, conta com a gente! 🙌",
  "Oi, pessoal! Sexta-feira e semana fechando com chave de ouro! 🎉 Tudo sendo monitorado por aqui — qualquer coisa que precisarem, é só chamar. 💪",
];

// ── SEXTA — só-social: fechamento de semana, foco em arte ──
const FRI_SOCIAL: string[] = [
  "Olá, pessoal! Sextou! 🎉 Pra fechar a semana: tem alguma arte, post ou novidade que vocês queiram que a gente prepare pro fim de semana ou pra próxima? É só chamar aqui que a gente cuida. 🎨",
  "Oi, gente! Sexta chegou! 🎉 Quer preparar algum post pro fim de semana? Manda a novidade aqui que a gente cria a arte. 🎨",
  "Bom dia, amigos! Sextou! 🥳 Tem alguma promoção de fim de semana pra divulgar? É só mandar que desenvolvemos a arte. 🚀🎨",
  "Olá! ☀️ Boa sexta! Bora manter as redes ativas no fim de semana? Se tiver algo pra postar, manda pra gente. 🎨",
  "Oi, pessoal! Fechando a semana! 🎉 Qualquer arte ou novidade pro fim de semana, é só chamar aqui. A gente cuida! 🙌",
];

/** Segunda: legenda do relatório de 7 dias (tráfego). Uma das 5 variações. */
export function mondayReportMessage(): string { return pick(MONDAY_REPORT); }
/** Segunda: clientes só-social (sem relatório). Uma das 5 variações. */
export function mondaySocialMessage(): string { return pick(MONDAY_SOCIAL); }
/** Suporte (tráfego) qua/sex. Uma das 5 variações do dia. */
export function supportMessageFor(kind: ClientMsgKind): string { return pick(kind === "fri" ? FRI_TRAFFIC : WED_TRAFFIC); }
/** Só-social qua/sex. Uma das 5 variações do dia. */
export function socialMessageFor(kind: ClientMsgKind): string { return pick(kind === "fri" ? FRI_SOCIAL : WED_SOCIAL); }
