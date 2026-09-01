import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Roberto (02/09), mostrando um alerta real: o cliente do Império dos Pisos escreveu "eu só não
// gostei desse aqui na hora de falar o valor dos pisos, acho que ficou melhor se deixar igual o
// último" — e isso virou "atenção com o cliente". É ajuste de arte, não insatisfação com a agência.
// "Nem tudo precisa ser colocado ali como atenção."
const PROMPT = readFileSync("lib/cs/sentimento.ts", "utf8");

describe("prompt de sentimento separa a peça da relação", () => {
  it("traz a distinção explícita", () => {
    expect(PROMPT).toMatch(/criticar A PEÇA é diferente de estar insatisfeito COM A AGÊNCIA/i);
  });

  it("usa a frase real como exemplo de NEUTRO", () => {
    // O caso concreto tem que estar no prompt: exemplo genérico não segura o modelo.
    expect(PROMPT).toMatch(/não gostei desse aqui na hora de falar o valor/i);
  });

  it("mantém como negativo o que é sobre o atendimento", () => {
    expect(PROMPT).toMatch(/não tô gostando do trabalho de vocês/i);
    expect(PROMPT).toMatch(/cadê a arte que pedi semana passada/i);
  });

  it("dá ao modelo a pergunta que decide", () => {
    expect(PROMPT).toMatch(/falando DA PEÇA ou DE COMO ESTÁ SENDO ATENDIDO/i);
  });
});
