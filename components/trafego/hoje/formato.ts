// components/trafego/hoje/formato.ts — como os números do Hoje aparecem na tela. Puro.

import type { NivelAlerta } from "@/lib/traffic/hoje/tipos";

export function reais(n: number | null | undefined, casas = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** "~4 dias", "acaba hoje", "mais de 30 dias". */
export function duracao(dias: number | null | undefined): string | null {
  if (dias === null || dias === undefined || !Number.isFinite(dias)) return null;
  if (dias < 1) return "acaba hoje";
  if (dias > 30) return "mais de 30 dias";
  const n = Math.round(dias);
  return `~${n} ${n === 1 ? "dia" : "dias"}`;
}

/** Variação de ontem contra a média (fração: −0,3 = 30% abaixo). Null quando não dá pra comparar. */
export function variacao(atual: number | null | undefined, media: number | null | undefined): number | null {
  if (atual === null || atual === undefined || media === null || media === undefined || media <= 0) return null;
  return (atual - media) / media;
}

export function pct(v: number): string {
  const n = Math.round(Math.abs(v) * 100);
  return `${v < 0 ? "−" : "+"}${n}%`;
}

/** "09:12" em São Paulo. */
export function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** "hoje às 09:12", "amanhã às 09:12" ou "26/09 às 09:12" (São Paulo). */
export function quando(iso: string, agora = new Date()): string {
  const dia = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const alvo = dia(new Date(iso));
  const hoje = dia(agora);
  const amanha = dia(new Date(agora.getTime() + 86_400_000));
  const prefixo = alvo === hoje ? "hoje" : alvo === amanha ? "amanhã" : ddmm(alvo);
  return `${prefixo} às ${hora(iso)}`;
}

/** "há 12 min", "há 2 h", "ontem". */
export function haQuanto(iso: string | null | undefined, agora = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const min = Math.max(0, Math.round((agora - t) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

export function ddmm(ymd: string): string {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
}

/** Cores por gravidade — só tokens lone-* com fundo/borda prontos (os lone-* não aceitam /NN). */
export const COR: Record<NivelAlerta, { texto: string; chip: string; barra: string }> = {
  critical: { texto: "text-lone-danger", chip: "bg-lone-danger-bg text-lone-danger border-lone-danger-border", barra: "bg-lone-danger" },
  warning: { texto: "text-lone-warning", chip: "bg-lone-warning-bg text-lone-warning border-lone-warning-border", barra: "bg-lone-warning" },
  info: { texto: "text-lone-info", chip: "bg-lone-info-bg text-lone-info border-lone-info-border", barra: "bg-lone-info" },
};

export const ROTULO_NIVEL: Record<NivelAlerta, string> = { critical: "Crítico", warning: "Atenção", info: "Acompanhar" };
