import { describe, it, expect } from "vitest";
import { nomeLegivel, plural, generoQueSoma100, cidadeCurta } from "@/lib/reports/relatorioTextos";

// Os nomes reais do relatório de setembro da Madeireira D'Aldeia (02/10/2026).
describe("nome do anúncio como o cliente lê", () => {
  it("tira o código de gestor e separa o formato", () => {
    expect(nomeLegivel("ADS - VIDEO - SE VOCE É DE SÃO PEDRO")).toEqual({ nome: "Se Voce É de São Pedro", formato: "Vídeo" });
    expect(nomeLegivel("ADS - PORTA MACIÇA")).toEqual({ nome: "Porta Maciça", formato: null });
  });

  it("conjunto: sobra o que diz QUEM foi atingido", () => {
    expect(nomeLegivel("CJ 01 - Whatsapp - regiao dos lagos - aberto - Vídeos")).toEqual({ nome: "Regiao dos lagos", formato: "Vídeo" });
  });

  it("nome que é só código volta como veio, arrumado — melhor que um buraco", () => {
    expect(nomeLegivel("Engajamento - Mensagem - F - captação").nome).toBe("Engajamento - Mensagem - F - captação");
  });

  it("nome normal não é mexido", () => {
    expect(nomeLegivel("Promoção de telhas")).toEqual({ nome: "Promoção de telhas", formato: null });
    expect(nomeLegivel("")).toEqual({ nome: "", formato: null });
  });

  it("vários pedaços úteis ficam juntos", () => {
    expect(nomeLegivel("CJ 02 - Cabo Frio - 35 a 54 - Imagem").nome).toBe("Cabo Frio · 35 a 54");
  });
});

describe("detalhes que bagunçavam", () => {
  it("plural certo — o PDF dizia '1 curtidas'", () => {
    expect(plural(1, "curtida", "curtidas")).toBe("1 curtida");
    expect(plural(3, "curtida", "curtidas")).toBe("3 curtidas");
    expect(plural(1200, "curtida", "curtidas")).toBe("1.200 curtidas");
  });

  it("gênero soma 100 — eram 64% + 37% no Instagram", () => {
    expect(generoQueSoma100(63.5, 36.5)).toEqual({ mulheres: 64, homens: 36 });
    expect(generoQueSoma100(40.5, 59.5)).toEqual({ mulheres: 40, homens: 60 });
    expect(generoQueSoma100(0, 0)).toEqual({ mulheres: 0, homens: 0 });
  });

  it("cidade com a sigla do estado — cabia cortada no meio", () => {
    expect(cidadeCurta("São Pedro da Aldeia, Rio de Janeiro")).toBe("São Pedro da Aldeia, RJ");
    expect(cidadeCurta("Lisboa, Lisboa")).toBe("Lisboa, Lisboa");
    expect(cidadeCurta("Cabo Frio")).toBe("Cabo Frio");
  });
});
