// Kit da marca ao lado da tarefa de arte (lib/conteudo/kit-marca.ts, Leva 7B N16).
import { describe, it, expect } from "vitest";
import { arteAprovada, listaNaoUsar, normalizarHex, paletaDaMarca, tomDaMarca, ultimasAprovadas } from "@/lib/conteudo/kit-marca";

describe("paleta", () => {
  it("normaliza hex", () => {
    expect(normalizarHex("#0d4af5")).toBe("#0D4AF5");
    expect(normalizarHex("abc")).toBe("#AABBCC");
    expect(normalizarHex("azul")).toBeNull();
    expect(normalizarHex(12)).toBeNull();
  });
  it("a do briefing vence; sem ela, a lida das artes; sem repetir", () => {
    const briefing = [{ hex: "#FF0000", nome: "Vermelho" }, { hex: "#ff0000", nome: "Repetido" }, { hex: "ruim" }];
    expect(paletaDaMarca(briefing, { paleta: [{ hex: "#00FF00", papel: "fundo" }] })).toEqual([{ hex: "#FF0000", nome: "Vermelho" }]);
    expect(paletaDaMarca([], { paleta: [{ hex: "#00FF00", papel: "fundo" }] })).toEqual([{ hex: "#00FF00", nome: "fundo" }]);
    expect(paletaDaMarca(null, null)).toEqual([]);
  });
});

describe("tom e o que não usar", () => {
  it("tom do briefing, com pessoa e emoji; cai para o cadastro", () => {
    expect(tomDaMarca({ tom_voz: "informal", pessoa_verbal: "voce", usa_emoji: true })).toBe('Informal · fala com "você" · usa emoji');
    expect(tomDaMarca(null, "funny")).toBe("Divertido");
    expect(tomDaMarca(null, null)).toBeNull();
  });
  it("junta listas sem repetir", () => {
    expect(listaNaoUsar(["barato", "Barato", " "], ["fundo preto"], null)).toEqual(["barato", "fundo preto"]);
  });
});

describe("últimas aprovadas", () => {
  const c = (id: string, p: Record<string, unknown>) => ({ id, title: `Card ${id}`, status: "client_approval", ...p });
  it("aprovada = cliente aprovou, agendado ou no ar", () => {
    expect(arteAprovada(c("a", { client_approved_at: "2026-09-01" }))).toBe(true);
    expect(arteAprovada(c("b", { status: "published" }))).toBe(true);
    expect(arteAprovada(c("c", { status: "approval" }))).toBe(false);
  });
  it("mais novas primeiro, com arte, sem o card aberto, no máximo 6", () => {
    const cards = [
      c("a", { client_approved_at: "2026-09-01T00:00:00Z" }),
      c("b", { status: "published", publish_verified_at: "2026-09-10T00:00:00Z" }),
      c("sem-arte", { client_approved_at: "2026-09-20T00:00:00Z" }),
      c("aberto", { client_approved_at: "2026-09-21T00:00:00Z" }),
      c("legado", { status: "scheduled", scheduled_at: "2026-09-05T00:00:00Z", designer_delivered_at: "2026-09-04", image_url: "https://x/capa.png" }),
    ];
    const artes = new Map([["a", "https://x/a.png"], ["b", "https://x/b.png"], ["aberto", "https://x/o.png"]]);
    const r = ultimasAprovadas(cards, artes, { excluir: "aberto" });
    expect(r.map((p) => p.cardId)).toEqual(["b", "legado", "a"]);
    expect(r[1].url).toBe("https://x/capa.png");
    const muitos = Array.from({ length: 9 }, (_, i) => c(`x${i}`, { client_approved_at: `2026-09-0${i + 1}T00:00:00Z` }));
    expect(ultimasAprovadas(muitos, new Map(muitos.map((m) => [m.id, "u"])))).toHaveLength(6);
  });
});
