// Legendas em lote (lib/conteudo/legendas-lote.ts, Leva 7B N12): rascunho da semana com o bloco de
// contato no fim.
import { describe, it, expect } from "vitest";
import { blocoDeContato, cardsDaSemana, contatoDaFicha, fecharComContato, limitesDaSemana, temContato } from "@/lib/conteudo/legendas-lote";

const FICHA = [
  "FICHA DO CLIENTE — Loja X",
  "• Voz: animada",
  "• CONTATO (fechar a legenda com isto): Av. Saquarema, 810 – Porto Novo · (22) 99949-4461",
].join("\n");

describe("bloco de contato", () => {
  it("da ficha; 'a confirmar' não vale", () => {
    expect(contatoDaFicha(FICHA)).toBe("Av. Saquarema, 810 – Porto Novo · (22) 99949-4461");
    expect(contatoDaFicha("• CONTATO (fechar a legenda com isto): (a confirmar com o cliente)")).toBeNull();
    expect(contatoDaFicha(null)).toBeNull();
  });
  it("ficha → briefing → cadastro", () => {
    expect(blocoDeContato({ ficha: FICHA, briefingContato: "outro" })).toContain("Saquarema");
    expect(blocoDeContato({ ficha: null, briefingContato: "Rua A, 1" })).toBe("Rua A, 1");
    expect(blocoDeContato({ endereco: "Rua B, 2", telefone: "(22) 2222-3333" })).toBe("Rua B, 2 · (22) 2222-3333");
    expect(blocoDeContato({})).toBeNull();
  });
});

describe("fechar com o contato", () => {
  const contato = "Av. Saquarema, 810 – Porto Novo · (22) 99949-4461";
  it("não repete quando a legenda já traz o telefone ou o endereço", () => {
    expect(temContato("Chama no zap 22 99949-4461", contato)).toBe(true);
    expect(temContato("Estamos na Av. Saquarema, 810", contato)).toBe(true);
    expect(temContato("Venha conferir!", contato)).toBe(false);
    expect(fecharComContato("Venha conferir!\n", contato)).toEqual({ texto: `Venha conferir!\n\n${contato}`, acrescentado: true });
    expect(fecharComContato("Ligue (22) 99949-4461", contato).acrescentado).toBe(false);
    expect(fecharComContato("Texto", null)).toEqual({ texto: "Texto", acrescentado: false });
  });
});

describe("a semana", () => {
  it("segunda a domingo; cards do cliente em ordem", () => {
    expect(limitesDaSemana("2026-09-24")).toEqual({ segunda: "2026-09-21", domingo: "2026-09-27" });
    const cards = [
      { id: "b", clientId: "k1", dueDate: "2026-09-25", dueTime: "10:00" },
      { id: "a", clientId: "k1", dueDate: "2026-09-21" },
      { id: "fora", clientId: "k1", dueDate: "2026-09-28" },
      { id: "outro", clientId: "k2", dueDate: "2026-09-22" },
      { id: "arq", clientId: "k1", dueDate: "2026-09-22", archivedAt: "2026-09-20" },
    ];
    expect(cardsDaSemana(cards, "k1", "2026-09-21").map((c) => c.id)).toEqual(["a", "b"]);
  });
});
