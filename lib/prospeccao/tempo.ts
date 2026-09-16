// lib/prospeccao/tempo.ts — horário de São Paulo sem depender do fuso do servidor.
//
// O container roda em UTC e o Roberto pensa em BRT. Cada função recebe/entrega Date normal e
// faz a conta nos componentes de SP. Janelas ("09:00"–"11:00") são lidas em SP; ISO de saída
// sempre com o offset explícito (-03:00), como o parse-horario do CS já faz.

export const TZ = "America/Sao_Paulo";

export interface ComponentesSP {
  ano: number; mes: number; dia: number; hora: number; minuto: number;
  /** 0=dom … 6=sáb */
  diaSemana: number;
  ymd: string;
}

export function componentesSP(d = new Date()): ComponentesSP {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short",
  }).formatToParts(d);
  const pega = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const semanas: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const ano = Number(pega("year")), mes = Number(pega("month")), dia = Number(pega("day"));
  // "24" aparece à meia-noite em alguns runtimes com hour12:false.
  const hora = Number(pega("hour")) % 24;
  return {
    ano, mes, dia, hora, minuto: Number(pega("minute")),
    diaSemana: semanas[pega("weekday")] ?? 0,
    ymd: `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
  };
}

export const ymdSP = (d = new Date()) => componentesSP(d).ymd;

/** Date de um instante SP (ano, mês 1–12, dia, hora, minuto). Usa -03:00 (o Brasil não tem mais horário de verão). */
export function dataSP(ano: number, mes: number, dia: number, hora = 0, minuto = 0): Date {
  const mm = String(mes).padStart(2, "0"), dd = String(dia).padStart(2, "0");
  const hh = String(hora).padStart(2, "0"), mi = String(minuto).padStart(2, "0");
  return new Date(`${ano}-${mm}-${dd}T${hh}:${mi}:00-03:00`);
}

/** ISO com -03:00 (legível no banco e na tela), sem converter para UTC. */
export function isoSP(d: Date): string {
  const c = componentesSP(d);
  const mm = String(c.mes).padStart(2, "0"), dd = String(c.dia).padStart(2, "0");
  const hh = String(c.hora).padStart(2, "0"), mi = String(c.minuto).padStart(2, "0");
  return `${c.ano}-${mm}-${dd}T${hh}:${mi}:00-03:00`;
}

export const ehDiaUtil = (d: Date) => { const s = componentesSP(d).diaSemana; return s >= 1 && s <= 5; };

/** Mesmo instante do dia, `n` dias úteis à frente (seg–sex). */
export function somarDiasUteis(d: Date, n: number): Date {
  const x = new Date(d);
  let restam = n;
  while (restam > 0) {
    x.setUTCDate(x.getUTCDate() + 1);
    if (ehDiaUtil(x)) restam--;
  }
  return x;
}

export function somarDias(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export interface Janela { ini: string; fim: string }

const lerHM = (s: string): [number, number] => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
};
const minutos = (h: number, m: number) => h * 60 + m;

/** Está dentro da janela (dia útil, [ini, fim) em SP)? */
export function dentroDaJanela(j: Janela, agora = new Date()): boolean {
  if (!ehDiaUtil(agora)) return false;
  const c = componentesSP(agora);
  const [hi, mi] = lerHM(j.ini), [hf, mf] = lerHM(j.fim);
  const m = minutos(c.hora, c.minuto);
  return m >= minutos(hi, mi) && m < minutos(hf, mf);
}

/** Próximo instante em que a janela abre (hoje, se ainda não abriu; senão o próximo dia útil). */
export function proximaAberturaDaJanela(j: Janela, agora = new Date()): Date {
  const [hi, mi] = lerHM(j.ini);
  const c = componentesSP(agora);
  let alvo = dataSP(c.ano, c.mes, c.dia, hi, mi);
  if (alvo.getTime() <= agora.getTime() || !ehDiaUtil(alvo)) {
    alvo = dataSP(c.ano, c.mes, c.dia, hi, mi);
    do { alvo = somarDias(alvo, 1); } while (!ehDiaUtil(alvo));
    // Re-ancora a hora depois do salto de dia (somarDias preserva o instante do dia).
    const cc = componentesSP(alvo);
    alvo = dataSP(cc.ano, cc.mes, cc.dia, hi, mi);
  }
  return alvo;
}

/** Instante "hh:mm de SP" no dia útil `n` dias úteis à frente (n=0 → hoje se for útil). */
export function diaUtilAs(agora: Date, n: number, hora: number, minuto = 0): Date {
  let d = new Date(agora);
  if (n === 0 && !ehDiaUtil(d)) d = somarDiasUteis(d, 1);
  else if (n > 0) d = somarDiasUteis(d, n);
  const c = componentesSP(d);
  return dataSP(c.ano, c.mes, c.dia, hora, minuto);
}

/** "quarta-feira, 17 de setembro às 15:00" — mesmo formato do CS. */
export function porExtensoSP(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: TZ });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  return `${dia} às ${hora}`;
}

export function dataCurtaSP(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ });
}
export function horaCurtaSP(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

/**
 * Candidatos a horário de reunião: dias úteis a partir de amanhã, 10:00 e 15:00 alternados,
 * pulando os que `ocupado` recusar (agenda do Roberto). Devolve ISO com -03:00.
 */
export function candidatosDeHorario(
  agora: Date, quantos: number, ocupado: (iso: string) => boolean, horas: number[] = [10, 15],
): string[] {
  const out: string[] = [];
  let d = new Date(agora);
  for (let i = 0; i < 15 && out.length < quantos; i++) {
    d = somarDiasUteis(d, 1);
    for (const h of horas) {
      if (out.length >= quantos) break;
      const c = componentesSP(d);
      const iso = isoSP(dataSP(c.ano, c.mes, c.dia, h, 0));
      if (!ocupado(iso)) out.push(iso);
    }
  }
  return out;
}
