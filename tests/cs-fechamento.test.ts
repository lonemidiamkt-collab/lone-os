// Fechamento do dia ("postou?") — lógica pura, sem banco.
import { describe, it, expect } from "vitest";
import { buildFechamentoDia, parseConfirmacaoPostagem, type CardDoDia } from "@/lib/cs/postagem";

const cards: CardDoDia[] = [
  { cardId: "1", cliente: "Império dos Pisos", titulo: "Promo piso", temArte: true },
  { cardId: "2", cliente: "Império dos Pisos", titulo: "Carrossel", temArte: true },
  { cardId: "3", cliente: "Farmacia", titulo: "Suplemento", temArte: false },
];

describe("buildFechamentoDia", () => {
  it("agrupa por cliente e sinaliza quem está sem arte", () => {
    const m = buildFechamentoDia(cards, "sexta, 24/07")!;
    expect(m).toContain("*Império dos Pisos* — 2 posts");
    expect(m).toContain("*Farmacia*");
    expect(m).toContain("sem arte");
    expect(m).toContain("todos");
  });
  it("explica a consequência de não marcar (é o que faz o time marcar)", () => {
    expect(buildFechamentoDia(cards, "x")).toContain("não entra em nenhuma métrica");
  });
  it("sem pendência → não posta nada (evita ruído diário)", () => {
    expect(buildFechamentoDia([], "sexta, 24/07")).toBeNull();
  });
});

describe("parseConfirmacaoPostagem", () => {
  const pendentes = ["Império dos Pisos", "Farmacia", "Contele Energia Solar"];

  it("'todos' confirma a lista inteira", () => {
    const r = parseConfirmacaoPostagem("todos", pendentes);
    expect(r.todos).toBe(true);
    expect(r.confirmados).toHaveLength(3);
  });
  it("cita nomes → confirma só os citados", () => {
    const r = parseConfirmacaoPostagem("postou Império e Contele", pendentes);
    expect(r.confirmados).toContain("Império dos Pisos");
    expect(r.confirmados).toContain("Contele Energia Solar");
    expect(r.confirmados).not.toContain("Farmacia");
  });
  it("'só faltou X' → todos MENOS o citado", () => {
    const r = parseConfirmacaoPostagem("só faltou a Farmacia", pendentes);
    expect(r.confirmados).toContain("Império dos Pisos");
    expect(r.confirmados).toContain("Contele Energia Solar");
    expect(r.confirmados).not.toContain("Farmacia");
    expect(r.excecoes).toContain("Farmacia");
  });
  it("ignora acento e sobrenome ao casar o nome", () => {
    const r = parseConfirmacaoPostagem("imperio postou", pendentes);
    expect(r.confirmados).toContain("Império dos Pisos");
  });
  it("mensagem sem relação não confirma ninguém", () => {
    const r = parseConfirmacaoPostagem("bom dia pessoal", pendentes);
    expect(r.todos).toBe(false);
    expect(r.confirmados).toHaveLength(0);
  });
});
