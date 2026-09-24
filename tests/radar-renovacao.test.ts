// tests/radar-renovacao.test.ts — radar de renovação de contrato (Leva 7C, N22).

import { describe, it, expect } from "vitest";
import { diasAte, montarRadar, prazoRadar, type ContratoRadarRow } from "@/lib/clientes/radar-renovacao";

const HOJE = "2026-09-24";
const ativo = (id: string, client_id: string, end_date: string, extra: Partial<ContratoRadarRow> = {}): ContratoRadarRow =>
  ({ id, client_id, status: "active", end_date, version: 1, ...extra });
const clientes = [{ id: "a", nome: "Alfa", social: "Carlos" }, { id: "b", nome: "Beta" }, { id: "c", nome: "Gama" }, { id: "d", nome: "Delta" }];

describe("radar de renovação", () => {
  it("dias até o fim", () => {
    expect(diasAte(HOJE, "2026-09-24")).toBe(0);
    expect(diasAte(HOJE, "2026-10-24")).toBe(30);
    expect(diasAte(HOJE, "2026-11-23T00:00:00Z")).toBe(60);
  });

  it("60/30 dias, sem renovação andando, ordenado pelo mais urgente", () => {
    const r = montarRadar([
      ativo("1", "a", "2026-11-20"),                        // 57 dias → faixa 60
      ativo("2", "b", "2026-10-04"),                        // 10 dias → faixa 30
      ativo("3", "c", "2026-12-30"),                        // fora da janela
      ativo("4", "d", "2026-09-20"),                        // já venceu
    ], clientes, HOJE);
    expect(r.itens.map((i) => [i.cliente, i.dias, i.faixa])).toEqual([["Beta", 10, "30"], ["Alfa", 57, "60"]]);
    expect(r.itens[1].social).toBe("Carlos");
    expect(r.emAndamento).toBe(0);
  });

  it("rascunho de renovação, contrato seguinte ou versão mais nova tiram do radar", () => {
    const r = montarRadar([
      ativo("1", "a", "2026-10-10"), { id: "1r", client_id: "a", status: "draft", end_date: "2027-04-10", version: 2, renewal_draft_of: "1" },
      ativo("2", "b", "2026-10-10"), { id: "2n", client_id: "b", status: "draft", end_date: null, version: 1, previous_contract_id: "2" },
      ativo("3", "c", "2026-10-10", { version: 2 }), { id: "3n", client_id: "c", status: "draft", end_date: null, version: 3 },
      ativo("4", "d", "2026-10-10", { version: 2 }), { id: "4v", client_id: "d", status: "expired", end_date: "2026-01-01", version: 3 },
    ], clientes, HOJE);
    expect(r.itens.map((i) => i.cliente)).toEqual(["Delta"]); // versão vencida não conta como renovação
    expect(r.emAndamento).toBe(3);
  });

  it("cliente fora da carteira não entra; nenhum valor sai do radar", () => {
    const r = montarRadar([{ ...ativo("1", "zz", "2026-10-01"), monthly_value: 5000 } as ContratoRadarRow, { ...ativo("2", "a", "2026-10-01"), monthly_value: 5000 } as ContratoRadarRow], clientes, HOJE);
    expect(r.itens.map((i) => i.clientId)).toEqual(["a"]);
    expect(JSON.stringify(r)).not.toMatch(/5000|value|valor|R\$/i);
  });

  it("frase de prazo", () => {
    expect(prazoRadar(0)).toBe("vence hoje");
    expect(prazoRadar(1)).toBe("vence amanhã");
    expect(prazoRadar(12)).toBe("vence em 12 dias");
  });
});
