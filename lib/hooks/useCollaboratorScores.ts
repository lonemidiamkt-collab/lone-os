"use client";

// Produção + score REAIS por colaborador para a tela Metas & OKRs.
// Tudo derivado de dado real do sistema (nada inventado):
//  - designer  → artes que ELE entregou no mês (content_cards.designer_delivered_by) + % no prazo + tempo médio
//  - social    → posts que ELE publicou no mês (content_cards.social_media) + carteira (clients.assigned_social) + saúde
//  - traffic   → carteira dele (clients.assigned_traffic) + verba sob gestão + saúde média
// O "score" é uma nota 0–100 ancorada em desempenho real (não é meta arbitrária):
//  - designer: % de entregas no prazo
//  - social/traffic: saúde média da carteira (reflete como as contas dele estão indo)

import { useMemo } from "react";
import { useAppState } from "@/lib/context/AppStateContext";
import { calcHealthScore } from "@/lib/utils";
import type { TeamMember } from "@/lib/hooks/useTeamMembers";

export interface CollabStat { label: string; value: string }
export interface CollabScore {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  score: number | null;      // 0–100; null = sem produção medível este mês
  scoreBasis: string;        // o que o score mede (transparência)
  produced: number;          // volume principal (p/ ordenar)
  stats: CollabStat[];
  tone: "success" | "warning" | "danger" | "muted";
}

const ROLE_LABEL: Record<string, string> = {
  traffic: "Tráfego", social: "Social", designer: "Design",
  manager: "Gerente", comercial: "Comercial", admin: "Admin",
};

function monthBounds() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const last = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}
function inMonth(d?: string) {
  if (!d) return false;
  const { start, end } = monthBounds();
  const day = d.slice(0, 10);
  return day >= start && day <= end;
}
function daysBetween(a: string, b: string) {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}
function toneFor(score: number | null): CollabScore["tone"] {
  if (score == null) return "muted";
  if (score >= 80) return "success";
  if (score >= 60) return "warning";
  return "danger";
}
const brl = (n: number) => `R$ ${Math.round(n).toLocaleString("pt-BR")}`;

export function useCollaboratorScores(teamMembers: TeamMember[]): CollabScore[] {
  const { clients, contentCards } = useAppState();

  return useMemo(() => {
    const people = (teamMembers ?? []).filter((m) => m.role !== "admin" && m.role !== "manager");

    const rows: CollabScore[] = people.map((m) => {
      const name = m.name;
      const role = m.role as string;

      if (role === "designer") {
        const delivered = contentCards.filter((c) => c.designerDeliveredBy === name && inMonth(c.designerDeliveredAt));
        const onTime = delivered.filter((c) => c.dueDate && c.designerDeliveredAt && c.designerDeliveredAt.slice(0, 10) <= c.dueDate).length;
        const withTime = delivered.filter((c) => c.designerDeliveredAt && (c.workStartedAt || c.statusChangedAt));
        const avgDays = withTime.length
          ? withTime.reduce((s, c) => s + daysBetween((c.workStartedAt ?? c.statusChangedAt)!, c.designerDeliveredAt!), 0) / withTime.length
          : null;
        const onTimePct = delivered.length ? Math.round((onTime / delivered.length) * 100) : null;
        return {
          id: m.id, name, role, roleLabel: ROLE_LABEL[role] ?? role,
          score: onTimePct, scoreBasis: "% de entregas no prazo",
          produced: delivered.length,
          stats: [
            { label: "Entregas no mês", value: String(delivered.length) },
            { label: "No prazo", value: onTimePct == null ? "—" : `${onTimePct}%` },
            { label: "Tempo médio", value: avgDays == null ? "—" : `${avgDays.toFixed(1)} d` },
          ],
          tone: toneFor(onTimePct),
        };
      }

      if (role === "social") {
        const posts = contentCards.filter((c) => c.socialMedia === name && c.status === "published" && inMonth(c.statusChangedAt));
        const myClients = clients.filter((c) => c.assignedSocial === name);
        const avgHealth = myClients.length ? Math.round(myClients.reduce((s, c) => s + calcHealthScore(c), 0) / myClients.length) : null;
        return {
          id: m.id, name, role, roleLabel: ROLE_LABEL[role] ?? role,
          score: avgHealth, scoreBasis: "saúde média da carteira",
          produced: posts.length,
          stats: [
            { label: "Posts no mês", value: String(posts.length) },
            { label: "Clientes", value: String(myClients.length) },
            { label: "Saúde carteira", value: avgHealth == null ? "—" : `${avgHealth}/100` },
          ],
          tone: toneFor(avgHealth),
        };
      }

      if (role === "traffic") {
        const myClients = clients.filter((c) => c.assignedTraffic === name);
        const avgHealth = myClients.length ? Math.round(myClients.reduce((s, c) => s + calcHealthScore(c), 0) / myClients.length) : null;
        const budget = myClients.reduce((s, c) => s + (Number(c.monthlyBudget) || 0), 0);
        return {
          id: m.id, name, role, roleLabel: ROLE_LABEL[role] ?? role,
          score: avgHealth, scoreBasis: "saúde média da carteira",
          produced: myClients.length,
          stats: [
            { label: "Clientes", value: String(myClients.length) },
            { label: "Verba sob gestão", value: budget > 0 ? brl(budget) : "—" },
            { label: "Saúde carteira", value: avgHealth == null ? "—" : `${avgHealth}/100` },
          ],
          tone: toneFor(avgHealth),
        };
      }

      // comercial / outros papéis sem produção medível na tela ainda
      return {
        id: m.id, name, role, roleLabel: ROLE_LABEL[role] ?? role,
        score: null, scoreBasis: "sem métrica de produção conectada",
        produced: 0,
        stats: [{ label: "Produção", value: "sem dado conectado" }],
        tone: "muted",
      };
    });

    // ordena: maior produção primeiro, quem não tem produção medível no fim
    return rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.produced - a.produced);
  }, [teamMembers, clients, contentCards]);
}
