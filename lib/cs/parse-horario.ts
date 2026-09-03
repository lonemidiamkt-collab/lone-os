// ENTENDER "terça que vem às 15h" — o parser de data e hora da conversa.
//
// PRA QUE (Roberto, 02/09): "a IA já pode oferecer pra marcar essa reunião, marcar com o cliente
// ali no grupo. E aí o cliente marcando ela já coloca na agenda desse social media."
//
// O cliente não escreve "2026-09-18T14:00". Ele escreve "pode ser quinta 14h", "dia 18 às 10:30",
// "amanhã de manhã". Este arquivo transforma isso em data — e, mais importante, RECUSA quando
// está ambíguo demais.
//
// A regra que organiza tudo: **na dúvida, devolve null**. Uma reunião marcada no dia errado é pior
// que uma reunião não marcada — o cliente fica esperando sozinho numa chamada, e a agência
// aparenta descaso. Quem chama este parser deve perguntar quando vier null, nunca chutar.

/** Tudo em horário de São Paulo — o parser não trabalha em UTC para não errar por 3h. */
const TZ_OFFSET = "-03:00";

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, terça: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, sábado: 6,
};

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const semAcento = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export interface HorarioLido {
  /** ISO com fuso de São Paulo. */
  iso: string;
  /** O trecho do texto que gerou a data — para o agente confirmar com as palavras da pessoa. */
  trecho: string;
  /** false quando a hora não foi dita e assumimos um padrão. Quem usa deve confirmar. */
  horaExplicita: boolean;
}

/** Monta o ISO a partir de partes, sempre no fuso de SP. */
function iso(ano: number, mes: number, dia: number, hora: number, minuto: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ano}-${p(mes)}-${p(dia)}T${p(hora)}:${p(minuto)}:00${TZ_OFFSET}`;
}

/**
 * Extrai a HORA do texto. Devolve null quando não há hora dita.
 *
 * Aceita "15h", "15:30", "15h30", "às 9", "9 da manhã", "2 da tarde".
 */
export function lerHora(texto: string): { hora: number; minuto: number; explicita: boolean } | null {
  const t = semAcento(texto);

  // "15h30", "15:30", "15h", "15 h"
  const m1 = /\b([01]?\d|2[0-3])\s*(?:h|:)\s*([0-5]\d)?\b/.exec(t);
  if (m1) {
    let h = parseInt(m1[1], 10);
    const min = m1[2] ? parseInt(m1[2], 10) : 0;
    // "3h" num contexto de tarde vira 15h — o time não marca reunião às 3 da manhã.
    if (/\btarde\b/.test(t) && h < 12) h += 12;
    if (/\bnoite\b/.test(t) && h < 12) h += 12;
    return { hora: h, minuto: min, explicita: true };
  }

  // "às 9 da manhã", "2 da tarde"
  //
  // O `(?<!dia\s)` não é detalhe: sem ele, "reunião dia 18 de manhã" casava aqui e virava "18
  // horas da manhã" — uma reunião marcada às 18h porque o cliente disse o DIA 18. O número depois
  // de "dia" é data, nunca hora.
  const m2 = /(?:as|às)?\s*(?<!dia\s)\b([01]?\d|2[0-3])\s*(?:da|de)\s*(manha|tarde|noite)\b/.exec(t);
  if (m2) {
    let h = parseInt(m2[1], 10);
    const periodo = m2[2];
    if ((periodo === "tarde" || periodo === "noite") && h < 12) h += 12;
    if (periodo === "manha" && h === 12) h = 0;
    return { hora: h, minuto: 0, explicita: true };
  }

  // Só o período: assume um horário comercial padrão, mas marca como NÃO explícito para quem
  // chamou pedir confirmação. "De manhã" não é um horário — é uma faixa de quatro horas.
  if (/\bde\s*manha\b/.test(t)) return { hora: 10, minuto: 0, explicita: false };
  if (/\ba\s*tarde\b|\bde\s*tarde\b/.test(t)) return { hora: 15, minuto: 0, explicita: false };

  return null;
}

/**
 * Lê data e hora de uma frase, relativas a `agora`.
 *
 * Formatos suportados, do mais específico ao mais vago:
 *   "dia 18/09 às 14h" · "18/09" · "dia 18 às 10h" · "quinta que vem 15h" · "amanhã 14h" · "hoje 16h"
 */
export function lerHorario(texto: string, agora = new Date()): HorarioLido | null {
  const t = semAcento(texto);
  const hora = lerHora(texto);
  // Sem hora nenhuma, uma data solta não vira reunião — vira intenção. Quem chama deve perguntar.
  if (!hora) return null;

  const ano = agora.getFullYear();
  const mesAtual = agora.getMonth() + 1;
  const diaAtual = agora.getDate();

  // ── 1. "18/09" ou "18/09/2026" ──────────────────────────────────────────
  const mData = /\b(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?\b/.exec(t);
  if (mData) {
    const d = parseInt(mData[1], 10);
    const m = parseInt(mData[2], 10);
    let a = mData[3] ? parseInt(mData[3], 10) : ano;
    if (a < 100) a += 2000;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return { iso: iso(a, m, d, hora.hora, hora.minuto), trecho: mData[0], horaExplicita: hora.explicita };
    }
  }

  // ── 2. "dia 18 de setembro" / "dia 18" ──────────────────────────────────
  const mDiaMes = /\bdia\s+(\d{1,2})(?:\s+de\s+([a-z]+))?\b/.exec(t);
  if (mDiaMes) {
    const d = parseInt(mDiaMes[1], 10);
    const nomeMes = mDiaMes[2];
    let m = nomeMes && MESES[nomeMes] ? MESES[nomeMes] : mesAtual;
    let a = ano;
    // "dia 3" quando hoje é dia 20 significa o mês que vem — ninguém marca para trás.
    if (!nomeMes && d < diaAtual) { m += 1; if (m > 12) { m = 1; a += 1; } }
    if (d >= 1 && d <= 31) {
      return { iso: iso(a, m, d, hora.hora, hora.minuto), trecho: mDiaMes[0], horaExplicita: hora.explicita };
    }
  }

  // ── 3. "hoje" / "amanhã" ────────────────────────────────────────────────
  if (/\bhoje\b/.test(t)) {
    const d = new Date(agora);
    return { iso: iso(d.getFullYear(), d.getMonth() + 1, d.getDate(), hora.hora, hora.minuto), trecho: "hoje", horaExplicita: hora.explicita };
  }
  if (/\bamanha\b/.test(t)) {
    const d = new Date(agora.getTime() + 86400000);
    return { iso: iso(d.getFullYear(), d.getMonth() + 1, d.getDate(), hora.hora, hora.minuto), trecho: "amanhã", horaExplicita: hora.explicita };
  }

  // ── 4. Dia da semana: "quinta", "terça que vem", "próxima segunda" ──────
  for (const [nome, alvo] of Object.entries(DIAS_SEMANA)) {
    const rx = new RegExp(`\\b${semAcento(nome)}(?:-?feira)?\\b`);
    if (!rx.test(t)) continue;
    const hojeSemana = agora.getDay();
    let delta = (alvo - hojeSemana + 7) % 7;
    // "quinta" dita numa quinta significa a PRÓXIMA quinta, não hoje.
    if (delta === 0) delta = 7;
    // "que vem" / "próxima" empurra uma semana — mas só se já não tivermos pulado a semana.
    if (/\b(que\s+vem|proxima|proximo)\b/.test(t) && delta < 7) delta += 7;
    const d = new Date(agora.getTime() + delta * 86400000);
    return {
      iso: iso(d.getFullYear(), d.getMonth() + 1, d.getDate(), hora.hora, hora.minuto),
      trecho: nome, horaExplicita: hora.explicita,
    };
  }

  return null;
}

/** Escreve a data como uma pessoa diria — para o agente confirmar sem parecer robô. */
export function porExtenso(isoStr: string): string {
  const d = new Date(isoStr);
  const dia = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return `${dia} às ${hora}`;
}

/** Recusa horários impossíveis ou improváveis para uma reunião de trabalho. */
export function horarioPlausivel(isoStr: string, agora = new Date()): { ok: boolean; motivo?: string } {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return { ok: false, motivo: "data inválida" };
  if (d.getTime() < agora.getTime() - 60 * 60 * 1000) return { ok: false, motivo: "data no passado" };
  if (d.getTime() > agora.getTime() + 120 * 86400000) return { ok: false, motivo: "mais de 4 meses à frente" };

  // Hora local de SP para a checagem de expediente.
  const h = Number(d.toLocaleString("en-US", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }));
  if (h < 7 || h >= 21) return { ok: false, motivo: "fora do horário comercial" };
  const diaSemana = new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })).getDay();
  if (diaSemana === 0) return { ok: false, motivo: "domingo" };
  return { ok: true };
}
