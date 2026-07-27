// O agente só respondia a "Lone". O time chama de "Loninho" — e ele ficava MUDO.
// Casos reais perdidos: 27/07 12:01 "loninho faz planejamento da semana para o portuga pneus"
// e 14/07 "loninho, voce ta vendo as atualizacoes do lone os?". Nenhum dos dois teve resposta.
import { describe, it, expect } from "vitest";

// Mesma regra do inbound (app/api/cs/inbound/route.ts).
const CHAMA_AGENTE = /\blon(e|inho|ezinho)\b/;
const chamaOAgente = (t: string) =>
  CHAMA_AGENTE.test(t.toLowerCase()) && !/\blone\s*m[íi]dia\b/.test(t.toLowerCase());

describe("chamaOAgente — o apelido do time conta", () => {
  it("responde ao caso REAL que se perdeu às 12:01", () => {
    expect(chamaOAgente("loninho faz planejamento da semana para o portuga pneus")).toBe(true);
  });

  it("responde aos apelidos", () => {
    for (const t of ["loninho, monta o calendário", "lonezinho faz um roteiro", "Lone, como estão as demandas?"]) {
      expect(chamaOAgente(t)).toBe(true);
    }
  });

  it("IGNORA 'Lone Mídia' — é o nome da agência em conversa normal, não chamada pro agente", () => {
    expect(chamaOAgente("mandei pelo Lone Mídia ontem")).toBe(false);
    expect(chamaOAgente("a Lone Midia fechou mais um cliente")).toBe(false);
  });

  it("não confunde palavra que só COMEÇA com lone", () => {
    expect(chamaOAgente("o cliente ficou lonely")).toBe(false);
    expect(chamaOAgente("solonesia")).toBe(false);
  });

  it("conversa sem citar ninguém continua ignorada", () => {
    expect(chamaOAgente("bom dia time, tudo certo?")).toBe(false);
  });
});
