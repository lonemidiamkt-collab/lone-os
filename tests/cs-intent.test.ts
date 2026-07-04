// Teste do detector de pergunta operacional pra Lone (acento + prefixo). Puro.
import { describe, it, expect } from "vitest";
import { ehPerguntaProLone } from "@/lib/cs/intent";

describe("ehPerguntaProLone", () => {
  it("pega pergunta/pedido operacional mesmo SEM dizer 'Lone'", () => {
    for (const t of [
      "Tem alguma entrega em atraso?",
      "manda as artes em atraso do Carlos",
      "quais pendências temos hoje?",   // acento + prefixo
      "tem demanda pendente?",
      "o que tá em produção?",           // acento
      "há algo esfriando?",              // acento + prefixo
      "cadê a arte do Léo?",
      "lista as pendencias do Pedro",
    ]) expect(ehPerguntaProLone(t), t).toBe(true);
  });

  it("ignora papo do time que não é pra Lone", () => {
    for (const t of [
      "bom dia pessoal, tudo certo?",
      "vou almoçar já volto",
      "fechei com o cliente novo, começa semana que vem",
      "e do Pedro?",                     // follow-up puro → é a CONTINUIDADE, não este detector
      "parabéns equipe!",
    ]) expect(ehPerguntaProLone(t), t).toBe(false);
  });
});
