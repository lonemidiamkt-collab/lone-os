import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import type { AttentionLevel, Client, ClientStatus, Priority } from "./types";

// Os tamanhos lone-* (tailwind.config → fontSize) não são conhecidos do twMerge: sem isto ele os
// trata como COR e, quando a mesma lista traz uma cor de texto, descarta o tamanho em silêncio.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["lone-hero", "lone-h1", "lone-h2", "lone-body", "lone-caption", "lone-eyebrow"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function getStatusLabel(status: ClientStatus) {
  const map: Record<ClientStatus, string> = {
    onboarding: "Onboarding",
    good: "Ativo",
    average: "Atenção",
    at_risk: "Crítico",
  };
  return map[status];
}

// Neutral badge — no colored backgrounds
export function getStatusColor(status: ClientStatus) {
  const map: Record<ClientStatus, string> = {
    onboarding: "text-muted-foreground bg-muted border-border",
    good: "text-secondary-foreground bg-muted border-border",
    average: "text-secondary-foreground bg-muted border-border",
    at_risk: "text-lone-danger bg-lone-danger-bg border-lone-danger-border",
  };
  return map[status];
}

// LED class for health indicator
export function getStatusLed(status: ClientStatus) {
  const map: Record<ClientStatus, string> = {
    onboarding: "led led-attention",
    good: "led led-healthy",
    average: "led led-attention",
    at_risk: "led led-critical",
  };
  return map[status];
}

export function getAttentionLabel(level: AttentionLevel) {
  const map: Record<AttentionLevel, string> = {
    low: "Baixo",
    medium: "Médio",
    high: "Alto",
    critical: "Crítico",
  };
  return map[level];
}

export function getAttentionColor(level: AttentionLevel) {
  const map: Record<AttentionLevel, string> = {
    low: "level-low",
    medium: "level-medium",
    high: "level-high",
    critical: "level-critical",
  };
  return map[level];
}

export function getPriorityColor(priority: Priority) {
  const map: Record<Priority, string> = {
    low: "text-lone-text-tertiary bg-muted border-border",
    medium: "text-muted-foreground bg-muted border-border",
    high: "text-secondary-foreground bg-muted border-lone-border-strong",
    critical: "text-lone-danger bg-lone-danger-bg border-lone-danger-border",
  };
  return map[priority];
}

export function getPriorityLabel(priority: Priority) {
  const map: Record<Priority, string> = {
    low: "Baixa",
    medium: "Média",
    high: "Alta",
    critical: "Crítica",
  };
  return map[priority];
}

export function daysSince(dateStr: string) {
  const then = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

/** "YYYY-MM-DD" no fuso de São Paulo (BRT). Use pra comparar datas/entregas sem drift de UTC —
 *  `iso.slice(0,10)` ou `new Date().toISOString()` dão a data em UTC e "pulam o dia" à noite no BRT. */
export function spDateStr(iso?: string | number | Date): string {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return typeof iso === "string" ? iso.slice(0, 10) : "";
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** "Hoje" em São Paulo como "YYYY-MM-DD". */
export function todaySP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Format date consistently across the app */
export function formatDate(dateStr: string, style: "short" | "long" | "relative" = "short"): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  if (style === "relative") {
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return "agora";
    if (diff < 3600) return `${Math.floor(diff / 60)}min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }

  if (style === "long") {
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Format number with abbreviation (1.2k, 3.5M) */
export function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toString();
}

/** Format milliseconds into human-readable time (e.g. "2h 15m", "45m", "3d 2h") */
export function formatTimeSpent(ms: number): string {
  if (ms <= 0) return "0m";
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

/** Get live time spent (accumulated + current session if in progress) */
export function getLiveTimeSpentMs(workStartedAt?: string, totalTimeSpentMs?: number): number {
  const accumulated = totalTimeSpentMs ?? 0;
  if (!workStartedAt) return accumulated;
  return accumulated + (Date.now() - new Date(workStartedAt).getTime());
}

/** Over-time threshold in ms (8 hours) */
export const OVERTIME_THRESHOLD_MS = 8 * 60 * 60 * 1000;

/**
 * Saúde 0-100 (100 = saudável). A fonte é clients.current_health_score, gravado por /api/scores;
 * a conta abaixo é só o fallback de quando o cache não veio.
 */
export function calcHealthScore(
  client: Pick<Client, "status" | "attentionLevel" | "lastPostDate"> & { currentHealthScore?: number | null },
): number {
  if (typeof client.currentHealthScore === "number" && Number.isFinite(client.currentHealthScore)) {
    return Math.max(0, Math.min(100, Math.round(client.currentHealthScore)));
  }
  let score = 50;
  // Status
  if (client.status === "good") score += 20;
  else if (client.status === "average") score -= 5;
  else if (client.status === "at_risk") score -= 30;
  // Attention level
  if (client.attentionLevel === "low") score += 10;
  else if (client.attentionLevel === "high") score -= 10;
  else if (client.attentionLevel === "critical") score -= 25;
  // Post recency
  if (client.lastPostDate) {
    const days = daysSince(client.lastPostDate);
    if (days <= 3) score += 10;
    else if (days > 7) score -= 15;
  }
  return Math.max(0, Math.min(100, score));
}
