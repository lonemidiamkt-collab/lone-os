import { describe, it, expect } from "vitest";
import { ehPalpiteSobreSistema, ehFillerComNome } from "@/lib/cs/palpite";

// As cinco respostas REAIS do Loninho no grupo do time em 11/09/2026, 09:55–10:14. Todas saíram.
// Nenhuma devia ter saído. O ehSoRecibo antigo deixou passar todas (nome próprio + mais de 120
// caracteres derrubavam o detector).

describe("palpite sobre o sistema — as quatro de hoje", () => {
  it.each([
    "Tá tranquilo, Rodrigo! Pode ser só um bug mesmo. Se precisar de mais ajuda, dá um toque. Tamo junto!",
    "Se ainda tá assim, pode ser que a atualização não rolou direito. Dá uma olhada se tá tudo certo no sistema. Se precisar, tô aqui! 😉",
    "Se sumiu da fila e produção, pode ser um bug mesmo. Verifica se tá tudo atualizado no sistema. Se precisar de mais alguma coisa, tô na área! 😉",
    "Entendi, Rodrigo! Se eram só do Gabriel e não aparecem mais pra você, pode ser que tá filtrando por responsável. Dá uma checada nisso. Qualquer dúvida, só chamar! 😉",
  ])("é palpite: %s", (r) => {
    expect(ehPalpiteSobreSistema(r)).toBe(true);
  });

  it("resposta com dado NÃO é palpite, mesmo falando do sistema", () => {
    expect(ehPalpiteSobreSistema("Você tem 3 demandas em Alterações: 2 do Madeirão e 1 da Calabria.")).toBe(false);
    expect(ehPalpiteSobreSistema("As 8 na fila são do Gabriel — os clientes passaram pra ele ontem.")).toBe(false);
    expect(ehPalpiteSobreSistema("Isso é do painel, e eu não enxergo ele — manda pro Roberto.")).toBe(false);
  });
});

describe("filler com nome — a do Carlos", () => {
  it("abertura + nome + fecho de cortesia, sem conteúdo, é recibo", () => {
    expect(ehFillerComNome("Beleza, Carlos! Se precisar de mim pra ajustar algo ou dar um toque no pessoal, só avisar. Tamo junto!")).toBe(true);
    expect(ehFillerComNome("Fala, Rodrigo! Qualquer coisa, só chamar! 😉")).toBe(true);
    expect(ehFillerComNome("Entendi, Thiago. Tô por aqui.")).toBe(true);
  });

  it("nome + conteúdo de verdade NÃO é filler", () => {
    expect(ehFillerComNome("Fala, Carlos! Tô vendo sim as demandas com alterações: são 3, duas do Madeirão.")).toBe(false);
    expect(ehFillerComNome("Rodrigo, não tem nada na sua fila — as 8 abertas são do Gabriel.")).toBe(false);
    expect(ehFillerComNome("Beleza, Carlos! Qual cliente você quer que eu olhe?")).toBe(false);
  });
});
