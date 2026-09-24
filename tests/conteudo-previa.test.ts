// Prévia no Instagram e pacote para agendar (lib/conteudo/previa.ts, Leva 7B N13/N14).
import { describe, it, expect } from "vitest";
import {
  artesParaAgendar, cortarLegenda, extensaoDaArte, legendaCompleta, nomeDaArte, paraNomeDeArquivo, pastaDoCard,
} from "@/lib/conteudo/previa";

describe("legenda completa", () => {
  it("texto + hashtags, sem repetir as que já estão no texto", () => {
    expect(legendaCompleta("Oi", "#a #b")).toBe("Oi\n\n#a #b");
    expect(legendaCompleta("Oi\n\n#a #b", "#a #b")).toBe("Oi\n\n#a #b");
    expect(legendaCompleta("", "#a")).toBe("#a");
    expect(legendaCompleta("  Oi  ", null)).toBe("Oi");
  });
});

describe("corte do feed", () => {
  it("até 125 não corta", () => {
    expect(cortarLegenda("a".repeat(125))).toEqual({ visivel: "a".repeat(125), cortada: false });
  });
  it("corta no fim da palavra perto do limite", () => {
    const t = `${"palavra ".repeat(20)}fim`;
    const r = cortarLegenda(t);
    expect(r.cortada).toBe(true);
    expect(r.visivel.length).toBeLessThanOrEqual(125);
    expect(r.visivel.endsWith("palavra")).toBe(true);
  });
  it("sem espaço perto: corta seco no limite", () => {
    const r = cortarLegenda("x".repeat(200));
    expect(r.visivel).toHaveLength(125);
  });
});

describe("pacote do mLabs", () => {
  it("nomes seguros e na ordem", () => {
    expect(paraNomeDeArquivo("Promoção de Pisos! 50%")).toBe("promocao-de-pisos-50");
    expect(paraNomeDeArquivo("***")).toBe("sem-nome");
    expect(pastaDoCard({ title: "Dia das Mães", clientName: "Calábria Decorações", dueDate: "2026-09-26" })).toBe("2026-09-26-calabria-decoracoes-dia-das-maes");
    expect(nomeDaArte(0, "png")).toBe("arte-01.png");
    expect(nomeDaArte(9, "jpg")).toBe("arte-10.jpg");
  });
  it("extensão pelo tipo ou pelo endereço", () => {
    expect(extensaoDaArte("https://x/a", "image/jpeg")).toBe("jpg");
    expect(extensaoDaArte("https://x/a.webp?t=1", null)).toBe("webp");
    expect(extensaoDaArte("https://x/a", null)).toBe("png");
  });
  it("só entregas; sem entrega, os legados; referência nunca; capa antiga por último", () => {
    const anexos = [
      { url: "ref", tipo: "referencia", position: 0 },
      { url: "e2", tipo: "entrega", position: 2 },
      { url: "e1", tipo: "entrega", position: 1 },
    ];
    expect(artesParaAgendar(anexos).map((a) => a.url)).toEqual(["e1", "e2"]);
    expect(artesParaAgendar([{ url: "leg", tipo: null }, { url: "ref", tipo: "referencia" }]).map((a) => a.url)).toEqual(["leg"]);
    expect(artesParaAgendar([{ url: "ref", tipo: "referencia" }])).toEqual([]);
    expect(artesParaAgendar([], "https://storage/capa.png")).toEqual([{ url: "https://storage/capa.png", path: null }]);
    expect(artesParaAgendar([], "https://drive.google.com/file/d/x")).toEqual([]);
  });
});
