import { describe, it, expect } from "vitest";
import { linhaEstilo, type EstiloVisual } from "@/lib/traffic/estilo-visual";
import { promptTravado } from "@/lib/traffic/imagem-variacao";
import { montarDemanda } from "@/lib/traffic/replicar";

const estilo: EstiloVisual = {
  paleta: [{ hex: "#0A2A5E", papel: "fundo" }, { hex: "#FFD400", papel: "destaque de preço" }, { hex: "#FFFFFF", papel: "texto" }, { hex: "#E63946", papel: "selo" }, { hex: "#222222", papel: "apoio" }],
  tipografia: "sans grossa em caixa alta nos títulos", composicao: "produto centralizado, preço em selo no canto",
  elementos_recorrentes: ["selo de preço amarelo", "logo no rodapé", "foto de produto em fundo branco"], tom_visual: "promocional e denso",
  o_que_evitar: ["fundo claro sem contraste"], resumo: "Peças promocionais azul e amarelo, produto grande e preço em selo.",
};

describe("estilo visual lido dos prints entra no DNA", () => {
  it("linhaEstilo é factual, curta e usa no máximo 4 cores/4 elementos", () => {
    const l = linhaEstilo(estilo)!;
    expect(l.startsWith("Peças promocionais")).toBe(true);
    expect(l).toContain("#0A2A5E (fundo)");
    expect(l).not.toContain("#222222"); // 5ª cor fica de fora
    expect(l).toContain("Recorrente: selo de preço amarelo; logo no rodapé; foto de produto em fundo branco.");
    expect(l.length).toBeLessThanOrEqual(900);
    expect(linhaEstilo(null)).toBeNull();
  });

  it("briefing da replicação carrega o estilo só quando existe", () => {
    const base = { cliente: "Quero Tintas", adId: "1", adName: "Promo", resultado: { cpl: 8, cplMeta: 20, conversas: 12, gasto: 96, dias: 9 }, variacao: { nome: "cenário", muda: "fundo por loja", mantem: "preço, produto, CTA", testa: "se o cenário ajuda" }, formato: "feed", prazo: "2026-09-18", pedidoPor: "julio" };
    const sem = montarDemanda(base).briefing;
    const com = montarDemanda({ ...base, estiloVisual: linhaEstilo(estilo) }).briefing;
    expect(sem).not.toContain("Estilo visual da marca");
    expect(com).toContain("**Estilo visual da marca (lido das artes entregues/prints):** Peças promocionais");
    // o estilo vem ANTES dos elementos do pai e DEPOIS do que manter — o designer lê na ordem de decisão
    expect(com.indexOf("Manter (NÃO mexer)")).toBeLessThan(com.indexOf("Estilo visual da marca"));
  });
});

describe("prompt da variação de imagem trava o que não muda", () => {
  it("nomeia o que manter e o que alterar; proíbe inventar texto, preço e tirar logo", () => {
    const p = promptTravado("preço R$ 49,90, logo, CTA", "o cenário de fundo por uma loja de tintas");
    expect(p).toContain("MANTER EXATAMENTE (elementos travados): preço R$ 49,90, logo, CTA");
    expect(p).toContain("ALTERAR APENAS: o cenário de fundo por uma loja de tintas");
    expect(p).toMatch(/Não invente textos novos, não mude preços, não remova a logo/);
  });
  it("sem instruções, trava tudo e muda só o fundo", () => {
    const p = promptTravado("", "");
    expect(p).toContain("todos os textos, preço, produto, logo, hierarquia e chamada para ação");
    expect(p).toContain("ALTERAR APENAS: o cenário/fundo");
  });
});
