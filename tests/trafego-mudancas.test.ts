// tests/trafego-mudancas.test.ts — Leva 7A (N2) "O que mudou ontem": dois retratos, as diferenças.

import { describe, it, expect } from "vitest";
import { compararEstados, orcamentoDiarioAtivo, statusPt, type EstadoEntidade } from "@/lib/trafego/mudancas";

// toLocaleString("pt-BR", currency) usa espaço não separável depois do "R$".
const sp = (t: string) => t.replace(/\u00a0/g, " ");

const e = (id: string, o: Partial<EstadoEntidade> = {}): EstadoEntidade => ({
  client_id: "c", nivel: "campaign", entity_id: id, entity_name: `Camp ${id}`, campaign_id: id, campaign_name: `Camp ${id}`,
  status: "ACTIVE", effective_status: "ACTIVE", daily_budget: 50, lifetime_budget: null, ...o,
});

describe("o que mudou", () => {
  it("nada mudou: lista vazia", () => {
    expect(compararEstados([e("1")], [e("1")])).toEqual([]);
  });

  it("orçamento subiu: de → para com a variação", () => {
    const [m] = compararEstados([e("1")], [e("1", { daily_budget: 80 })]);
    expect(m.tipo).toBe("orcamento");
    expect(sp(m.texto)).toBe("Orçamento diário R$ 50 → R$ 80/dia (+60%)");
    expect(m.variacaoPct).toBe(60);
  });

  it("pausou e ativou, com a concordância certa (campanha / conjunto)", () => {
    const [p] = compararEstados([e("1")], [e("1", { status: "PAUSED", effective_status: "PAUSED" })]);
    expect(p).toMatchObject({ tipo: "pausou", texto: "Campanha pausada" });
    const conj = { nivel: "adset" as const, campaign_id: "9", campaign_name: "Camp 9" };
    const [a] = compararEstados([e("2", { ...conj, status: "PAUSED" })], [e("2", conj)]);
    expect(a).toMatchObject({ tipo: "ligou", texto: "Conjunto ativado", campanha: "Camp 9" });
  });

  it("ligada, mas a Meta reprovou: parou de entregar", () => {
    const [m] = compararEstados([e("1")], [e("1", { effective_status: "DISAPPROVED" })]);
    expect(m).toMatchObject({ tipo: "entrega", texto: "Campanha parou de entregar (reprovada)" });
  });

  it("nova no ar entra; pausada nova não; sumiu no ar vira 'saiu do ar'", () => {
    const r = compararEstados([e("1")], [e("2", { daily_budget: 30 }), e("3", { status: "PAUSED" })]);
    expect(r.map((m) => m.tipo).sort()).toEqual(["nova", "saiu"]);
    expect(sp(r.find((m) => m.tipo === "nova")!.texto)).toBe("Campanha nova no ar · R$ 30/dia");
  });

  it("pausar vem antes de mexer no orçamento", () => {
    const r = compararEstados([e("1"), e("2")], [e("1", { daily_budget: 60 }), e("2", { status: "PAUSED" })]);
    expect(r[0].tipo).toBe("pausou");
  });

  it("hora da alteração só quando a Meta diz que mudou no dia comparado", () => {
    const [m] = compararEstados([e("1")], [e("1", { daily_budget: 70, updated_time: "2026-09-24T17:30:00-0300" })], "2026-09-24");
    expect(m.horaMeta).toBe("17:30");
    const [n] = compararEstados([e("1")], [e("1", { daily_budget: 70, updated_time: "2026-09-20T17:30:00-0300" })], "2026-09-24");
    expect(n.horaMeta).toBeNull();
  });

  it("orçamento diário ativo: campanha CBO + conjunto de campanha ativa", () => {
    expect(orcamentoDiarioAtivo([
      e("1", { daily_budget: 100 }),
      e("2", { status: "PAUSED", daily_budget: 999, entity_id: "2" }),
      e("a", { nivel: "adset", campaign_id: "1", daily_budget: 20 }),
      e("b", { nivel: "adset", campaign_id: "2", daily_budget: 30 }), // campanha pausada: não conta
    ])).toBe(120);
    expect(statusPt("WITH_ISSUES")).toBe("com problema");
  });
});
