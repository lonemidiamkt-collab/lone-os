// lib/cs/vigilancia.ts — calendário/horário comercial da "Vigilância de Fluxo" do Agente CS.
// Tudo em America/Sao_Paulo. Premissas (decisões do Roberto): horário comercial 8h–18h;
// clientes postam SEG/QUA/SEX. Feriado nacional não gera cobrança (reusa lib/holidays).

import { getHolidays } from "@/lib/holidays/brasil-api";

export const BUSINESS_START_HOUR = 8;   // 08h
export const BUSINESS_END_HOUR = 18;    // 18h (exclusivo)
const POSTING_WEEKDAYS = new Set([1, 3, 5]); // 0=dom … seg(1)/qua(3)/sex(5)

/** Date com componentes LOCAIS = horário de São Paulo (pra ler getHours/getDay/getDate em BRT). */
export function spNow(base = new Date()): Date {
  return new Date(base.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

/** YYYY-MM-DD a partir de um Date "SP-local" (vindo de spNow/addDays). */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** YYYY-MM-DD (no fuso de SP) de um timestamp ISO qualquer (ex.: created_at do card). */
export function spDateKeyOf(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function isBusinessHour(d = spNow()): boolean {
  const h = d.getHours();
  return h >= BUSINESS_START_HOUR && h < BUSINESS_END_HOUR;
}

export function isWeekday(d = spNow()): boolean {
  const wd = d.getDay();
  return wd >= 1 && wd <= 5;
}

/** Dia de postagem padrão da Lone: seg/qua/sex. */
export function isPostingDay(d = spNow()): boolean {
  return POSTING_WEEKDAYS.has(d.getDay());
}

/** Dia FIRME de postagem: seg e sex (quarta é leve — às vezes não tem / só vídeo). */
export function isFirmPostingDay(d = spNow()): boolean {
  const wd = d.getDay();
  return wd === 1 || wd === 5;
}

/** Dia útil = seg–sex E não-feriado nacional. Sem API de feriado → não bloqueia (fail-open). */
export async function isBusinessDay(d = spNow()): Promise<boolean> {
  if (!isWeekday(d)) return false;
  try {
    const hs = await getHolidays(d.getFullYear());
    const key = ymd(d);
    return !hs.some((h: { date: string }) => h.date === key);
  } catch {
    return true;
  }
}

/**
 * Horas ÚTEIS (8h–18h, seg–sex em SP) decorridas desde `fromISO` até `now`.
 * Usado pelos thresholds de "parado há X horas". Infinity se nulo; 0 se futuro.
 * Passo de 30min, com teto de 30 dias (card muito antigo → trata como "muito tempo").
 */
export function businessHoursSince(fromISO?: string | null, now = new Date()): number {
  if (!fromISO) return Infinity;
  const from = new Date(fromISO);
  if (Number.isNaN(from.getTime()) || from.getTime() >= now.getTime()) return 0;
  if (now.getTime() - from.getTime() > 30 * 24 * 3600 * 1000) return 9999;
  const STEP = 30 * 60 * 1000;
  let horas = 0;
  for (let t = from.getTime(); t < now.getTime(); t += STEP) {
    const sp = spNow(new Date(t));
    const wd = sp.getDay();
    const h = sp.getHours();
    if (wd >= 1 && wd <= 5 && h >= BUSINESS_START_HOUR && h < BUSINESS_END_HOUR) horas += 0.5;
  }
  return horas;
}
