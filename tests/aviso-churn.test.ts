import { describe, it, expect } from "vitest";
import { textoAvisoChurn } from "@/lib/clients/aviso-churn";

const base = {
  cliente: "Quero Tintas", motivo: "pausa", saida: "2026-09-10",
  entrada: "2026-05-04", porQuem: "Roberto Lino", responsavel: "Carlos Augusto",
};

describe("aviso de churn no grupo", () => {
  it("leva o motivo E a observação — é o que o time precisa saber", () => {
    const t = textoAvisoChurn({
      ...base,
      motivoDetalhe: "Cliente teve queda de 43% no faturamento por causa da chuva. Volta em outubro ou novembro.",
    });
    expect(t).toContain("Quero Tintas");
    expect(t).toContain("Pausa temporária");
    expect(t).toContain("queda de 43%");
  });

  it("diz há quanto tempo era cliente", () => {
    expect(textoAvisoChurn(base)).toContain("4 meses");
  });

  it("PAUSA não manda desmontar nada — ele volta", () => {
    const t = textoAvisoChurn({ ...base, pretendeVoltar: true });
    expect(t).toContain("NÃO desmontem");
    expect(t).not.toContain("O que precisa parar");
  });

  it("saída definitiva lista o que parar — aviso vira instrução", () => {
    const t = textoAvisoChurn({ ...base, motivo: "preco", pretendeVoltar: false });
    expect(t).toContain("campanhas e verba");
    expect(t).toContain("programação de posts");
  });

  it("diz quem arquivou e que o histórico fica", () => {
    const t = textoAvisoChurn(base);
    expect(t).toContain("Roberto Lino");
    expect(t).toContain("histórico do cliente continua");
  });

  it("sem observação não inventa linha vazia", () => {
    expect(textoAvisoChurn({ ...base, motivoDetalhe: "   " })).not.toContain("__");
  });
});
