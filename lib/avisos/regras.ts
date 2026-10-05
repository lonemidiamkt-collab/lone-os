// lib/avisos/regras.ts — AS REGRAS DOS AVISOS FALADOS (v2, 05/10/2026). Puras: servidor e painel usam.
//
// A v1 (dc24181) falava toda queda crítica, todo saldo "acabando", pra gestor E sócios, sem teto. No
// banco isso dava ~10 falas/dia no computador do Julio (30 no pior dia), repetidas no do Roberto e
// do Lucas — e a "queda de resultado" era quase sempre IMPRESSÃO (81 de 109 em 30 dias), não conversa.
// A v2 segue o que o Roberto aprovou:
//
//  1. Só fala o que exige ação em minutos: CONTA PARADA (nada gasto hoje até as 11h) e SALDO ZERADO
//     de verdade (pré-pago com saldo ≤ 0 ou que não dura 1 dia). Queda de resultado sai da voz.
//  2. Quem ouve é quem age: o gestor do cliente. Sócio (admin) só se ligar a voz no sino.
//  3. Teto de TETO_FALAS_DIA por pessoa por dia; ao bater, a voz diz UMA vez que o resto fica no sino.
//  4. Só em dia útil, das 8h às 18h (São Paulo). Fora disso o aviso entra no sino calado.
//  5. Uma aba fala (lib/avisos/lider.ts) — várias abas abertas não repetem a frase.
//  6. Medição por 2 semanas: metade dos eventos fala, metade não (sorteio fixo por conta e dia). Se
//     a conta não voltar a rodar mais rápido com voz do que só com o WhatsApp, a voz sai.
//
// Referência de desenho: Google SRE ("todo alerta precisa exigir ação humana em minutos"; no máximo
// ~2 por turno) e PagerDuty (fora do horário, só o que é crítico).

export type TipoAviso = "conta_parada" | "saldo_zerado";
export type Braco = "voz" | "controle";
export type DecisaoFala = "falar" | "avisar_teto" | "mudo";

export const TETO_FALAS_DIA = 5;
export const HORA_INICIO = 8;
export const HORA_FIM = 18;
/** Janela do teste com grupo de controle. Fora dela todo evento fala (braço "voz"). */
export const TESTE_INICIO = "2026-10-06";
export const TESTE_FIM = "2026-10-19";

export const FRASE_TETO =
  `Já são ${TETO_FALAS_DIA} avisos falados hoje. Os próximos ficam só no sino, sem voz.`;

// ── Relógio de São Paulo ──────────────────────────────────────────────────────

export interface RelogioSP { dia: string; hora: number; minuto: number; diaSemana: number }

/** Data e hora em São Paulo. diaSemana: 0 = domingo … 6 = sábado. */
export function relogioSP(d: Date = new Date()): RelogioSP {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  const semana = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), minuto: Number(p.minute), diaSemana: semana };
}

/** Meia-noite de hoje em São Paulo, em ISO (o Brasil não tem mais horário de verão). */
export function inicioDoDiaSP(d: Date = new Date()): string {
  return new Date(`${relogioSP(d).dia}T00:00:00-03:00`).toISOString();
}

/** Dia útil, das 8h às 18h. */
export function dentroDoHorario(d: Date = new Date()): boolean {
  const r = relogioSP(d);
  return r.diaSemana >= 1 && r.diaSemana <= 5 && r.hora >= HORA_INICIO && r.hora < HORA_FIM;
}

// ── Teste com grupo de controle ───────────────────────────────────────────────

/** FNV-1a: o mesmo texto dá sempre o mesmo número (o sorteio não muda se a rotina rodar de novo). */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Dentro da janela do teste, metade das contas por dia vai pro controle (não fala). */
export function bracoDoTeste(metaAccountId: string, dia: string): Braco {
  if (dia < TESTE_INICIO || dia > TESTE_FIM) return "voz";
  return hash(`${metaAccountId}|${dia}`) % 2 === 0 ? "voz" : "controle";
}

// ── Falar ou não ──────────────────────────────────────────────────────────────

export function decidirFala(p: {
  ligadoNaCentral: boolean;
  noHorario: boolean;
  braco: Braco;
  /** Avisos FALADOS que essa pessoa já recebeu hoje (inclui a frase do teto). */
  jaFaladosHoje: number;
  teto?: number;
}): DecisaoFala {
  const teto = p.teto ?? TETO_FALAS_DIA;
  if (!p.ligadoNaCentral || !p.noHorario || p.braco === "controle") return "mudo";
  if (p.jaFaladosHoje < teto) return "falar";
  if (p.jaFaladosHoje === teto) return "avisar_teto";
  return "mudo";
}

/**
 * Quem recebe o aviso: o gestor do cliente (a não ser que tenha desligado a voz) e os sócios que
 * LIGARAM a voz. `prefs`: nome → ouvir_avisos (null = padrão do papel).
 */
export function quemOuve(p: { gestor: string | null; prefs: Map<string, boolean | null>; admins: string[] }): string[] {
  const out: string[] = [];
  const g = (p.gestor ?? "").trim();
  if (g && p.prefs.has(g) && p.prefs.get(g) !== false) out.push(g);
  for (const a of p.admins) if (p.prefs.get(a) === true) out.push(a);
  return [...new Set(out)];
}

/** Padrão quando a pessoa nunca mexeu no botão: quem cuida de conta ouve, sócio não. */
export function vozPadraoDoPapel(papel: string | null | undefined): boolean {
  return papel !== "admin";
}

// ── Saldo ─────────────────────────────────────────────────────────────────────

export interface SaldoLido {
  isPrepaid: boolean;
  available: number | null;
  daysRemaining: number | null;
  alert: { severity: string };
}

/** Pré-pago, conta ativa, saldo ≤ 0 ou que não dura 1 dia. "Abaixo de X% da verba" não fala. */
export function saldoZerado(s: SaldoLido): boolean {
  if (!s.isPrepaid || s.available === null || s.alert.severity !== "critical") return false;
  return s.available <= 0 || (s.daysRemaining !== null && s.daysRemaining < 1);
}

/** Recarregou: saldo positivo que dura pelo menos 1 dia (ou sem ritmo de gasto pra calcular). */
export function saldoResolvido(s: Pick<SaldoLido, "available" | "daysRemaining">): boolean {
  if (s.available === null || s.available <= 0) return false;
  return s.daysRemaining === null || s.daysRemaining >= 1;
}

// ── Textos (curtos: é a primeira coisa que a pessoa ouve) ─────────────────────

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function textoContaParada(nome: string, hora: string, media3d: number | null): { titulo: string; corpo: string } {
  return {
    titulo: `A conta do ${nome} parou de rodar`,
    corpo: `Nenhum gasto hoje até as ${hora}.${media3d ? ` Ela vinha gastando cerca de ${brl(media3d)} por dia.` : ""}`,
  };
}

export function textoSaldoZerado(nome: string, available: number | null, daysRemaining: number | null): { titulo: string; corpo: string } {
  const zerado = available === null || available <= 0;
  return {
    titulo: zerado ? `O saldo do ${nome} zerou` : `O saldo do ${nome} não dura até amanhã`,
    corpo: zerado
      ? "Os anúncios param até o cliente recarregar."
      : `Sobram ${brl(available)}${daysRemaining !== null ? `, menos de um dia de anúncio` : ""}. Precisa de recarga hoje.`,
  };
}

// ── Medição ───────────────────────────────────────────────────────────────────

export interface EventoMedido {
  tipo: TipoAviso;
  braco: Braco;
  detectado_em: string;
  resolvido_em: string | null;
  ouvido_em?: string | null;
}

export function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export interface LinhaMedicao {
  tipo: TipoAviso;
  braco: Braco;
  eventos: number;
  resolvidos: number;
  /** Minutos da detecção até a conta voltar a gastar / o saldo ser recarregado. */
  medianaMinutos: number | null;
  /** Quantos desses a voz chegou a tocar de fato em algum computador. */
  ouvidos: number;
}

export function medir(eventos: EventoMedido[]): LinhaMedicao[] {
  const out: LinhaMedicao[] = [];
  for (const tipo of ["conta_parada", "saldo_zerado"] as TipoAviso[]) {
    for (const braco of ["voz", "controle"] as Braco[]) {
      const grupo = eventos.filter((e) => e.tipo === tipo && e.braco === braco);
      const minutos = grupo
        .filter((e) => e.resolvido_em)
        .map((e) => Math.max(0, Math.round((Date.parse(e.resolvido_em!) - Date.parse(e.detectado_em)) / 60000)));
      out.push({
        tipo, braco, eventos: grupo.length, resolvidos: minutos.length,
        medianaMinutos: mediana(minutos), ouvidos: grupo.filter((e) => e.ouvido_em).length,
      });
    }
  }
  return out;
}
