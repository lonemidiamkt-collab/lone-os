import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Roberto (02/09), mostrando um alerta real: o cliente do Império dos Pisos escreveu "eu só não
// gostei desse aqui na hora de falar o valor dos pisos, acho que ficou melhor se deixar igual o
// último" — e isso virou "atenção com o cliente". É ajuste de arte, não insatisfação com a agência.
//
// 10/09: a lição da auditoria dos 66 alertas é que ESTE teste não bastava. A frase estava no prompt
// como exemplo de NEUTRO e o alerta disparou mesmo assim, em 01/09. Prompt não é garantia — quem
// garante é tests/portao-satisfacao.test.ts, que testa a DECISÃO. Aqui fica só o contrato do prompt.
const PROMPT = readFileSync("lib/cs/sentimento.ts", "utf8");

describe("prompt de sentimento separa a peça da relação", () => {
  it("obriga o modelo a nomear de quem está falando", () => {
    expect(PROMPT).toMatch(/sobre:\s*\{ type: "string", enum: SOBRE \}/);
    for (const v of ["agencia", "peca", "negocio_do_cliente", "terceiro", "resultado_campanha", "operacional", "indefinido"]) {
      expect(PROMPT).toContain(`"${v}"`);
    }
  });

  it("diz que só 'agencia' pode virar alerta", () => {
    expect(PROMPT).toMatch(/[ÚU]NICO valor que pode virar alerta/i);
  });

  it("usa as frases reais como exemplo", () => {
    expect(PROMPT).toMatch(/não gostei desse aqui na hora de falar do valor/i);
    expect(PROMPT).toMatch(/puxão de orelha/i);      // o caso do elogio ao funcionário dele
    expect(PROMPT).toMatch(/Cancelei o login/i);     // o churn falso
    expect(PROMPT).toMatch(/Movimento parado/i);     // o negócio dele
  });

  it("mantém como negativo o que é sobre o atendimento", () => {
    expect(PROMPT).toMatch(/cadê a arte que pedi semana passada/i);
    expect(PROMPT).toMatch(/minha insatisfação com a falta de acompanhamento/i);
  });

  it("proíbe inventar motivo pra encaixar em agência", () => {
    expect(PROMPT).toMatch(/NUNCA invente um motivo/i);
  });

  it("dá ao modelo a pergunta que decide", () => {
    expect(PROMPT).toMatch(/DE COMO ESTÁ SENDO ATENDIDO/i);
  });
});
