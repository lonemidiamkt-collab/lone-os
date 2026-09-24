// lib/automacoes/formato.ts — datas e durações da Central, sempre no horário de São Paulo.

import { spDateStr } from "@/lib/utils";

const TZ = "America/Sao_Paulo";

export function duracaoCurta(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
  const min = Math.floor(s / 60);
  const resto = Math.round(s % 60);
  return resto ? `${min} min ${resto} s` : `${min} min`;
}

export function haQuanto(iso: string, agora: number = Date.now()): string {
  const diff = Math.max(0, agora - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} dias`;
}

const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

/** "em 12 min", "hoje, 14:00", "amanhã, 08:00", "sex, 08:00", "20/10, 11:00". */
export function quandoFuturo(iso: string, agora: Date = new Date()): string {
  const d = new Date(iso);
  const diff = d.getTime() - agora.getTime();
  if (diff < 60 * 60_000) return `em ${Math.max(1, Math.round(diff / 60_000))} min`;
  const dia = spDateStr(d);
  const hoje = spDateStr(agora);
  const amanha = spDateStr(new Date(agora.getTime() + 86400_000));
  if (dia === hoje) return `hoje, ${hora(d)}`;
  if (dia === amanha) return `amanhã, ${hora(d)}`;
  if (diff < 6 * 86400_000) {
    const sem = d.toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "short" }).replace(".", "");
    return `${sem}, ${hora(d)}`;
  }
  return `${d.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" })}, ${hora(d)}`;
}

export function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** 26 → "26 h"; 192 → "8 dias". */
export function horasHumanas(h: number): string {
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} dias`;
}
