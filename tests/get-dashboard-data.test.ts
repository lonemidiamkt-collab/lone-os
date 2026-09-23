import { describe, it, expect } from "vitest";
import { getDashboardData } from "@/lib/dashboard/getDashboardData";
import type { ContentCard } from "@/lib/types";

// Card já aprovado pelo cliente (clientApprovedAt setado) aparecia ao mesmo tempo em
// "Urgências do dia" (pendingApproval) como aguardando aprovação E em "O que precisa de
// atenção" (insights de client_approved_at) como já aprovado, pode postar — duas seções
// contradizendo o mesmo registro. pendingApproval agora exclui quem já foi aprovado.
function makeCard(overrides: Partial<ContentCard>): ContentCard {
  return {
    id: "card-1",
    title: "Post teste",
    clientId: "client-1",
    clientName: "Cliente Teste",
    socialMedia: "Fulano",
    status: "approval",
    priority: "medium",
    format: "feed",
    ...overrides,
  };
}

const emptyArgs = {
  clients: [],
  designRequests: [],
  tasks: [],
  trafficRoutineChecks: [],
};

describe("getDashboardData — pendingApproval não contradiz cards já aprovados pelo cliente", () => {
  it("card em 'client_approval' com clientApprovedAt setado NÃO conta como pendente", () => {
    const result = getDashboardData({
      ...emptyArgs,
      contentCards: [
        makeCard({ status: "client_approval", clientApprovedAt: "2026-09-20T10:00:00.000Z" }),
      ],
    });
    expect(result.pendingApproval).toBe(0);
  });

  it("card em 'client_approval' SEM clientApprovedAt conta como pendente", () => {
    const result = getDashboardData({
      ...emptyArgs,
      contentCards: [makeCard({ status: "client_approval" })],
    });
    expect(result.pendingApproval).toBe(1);
  });

  it("card em 'approval' (aprovação interna, ainda não foi ao cliente) conta como pendente", () => {
    const result = getDashboardData({
      ...emptyArgs,
      contentCards: [makeCard({ status: "approval" })],
    });
    expect(result.pendingApproval).toBe(1);
  });

  it("card publicado não conta, com ou sem clientApprovedAt", () => {
    const result = getDashboardData({
      ...emptyArgs,
      contentCards: [
        makeCard({ status: "published", clientApprovedAt: "2026-09-20T10:00:00.000Z" }),
        makeCard({ status: "published" }),
      ],
    });
    expect(result.pendingApproval).toBe(0);
  });
});
