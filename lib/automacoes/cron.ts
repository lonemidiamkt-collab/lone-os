// lib/automacoes/cron.ts — lê uma expressão cron de 5 campos (como no crontab do VPS, em UTC) e
// calcula a próxima execução. Suporta *, listas (1,3,5), faixas (11-20) e passos (*/15, 10-20/2).

interface CronParseado {
  minutos: Set<number>;
  horas: Set<number>;
  dias: Set<number>;
  meses: Set<number>;
  semana: Set<number>;
  // Regra do cron: se dia do mês E dia da semana vierem restritos, basta UM dos dois bater.
  diaRestrito: boolean;
  semanaRestrita: boolean;
}

function campo(expr: string, min: number, max: number, nome: string): Set<number> {
  const out = new Set<number>();
  for (const parte of expr.split(",")) {
    const [base, passoTxt] = parte.split("/");
    const passo = passoTxt === undefined ? 1 : Number(passoTxt);
    if (!Number.isInteger(passo) || passo < 1) throw new Error(`cron inválido (${nome}): ${expr}`);
    let ini: number, fim: number;
    if (base === "*") { ini = min; fim = max; }
    else if (base.includes("-")) {
      const [a, b] = base.split("-").map(Number);
      ini = a; fim = b;
    } else {
      ini = Number(base);
      // "5/10" = de 5 até o fim, de 10 em 10.
      fim = passoTxt === undefined ? ini : max;
    }
    if (!Number.isInteger(ini) || !Number.isInteger(fim) || ini < min || fim > max || ini > fim) {
      throw new Error(`cron inválido (${nome}): ${expr}`);
    }
    for (let v = ini; v <= fim; v += passo) out.add(v);
  }
  return out;
}

const cache = new Map<string, CronParseado>();

export function parseCron(expr: string): CronParseado {
  const guardado = cache.get(expr);
  if (guardado) return guardado;
  const p = expr.trim().split(/\s+/);
  if (p.length !== 5) throw new Error(`cron inválido (precisa de 5 campos): ${expr}`);
  const semana = campo(p[4], 0, 7, "dia da semana");
  if (semana.has(7)) { semana.delete(7); semana.add(0); } // 7 = domingo, como o 0
  const r: CronParseado = {
    minutos: campo(p[0], 0, 59, "minuto"),
    horas: campo(p[1], 0, 23, "hora"),
    dias: campo(p[2], 1, 31, "dia"),
    meses: campo(p[3], 1, 12, "mês"),
    semana,
    diaRestrito: p[2] !== "*",
    semanaRestrita: p[4] !== "*",
  };
  cache.set(expr, r);
  return r;
}

function diaBate(c: CronParseado, d: Date): boolean {
  const dia = c.dias.has(d.getUTCDate());
  const sem = c.semana.has(d.getUTCDay());
  if (c.diaRestrito && c.semanaRestrita) return dia || sem;
  if (c.diaRestrito) return dia;
  if (c.semanaRestrita) return sem;
  return true;
}

/** Próximo instante (estritamente depois de `agora`) em que o cron dispara. Horários em UTC. */
export function proximaExecucao(cron: string, agora: Date = new Date()): Date {
  const c = parseCron(cron);
  const d = new Date(agora.getTime());
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(d.getUTCMinutes() + 1);
  // Pula mês/dia/hora inteiros quando não batem — resolve até cron mensal em poucas voltas.
  for (let voltas = 0; voltas < 5000; voltas++) {
    if (!c.meses.has(d.getUTCMonth() + 1)) {
      d.setUTCMonth(d.getUTCMonth() + 1, 1);
      d.setUTCHours(0, 0, 0, 0);
      continue;
    }
    if (!diaBate(c, d)) {
      d.setUTCDate(d.getUTCDate() + 1);
      d.setUTCHours(0, 0, 0, 0);
      continue;
    }
    if (!c.horas.has(d.getUTCHours())) {
      d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0);
      continue;
    }
    if (!c.minutos.has(d.getUTCMinutes())) {
      d.setUTCMinutes(d.getUTCMinutes() + 1, 0, 0);
      continue;
    }
    return d;
  }
  throw new Error(`cron sem próxima execução: ${cron}`);
}

/** A mais próxima entre várias linhas de crontab do mesmo job. */
export function proximaDeVarias(crons: string[], agora: Date = new Date()): Date {
  return crons.map((c) => proximaExecucao(c, agora)).reduce((a, b) => (b < a ? b : a));
}
