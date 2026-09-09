import { describe, it, expect } from "vitest";
import {
  avaliar, checklist, frasesDoTermo, tempoDeParceria, type Offboarding,
} from "@/lib/clients/offboarding";

const HOJE = new Date("2026-09-09T12:00:00-03:00");
const base: Offboarding = {
  id: "o1", clientId: "c1", iniciativa: "cliente", motivo: "preco",
  solicitadoEm: "2026-09-09", encerraEm: "2026-09-10", estado: "rascunho",
};

describe("o termo não afirma o que ninguém conferiu", () => {
  it("sem conferir, o termo DIZ que não conferiu", () => {
    const f = frasesDoTermo(base);
    expect(f.financeiro).toContain("não foi conferida");
    expect(f.financeiro).not.toContain("Não há pendências");
  });

  it("conferido e sem dívida, aí sim afirma", () => {
    expect(frasesDoTermo({ ...base, financeiroOk: true }).financeiro)
      .toBe("Não há pendências financeiras entre as partes.");
  });

  it("conferido COM dívida, o termo diz a dívida", () => {
    const f = frasesDoTermo({ ...base, financeiroOk: false, financeiroNota: "setembro em aberto" });
    expect(f.financeiro).toContain("pendências financeiras em aberto");
    expect(f.financeiro).toContain("setembro em aberto");
  });

  it("o mesmo vale para as entregas", () => {
    expect(frasesDoTermo(base).entregas).toContain("não foi conferida");
    expect(frasesDoTermo({ ...base, entregasOk: true }).entregas).toContain("foram concluídas");
  });
});

describe("checklist derivado dos fatos, não de caixinhas", () => {
  it("nada feito: só motivo e data marcados", () => {
    const c = checklist(base);
    expect(c.find((i) => i.chave === "motivo")?.feito).toBe(true);
    expect(c.find((i) => i.chave === "termo")?.feito).toBe(false);
    expect(c.find((i) => i.chave === "envio")?.feito).toBe(false);
  });

  it("CONFERIR e achar dívida também é conferir", () => {
    // `null` é "ninguém olhou"; `false` é "olhei e tem pendência". Só o primeiro fica em aberto.
    expect(checklist({ ...base, financeiroOk: false }).find((i) => i.chave === "financeiro")?.feito).toBe(true);
    expect(checklist({ ...base, financeiroOk: null }).find((i) => i.chave === "financeiro")?.feito).toBe(false);
  });

  it("completo exige tudo que é essencial — ciência do cliente não trava", () => {
    const cheio: Offboarding = {
      ...base, financeiroOk: true, entregasOk: true,
      termoPath: "x.pdf", enviadoEm: "2026-09-09T10:00:00Z",
    };
    const s = avaliar(cheio, HOJE);
    expect(s.completo).toBe(true);
    expect(s.faltando.map((i) => i.chave)).toEqual(["ciencia"]);
  });
});

describe("alertas operacionais", () => {
  it("encerra amanhã e o termo não saiu", () => {
    expect(avaliar(base, HOJE).alertas.join(" ")).toContain("Encerra amanhã");
  });

  it("encerra HOJE e o termo não saiu", () => {
    expect(avaliar({ ...base, encerraEm: "2026-09-09" }, HOJE).alertas.join(" ")).toContain("Encerra HOJE");
  });

  it("a data passou e ninguém concluiu", () => {
    const s = avaliar({ ...base, solicitadoEm: "2026-09-01", encerraEm: "2026-09-05" }, HOJE);
    expect(s.diasParaEncerrar).toBe(-4);
    expect(s.alertas.join(" ")).toContain("passou há 4 dia(s)");
  });

  it("enviado, prazo vencido, sem confirmação do cliente", () => {
    const s = avaliar({
      ...base, solicitadoEm: "2026-09-01", encerraEm: "2026-09-05",
      enviadoEm: "2026-09-04T10:00:00Z", estado: "termo_enviado",
    }, HOJE);
    expect(s.alertas.join(" ")).toContain("ainda não confirmou");
  });

  it("pendência financeira aparece como alerta — é o que some quando o cliente sai", () => {
    const s = avaliar({ ...base, financeiroOk: false, financeiroNota: "2 meses" }, HOJE);
    expect(s.alertas.join(" ")).toContain("Pendência financeira");
  });

  it("tudo em ordem e concluído não alerta nada", () => {
    const s = avaliar({
      ...base, solicitadoEm: "2026-08-01", encerraEm: "2026-08-31", estado: "concluido",
      financeiroOk: true, entregasOk: true, termoPath: "x", enviadoEm: "z", confirmadoEm: "w",
    }, HOJE);
    expect(s.alertas).toHaveLength(0);
  });
});

describe("tempo de parceria", () => {
  it("meses", () => expect(tempoDeParceria("2026-05-04", "2026-09-10")).toBe("4 meses"));
  it("um mês no singular", () => expect(tempoDeParceria("2026-08-01", "2026-09-02")).toBe("1 mês"));
  it("menos de um mês vira dias", () => expect(tempoDeParceria("2026-09-01", "2026-09-10")).toBe("9 dias"));
  it("mais de um ano", () => expect(tempoDeParceria("2024-01-10", "2026-04-10")).toBe("2a 3m"));
  it("ano redondo", () => expect(tempoDeParceria("2025-09-10", "2026-09-10")).toBe("1 ano"));
});
