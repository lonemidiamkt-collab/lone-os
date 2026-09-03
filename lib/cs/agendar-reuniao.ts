// AGENDAR A REUNIÃO A PARTIR DA CONVERSA.
//
// PRA QUE (Roberto, 02/09): "a IA tem que ver se o cliente marcou a reunião ou não no grupo… e aí
// o cliente marcando ela já coloca na agenda desse social media."
//
// Duas metades:
//   • RECONHECER que a conversa é sobre marcar a reunião mensal (e não sobre outra coisa com data,
//     como "a promoção começa dia 18").
//   • CONFIRMAR ou PERGUNTAR. Um horário mal lido coloca alguém sozinho numa chamada, então: só
//     agenda com data E hora explícitas; qualquer vaguidão vira pergunta.

import { lerHorario, horarioPlausivel, porExtenso } from "./parse-horario";

/** Fala sobre a reunião de acompanhamento — não sobre uma data qualquer. */
const RX_REUNIAO = /\b(reuni[ãa]o|reuniao|call|meet|alinhamento|conversar|bate[- ]?papo|videochamada|v[ií]deo\s*chamada)\b/i;

/** Verbos que indicam MARCAR, não relatar. "tivemos uma reunião" não agenda nada. */
const RX_MARCAR = /\b(marcar?|marca|agendar?|agenda|combinar?|combina|pode ser|podemos|consigo|dispon[íi]vel|que tal|topo|fechado|confirmo|confirmado)\b/i;

/** Passado: "a reunião foi ótima", "na reunião de ontem" — não é agendamento. */
const RX_PASSADO = /\b(foi|teve|tivemos|aconteceu|ontem|semana passada|m[êe]s passado|na [úu]ltima)\b/i;

/** Recusa/adiamento: precisa de tratamento diferente de uma proposta. */
const RX_RECUSA = /\b(n[ãa]o (posso|consigo|d[áa]|vai dar|rola)|imposs[íi]vel|remarcar|adiar|outro dia|outra hora|desmarcar|cancelar)\b/i;

export type IntencaoReuniao =
  | { tipo: "agendar"; iso: string; trecho: string; confirmar: false }
  | { tipo: "perguntar_horario"; motivo: string }
  | { tipo: "recusa" }
  | { tipo: "nenhuma" };

/**
 * Lê a mensagem e decide o que fazer.
 *
 * A ordem das checagens importa: recusa antes de proposta (quem diz "não posso terça, pode
 * quarta?" está propondo quarta, mas quem diz "não posso essa semana" não está propondo nada), e
 * passado antes de tudo (relato não agenda).
 */
export function lerIntencaoReuniao(texto: string, agora = new Date()): IntencaoReuniao {
  const t = (texto || "").trim();
  if (!t) return { tipo: "nenhuma" };

  const falaDeReuniao = RX_REUNIAO.test(t);
  const querMarcar = RX_MARCAR.test(t);

  // Relato do que já aconteceu não agenda nada.
  if (falaDeReuniao && RX_PASSADO.test(t) && !querMarcar) return { tipo: "nenhuma" };

  const horario = lerHorario(t, agora);

  // Recusa SEM contraproposta: quem disse que não pode e não ofereceu alternativa.
  if (RX_RECUSA.test(t) && !horario) return falaDeReuniao || querMarcar ? { tipo: "recusa" } : { tipo: "nenhuma" };

  // Sem contexto de reunião, uma data solta é outra coisa — "a promoção começa dia 18" não é
  // convite para reunião. Exige que a conversa seja sobre reunião OU que o verbo seja de marcar.
  if (!falaDeReuniao && !querMarcar) return { tipo: "nenhuma" };

  if (!horario) {
    // Falou de marcar reunião mas não disse quando: é o momento de perguntar, não de adivinhar.
    return falaDeReuniao && querMarcar
      ? { tipo: "perguntar_horario", motivo: "sem data ou hora na mensagem" }
      : { tipo: "nenhuma" };
  }

  if (!horario.horaExplicita) {
    return { tipo: "perguntar_horario", motivo: `disse "${horario.trecho}" mas não a hora exata` };
  }

  const plausivel = horarioPlausivel(horario.iso, agora);
  if (!plausivel.ok) {
    return { tipo: "perguntar_horario", motivo: plausivel.motivo ?? "horário improvável" };
  }

  return { tipo: "agendar", iso: horario.iso, trecho: horario.trecho, confirmar: false };
}

/** O que o agente responde no grupo do cliente ao entender o horário. */
export function textoConfirmacao(cliente: string, iso: string): string {
  return `📅 Fechado! Anotei a reunião de acompanhamento da *${cliente}* para *${porExtenso(iso)}*.\n`
    + `Vou lembrar todo mundo na véspera. Se precisar mudar, é só falar aqui.`;
}

/** Quando entendeu que é reunião mas não o horário. Pergunta com opções, não em aberto. */
export function textoPergunta(motivo: string): string {
  return `📅 Show, vamos marcar! Só me confirma o dia e a hora certinho — ex.: “dia 18 às 14h”.\n`
    + `_(${motivo})_`;
}

/** O agente OFERECENDO horário, dentro da janela. Duas opções concretas fecham mais rápido que "quando você pode?". */
export function textoOferta(cliente: string, opcoes: string[]): string {
  return `Oi! 👋 Chegou a hora da nossa reunião mensal de acompanhamento da *${cliente}* — `
    + `a gente revisa os resultados do mês e alinha o próximo.\n\n`
    + opcoes.map((o) => `• ${o}`).join("\n")
    + `\n\nAlgum desses funciona? Se preferir outro horário, é só dizer.`;
}

/**
 * Sugere dois horários úteis a partir de amanhã.
 *
 * Perguntar "quando você pode?" devolve a decisão para o cliente e costuma virar silêncio. Duas
 * opções concretas fecham na primeira resposta.
 */
export function sugerirHorarios(agora: Date, quantos = 2): string[] {
  const out: string[] = [];
  const d = new Date(agora);
  d.setHours(0, 0, 0, 0);
  let tentativas = 0;
  const horas = [10, 15];
  while (out.length < quantos && tentativas < 14) {
    d.setDate(d.getDate() + 1);
    tentativas++;
    const semana = d.getDay();
    if (semana === 0 || semana === 6) continue;   // reunião de trabalho é em dia útil
    const h = horas[out.length % horas.length];
    const iso = new Date(d);
    iso.setHours(h, 0, 0, 0);
    out.push(porExtenso(iso.toISOString()));
  }
  return out;
}
