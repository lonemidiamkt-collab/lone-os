// "Cobrar cliente" (lib/conteudo/cobrar-cliente.ts, Leva 7B N11): rascunho para o social copiar
// quando o card está com o cliente há 24h/48h. Nada aqui envia mensagem.
import { describe, it, expect } from "vitest";
import { cobrancaDoCard, comOClienteDesde, nivelDaCobranca, rascunhoDeCobranca } from "@/lib/conteudo/cobrar-cliente";

const agora = Date.parse("2026-09-24T15:00:00-03:00");
const HOJE = "2026-09-24";
const card = (p = {}) => ({
  title: "Promo de pisos", status: "client_approval", dueDate: "2026-09-26",
  columnEnteredAt: { client_approval: "2026-09-23T10:00:00-03:00" }, ...p,
});

describe("quando cobrar", () => {
  it("só com o cliente, sem aprovação, sem arquivo", () => {
    expect(comOClienteDesde(card())).toBe("2026-09-23T10:00:00-03:00");
    expect(comOClienteDesde(card({ status: "approval" }))).toBeNull();
    expect(comOClienteDesde(card({ clientApprovedAt: "2026-09-23T12:00:00Z" }))).toBeNull();
    expect(comOClienteDesde(card({ archivedAt: "2026-09-23T12:00:00Z" }))).toBeNull();
    expect(comOClienteDesde(card({ columnEnteredAt: {}, statusChangedAt: "2026-09-22T09:00:00Z" }))).toBe("2026-09-22T09:00:00Z");
  });
  it("24h e 48h", () => {
    expect(nivelDaCobranca(23)).toBeNull();
    expect(nivelDaCobranca(24)).toBe(24);
    expect(nivelDaCobranca(47)).toBe(24);
    expect(nivelDaCobranca(48)).toBe(48);
  });
  it("menos de 24h: nada", () => {
    expect(cobrancaDoCard(card({ columnEnteredAt: { client_approval: "2026-09-24T09:00:00-03:00" } }), { agoraMs: agora, hoje: HOJE })).toBeNull();
  });
});

describe("o rascunho", () => {
  it("24h: lembra com leveza, cita a arte e a data do post", () => {
    const c = cobrancaDoCard(card(), { agoraMs: agora, hoje: HOJE, contato: "Marcos Silva" })!;
    expect(c.nivel).toBe(24);
    expect(c.horas).toBe(29);
    expect(c.rascunho).toContain("Oi, Marcos!");
    expect(c.rascunho).toContain('lembrar da arte "Promo de pisos", que mandamos ontem');
    expect(c.rascunho).toContain("sábado, 26/09");
  });
  it("48h: fala do impacto com a data do post", () => {
    const c = cobrancaDoCard(card({ columnEnteredAt: { client_approval: "2026-09-22T10:00:00-03:00" } }), { agoraMs: agora, hoje: HOJE })!;
    expect(c.nivel).toBe(48);
    expect(c.rascunho.startsWith("Oi! Tudo bem?")).toBe(true);
    expect(c.rascunho).toContain('A arte "Promo de pisos" ainda está esperando o seu ok.');
    expect(c.rascunho).toContain("com o seu ok até amanhã ele sai no dia certo");
  });
  it("48h com o post amanhã; sem data de post", () => {
    const amanha = rascunhoDeCobranca({ nivel: 48, titulo: "X", hoje: HOJE, enviadaEm: "2026-09-22", dataPost: "2026-09-25" });
    expect(amanha).toContain("previsto pra amanhã — sem a aprovação");
    const semData = rascunhoDeCobranca({ nivel: 24, titulo: "", hoje: HOJE, enviadaEm: "2026-09-21", dataPost: null });
    expect(semData).toContain("lembrar da arte do post, que mandamos há 3 dias");
    expect(semData).toContain("a gente já programa.");
  });
});
