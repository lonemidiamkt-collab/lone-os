// tests/crm-sem-venda.test.ts — leva 3 (28/10/2026): cliente que entrou sem venda no Comercial e o contrato do grupo
// registrado no Lone OS.

import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/cs/notify", () => ({ csSendGroupText: async () => ({ ok: true }) }));
const { clientesSemVenda } = await import("@/lib/crm/sem-venda");
const { vigenciaDoGrupo } = await import("@/lib/contracts/registrar-do-grupo");

const c = (o: Record<string, unknown>) => ({ id: "c", name: "Loja", nome_fantasia: null, created_at: "2026-10-20T15:00:00Z", draft_status: null, source_lead_id: null, churned_at: null, ...o });

describe("entraram sem venda no Comercial", () => {
  it("só quem entrou desde o Comercial, sem venda ligada, sem ter saído, e não é teste; dispensado sai", () => {
    const lista = clientesSemVenda([
      c({ id: "boali", name: "Boali Araruama", draft_status: "awaiting_approval", created_at: "2026-10-15T15:00:00Z" }), // antes do Comercial
      c({ id: "novafer", name: "Novafer", created_at: "2026-10-26T15:00:00Z" }),
      c({ id: "mestre", name: "Mestre das Obras", draft_status: "pending_invite" }),
      c({ id: "jj", name: "JJ", source_lead_id: "lead-1" }),
      c({ id: "saiu", name: "Saiu", churned_at: "2026-10-25T00:00:00Z" }),
      c({ id: "teste", name: "test", nome_fantasia: "Lone Midia" }),
      c({ id: "dispensado", name: "Veneza NI" }),
    ], new Set(["dispensado"]));
    expect(lista.map((x) => [x.clientId, x.cadastro, x.entrouEm])).toEqual([["novafer", "completo", "2026-10-26"], ["mestre", "link", "2026-10-20"]]);
  });

  it("o dia de entrada é o de São Paulo (cadastro às 22h do dia 31 é do dia 31)", () => {
    expect(clientesSemVenda([c({ created_at: "2026-11-01T01:00:00Z" })], new Set())[0].entrouEm).toBe("2026-10-31");
  });
});

describe("contrato gerado no grupo: a vigência registrada", () => {
  it("ciclos = 3 meses a partir de hoje; prazo determinado = o combinado; início dito na frase vale", () => {
    expect(vigenciaDoGrupo({ modalidade: "ciclos" }, "2026-10-28")).toEqual({ inicio: "2026-10-28", fim: "2027-01-28", meses: 3 });
    expect(vigenciaDoGrupo({ modalidade: "determinado", duracaoMeses: 2, dataInicio: "2026-11-10" }, "2026-10-28")).toEqual({ inicio: "2026-11-10", fim: "2027-01-10", meses: 2 });
    expect(vigenciaDoGrupo({ modalidade: "ciclos", duracaoMeses: 12 }, "2026-10-28").meses).toBe(12);
  });
});
