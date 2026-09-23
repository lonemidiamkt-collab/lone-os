import { describe, it, expect } from "vitest";

// Regra do portal público (23/09): além de token válido e não revogado, o cliente precisa estar ATIVO.
// Três ex-clientes seguiam com o painel aberto depois de arquivados.
function portalLiberado(c: { public_report_enabled?: boolean; public_report_token_revoked_at?: string | null; active?: boolean | null; churned_at?: string | null } | null): boolean {
  return !(!c || !c.public_report_enabled || c.public_report_token_revoked_at || c.active === false || c.churned_at);
}

describe("quem pode abrir o portal", () => {
  const base = { public_report_enabled: true, public_report_token_revoked_at: null, active: true, churned_at: null };
  it("cliente ativo com token válido entra", () => expect(portalLiberado(base)).toBe(true));
  it("active null (legado, nunca desativado) continua entrando", () => expect(portalLiberado({ ...base, active: null })).toBe(true));
  it("desativado não entra", () => expect(portalLiberado({ ...base, active: false })).toBe(false));
  it("arquivado (churn) não entra, mesmo ativo por engano", () => expect(portalLiberado({ ...base, churned_at: "2026-08-01" })).toBe(false));
  it("token revogado ou portal desligado não entra", () => {
    expect(portalLiberado({ ...base, public_report_token_revoked_at: "2026-09-01" })).toBe(false);
    expect(portalLiberado({ ...base, public_report_enabled: false })).toBe(false);
  });
});
