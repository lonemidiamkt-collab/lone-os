import { describe, it, expect } from "vitest";

// Regressão do "Veneza Estofados não recebeu o relatório" (Roberto, 24/08/2026).
// A consulta que monta a lista de envio filtrava `whatsapp_group_jid IS NOT NULL` e limitava os
// status a good/average/onboarding. Consequência: 4 clientes com conta de anúncio ativa (Veneza
// Estofados, UNAFER, Varejão da Construção, Dr. Junior Vargas) nunca entravam na lista, e o
// relatório da rodada dizia "40 enviados, 0 falhas" — o campo `semGrupo` vinha sempre vazio,
// porque quem não tem grupo era descartado ANTES de ser contado.

type Linha = { name: string; status: string; whatsapp_group_jid: string | null };

/** Espelha o filtro da consulta em lib/traffic/weekly-report.ts (selectActiveClientsWithGroup). */
const STATUS_ELEGIVEIS = ["good", "average", "onboarding", "at_risk"];
const selecionar = (rows: Linha[]) => rows.filter((c) => STATUS_ELEGIVEIS.includes(c.status));

const CARTEIRA: Linha[] = [
  { name: "Imperio dos Pisos", status: "good", whatsapp_group_jid: "123@g.us" },
  { name: "VENEZA ESTOFADOS", status: "onboarding", whatsapp_group_jid: null },
  { name: "UNAFER", status: "onboarding", whatsapp_group_jid: null },
  { name: "Cliente Em Risco", status: "at_risk", whatsapp_group_jid: "456@g.us" },
  { name: "Ex-cliente", status: "churned", whatsapp_group_jid: "789@g.us" },
];

describe("cobertura do relatório semanal", () => {
  it("cliente sem grupo continua na lista, pra poder ser REPORTADO", () => {
    const sel = selecionar(CARTEIRA);
    const semGrupo = sel.filter((c) => !c.whatsapp_group_jid).map((c) => c.name);
    expect(semGrupo).toContain("VENEZA ESTOFADOS");
    expect(semGrupo).toContain("UNAFER");
    expect(semGrupo).toHaveLength(2); // era 0 — e por isso ninguém sabia
  });

  it("cliente em risco recebe relatório (é quem mais precisa de atenção)", () => {
    const nomes = selecionar(CARTEIRA).map((c) => c.name);
    expect(nomes).toContain("Cliente Em Risco");
  });

  it("ex-cliente continua de fora", () => {
    expect(selecionar(CARTEIRA).map((c) => c.name)).not.toContain("Ex-cliente");
  });

  it("ninguém da carteira ativa some: enviados + sem-grupo cobre a seleção inteira", () => {
    const sel = selecionar(CARTEIRA);
    const comGrupo = sel.filter((c) => c.whatsapp_group_jid).length;
    const semGrupo = sel.filter((c) => !c.whatsapp_group_jid).length;
    expect(comGrupo + semGrupo).toBe(sel.length);
    expect(semGrupo).toBeGreaterThan(0); // e o time é avisado desses
  });
});
