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
    good: "Bons Resultados",
    average: "Resultados Médios",
    at_risk: "Em Risco",
  };
  return map[status];
}

export function getStatusColor(status: ClientStatus) {
  const map: Record<ClientStatus, string> = {
    onboarding: "text-blue-400 bg-blue-500/10 border-blue-500/30",
    good: "text-green-400 bg-green-500/10 border-green-500/30",
    average: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
    at_risk: "text-red-400 bg-red-500/10 border-red-500/30",
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
    low: "text-gray-400 bg-gray-500/10 border-gray-500/30",
    medium: "text-blue-400 bg-blue-500/10 border-blue-500/30",
    high: "text-orange-400 bg-orange-500/10 border-orange-500/30",
    critical: "text-red-400 bg-red-500/10 border-red-500/30",
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
