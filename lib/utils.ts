import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { AttentionLevel, ClientStatus, Priority } from "./types";

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
    onboarding: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
    good: "text-zinc-300 bg-zinc-500/10 border-zinc-500/20",
    average: "text-zinc-300 bg-zinc-500/10 border-zinc-500/20",
    at_risk: "text-red-500 bg-red-500/10 border-red-500/20",
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
    low: "text-zinc-500 bg-zinc-500/10 border-zinc-500/20",
    medium: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
    high: "text-zinc-300 bg-zinc-400/10 border-zinc-400/20",
    critical: "text-red-500 bg-red-500/10 border-red-500/20",
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
