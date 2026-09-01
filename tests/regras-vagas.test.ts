import { describe, it, expect } from "vitest";
import { motivoParaNaoVirarRegra, podeVirarRegra } from "@/lib/cs/regras";

// Auditoria de 02/09: 593 regras na base, e amostrando as últimas apareceram quatro que não mudam
// peça nenhuma. Todas passaram pelo filtro existente. As frases abaixo são as reais.
describe("regras que entraram e não deviam", () => {
  it('"Informação sobre X" anuncia o dado sem dar o dado', () => {
    // Quem vai fazer a arte continua sem saber QUAL é o horário.
    expect(motivoParaNaoVirarRegra("Informação sobre fechamento na segunda-feira")).toBe("anuncio_vazio");
    expect(motivoParaNaoVirarRegra("Informação sobre horário de funcionamento")).toBe("anuncio_vazio");
  });

  it("mas a mesma informação COM o dado é regra boa", () => {
    expect(podeVirarRegra("Mudança de horário de funcionamento para 07:30 a 13:00")).toBe(true);
    expect(podeVirarRegra("Fecha às 13h no sábado, avisar isso nas artes de fim de semana")).toBe(true);
  });

  it("processo interno da agência não é regra do cliente", () => {
    expect(motivoParaNaoVirarRegra("Manter comunicação próxima e atenta com o cliente sobre materiais e ideias enviadas."))
      .toBe("processo_interno");
    expect(motivoParaNaoVirarRegra("Sempre dar retorno sobre materiais solicitados em até uma semana."))
      .toBe("processo_interno");
  });

  it("relato sobre o negócio não é regra — ninguém faz nada com isso", () => {
    for (const relato of [
      "O faturamento está sendo puxado manualmente para verificar conversões",
      "Saquarema começou meio devagar o mês por enquanto",
      "Caiu a venda de bruto, mas as vendas de outros materiais estão indo bem",
      "Clientes estão entrando na loja o dia todo",
      "Ser mais atencioso na entrega",
    ]) {
      expect(motivoParaNaoVirarRegra(relato), relato).toBe("generica");
    }
  });

  // A primeira versão do filtro exigia número ou nome próprio e barrava metade das regras BOAS.
  // Estas são reais, estão na base, e nenhuma tem número.
  it("instrução sem número continua sendo regra", () => {
    for (const boa of [
      "utilizar a palavra 'pet' em vez de 'animal' ou 'bicho'",
      "usar tom mais informal, ganchos mais curtos",
      "Destacar a importância da vacinação em todas as artes",
      "Limpar a roupa dos funcionários nas imagens",
      "Incluir sempre um CTA para agendar consultas ou avaliações",
      "Desativar comentários em posts no feed",
    ]) {
      expect(podeVirarRegra(boa), boa).toBe(true);
    }
  });

  it("as regras que funcionam continuam passando", () => {
    // Estas são de verdade e estão na base — o filtro não pode ficar exigente demais.
    for (const boa of [
      "Adicionar legenda em toda arte.",
      "O logo tem que estar no rodapé, nunca no topo",
      "Não usar vermelho nas artes da CIIL",
      "Toda legenda fecha com o endereço da loja",
      "Conferir se a arte é da loja de Araruama ou de São Gonçalo",
      "Nunca postar sem o cliente revisar antes",
    ]) {
      expect(podeVirarRegra(boa), boa).toBe(true);
    }
  });
});
