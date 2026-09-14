import { describe, it, expect } from "vitest";
import { ehPedidoPrioridades, formatarTop } from "@/lib/priority/comando";

describe("Lone, o que preciso fazer hoje?", () => {
  it("reconhece as formas de perguntar, só com o nome", () => {
    for (const t of ["Lone, o que preciso fazer hoje?", "loninho oque eu tenho pra fazer", "Lone minhas prioridades de hoje", "Lone, por onde eu começo?", "lone o que tá mais urgente"]) {
      expect(ehPedidoPrioridades(t), t).toBe(true);
    }
    expect(ehPedidoPrioridades("o que preciso fazer hoje?")).toBe(false); // sem chamar
    expect(ehPedidoPrioridades("Lone, cria uma demanda")).toBe(false);
  });

  it("texto separa FATO de FAÇA e mostra R$ quando há", () => {
    const t = formatarTop([{ cliente: "Quero Tintas", fato: ["CPL 2,7× a meta"], recomendacao: "Pausar o conjunto X", exposicaoRs: 120, fonte: "trafego" }], "Julio Cesar");
    expect(t).toContain("Julio, suas prioridade agora");
    expect(t).toContain("*1. Quero Tintas* (R$ 120/dia)");
    expect(t).toContain("Fato: CPL 2,7× a meta");
    expect(t).toContain("Faça: Pausar o conjunto X");
    expect(formatarTop([], "Carlos")).toMatch(/nada aberto no seu nome/);
  });
});
