import { describe, it, expect } from "vitest";
import { interpretar, podeAbordar, descrever, PADRAO } from "@/lib/cs/piloto";
import { propostaValida, ehConfirmacaoCurta, VALIDADE_PROPOSTA_H } from "@/lib/cs/agendar-reuniao";
import { cruza } from "@/lib/cs/conflito-reuniao";

describe("portão do lançamento progressivo", () => {
  it("sem a chave no banco, o agente CALA — nunca cai em 'todos'", () => {
    expect(interpretar(null)).toEqual(PADRAO);
    expect(podeAbordar(interpretar(null), "qualquer-id")).toBe(false);
  });

  it("JSON quebrado também cala", () => {
    expect(interpretar("{isso não é json")).toEqual(PADRAO);
    expect(interpretar('{"modo":"TODOS!!"}').modo).toBe("off");
  });

  it("piloto só deixa passar quem está na lista", () => {
    const a = interpretar('{"modo":"piloto","clientes":["a","b"]}');
    expect(podeAbordar(a, "a")).toBe(true);
    expect(podeAbordar(a, "c")).toBe(false);
  });

  it("piloto com lista vazia não aborda ninguém, e diz isso", () => {
    const a = interpretar('{"modo":"piloto","clientes":[]}');
    expect(podeAbordar(a, "a")).toBe(false);
    expect(descrever(a)).toContain("VAZIA");
  });

  it("todos libera geral", () => {
    expect(podeAbordar(interpretar('{"modo":"todos"}'), "qualquer")).toBe(true);
  });
});

describe("validade da proposta", () => {
  const agora = new Date("2026-09-10T12:00:00-03:00");
  const hAtras = (h: number) => new Date(agora.getTime() - h * 3600_000).toISOString();

  it("proposta de hoje vale", () => {
    expect(propostaValida(hAtras(3), agora)).toBe(true);
  });

  it(`proposta de mais de ${VALIDADE_PROPOSTA_H}h não vale`, () => {
    expect(propostaValida(hAtras(VALIDADE_PROPOSTA_H + 1), agora)).toBe(false);
  });

  it("sem data de proposta, não vale", () => {
    expect(propostaValida(null, agora)).toBe(false);
    expect(propostaValida("data podre", agora)).toBe(false);
  });

  it("o aceite curto é reconhecido mesmo depois de expirar", () => {
    for (const t of ["pode", "isso", "beleza", "ok", "perfeito", "combinado"]) {
      expect(ehConfirmacaoCurta(t)).toBe(true);
    }
  });

  it("recusa não é aceite", () => {
    expect(ehConfirmacaoCurta("não vai dar")).toBe(false);
    expect(ehConfirmacaoCurta("")).toBe(false);
  });
});

describe("conflito de horário", () => {
  const d = (s: string) => new Date(`2026-09-15T${s}:00-03:00`);

  it("sobreposição parcial conflita", () => {
    expect(cruza(d("14:00"), d("15:00"), d("14:30"), d("15:30"))).toBe(true);
  });

  it("uma dentro da outra conflita", () => {
    expect(cruza(d("14:00"), d("16:00"), d("14:30"), d("15:00"))).toBe(true);
  });

  it("encostadas NÃO conflitam — 14h-15h e 15h-16h cabem no dia", () => {
    expect(cruza(d("14:00"), d("15:00"), d("15:00"), d("16:00"))).toBe(false);
  });

  it("separadas não conflitam", () => {
    expect(cruza(d("09:00"), d("10:00"), d("15:00"), d("16:00"))).toBe(false);
  });
});

describe("aceite curto x horário novo", () => {
  it("“pode ser dia 20 às 10h” NÃO é aceite — é horário novo", () => {
    expect(ehConfirmacaoCurta("pode ser dia 20 às 10h")).toBe(false);
    expect(ehConfirmacaoCurta("ok, mas pode ser 16h?")).toBe(false);
  });
  it("mas “pode ser” sozinho é aceite", () => {
    expect(ehConfirmacaoCurta("pode ser")).toBe(true);
    expect(ehConfirmacaoCurta("pode sim!")).toBe(true);
  });
});
