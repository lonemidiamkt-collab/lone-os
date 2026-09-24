// components/client/ficha/rotulos.ts — nomes que a ficha do cliente mostra. Puro.

import type { Client } from "@/lib/types";

export const NOME_SERVICO: Record<string, string> = {
  lone_growth: "Lone Growth",
  assessoria_trafego: "Assessoria de Tráfego",
  assessoria_social: "Assessoria de Social",
  assessoria_design: "Assessoria de Design",
  trafego_pago: "Tráfego pago",
  trafego_social_site: "Tráfego + Social + Site",
  site: "Site",
};

export const NOME_PERFIL_CONTEUDO: Record<string, string> = {
  so_arte: "Só arte",
  video: "Vídeo (faz Reels)",
  completo: "Completo (vídeo, arte e stories)",
};

export function nomeServico(c: Pick<Client, "serviceType">): string | null {
  return c.serviceType ? NOME_SERVICO[c.serviceType] ?? c.serviceType : null;
}

export function nomeDaEmpresa(c: Pick<Client, "nomeFantasia" | "razaoSocial" | "name">): string {
  return c.nomeFantasia || c.razaoSocial || c.name;
}

/** "12/03/2025" → dias desde então (joinDate vem em DD/MM/AAAA ou AAAA-MM-DD). */
export function diasDesde(data: string | null | undefined, agora = new Date()): number | null {
  if (!data) return null;
  const br = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : data.slice(0, 10);
  const t = new Date(`${iso}T12:00:00-03:00`).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((agora.getTime() - t) / 86_400_000));
}

/** Data curta em São Paulo: "24/09". */
export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00-03:00`) : new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** Data e hora curtas em São Paulo: "24/09, 14:30". */
export function dataHoraCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}
