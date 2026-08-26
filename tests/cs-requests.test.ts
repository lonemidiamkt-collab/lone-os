import { describe, it, expect } from "vitest";
import { pareceParaResponder, classificarTopico, respostaDeVerdade, dentroDoExpediente, SLA_MINUTOS } from "@/lib/cs/requests";

// A pergunta do cliente vira ESTADO. Antes o sistema lia a mensagem e seguia — não havia nada
// dizendo "isso está aberto há 37 minutos". Medido: 201 perguntas/mês no expediente, mediana de
// resposta 3 min, 30% passando de 30 min.

describe("o que abre pendência", () => {
  it("pergunta de verdade abre", () => {
    for (const t of [
      "Olá pessoal, os anúncios estão rodando bem aí?",
      "quando fica pronta a arte do feirão",
      "cadê o post que era pra sair hoje",
      "consegue trocar o telefone dessa arte",
    ]) expect(pareceParaResponder(t), t).toBe(true);
  });

  it("saudação e confirmação NÃO abrem", () => {
    for (const t of ["bom dia", "Bom dia!", "ok", "obrigado", "valeu 🙏", "👍", "top", "perfeito"])
      expect(pareceParaResponder(t), t).toBe(false);
  });

  it("mensagem curta demais não abre", () => {
    expect(pareceParaResponder("oi?")).toBe(false);
  });
});

describe("de que assunto é", () => {
  it("classifica pelo que decide a fonte do fato", () => {
    expect(classificarTopico("os anúncios estão rodando bem?")).toBe("anuncio");
    expect(classificarTopico("quando sai a arte do feirão?")).toBe("arte");
    expect(classificarTopico("qual a previsão de entrega?")).toBe("prazo");
    expect(classificarTopico("me manda o boleto por favor")).toBe("financeiro");
    expect(classificarTopico("vocês vão na feira semana que vem?")).toBe("outro");
  });

  it("anúncio ganha de arte quando os dois aparecem — a fonte do fato é diferente", () => {
    expect(classificarTopico("o criativo do anúncio está rodando?")).toBe("anuncio");
  });

  // Regressão: "an[úu]ncio\b" não casava o PLURAL — o "s" come a borda. A frase que motivou toda
  // esta funcionalidade caía em "outro" e nunca acharia a fonte de fato certa.
  it("o plural com acento casa — é a frase real da cliente", () => {
    expect(classificarTopico("Olá pessoal, os anúncios estão rodando bem aí?")).toBe("anuncio");
    expect(classificarTopico("as campanhas estão ativas?")).toBe("anuncio");
  });
});

describe("o que FECHA a pendência", () => {
  it("'bom dia' não responde 'os anúncios estão rodando?'", () => {
    for (const t of ["bom dia", "Boa tarde!", "oi", "opa", "👍"])
      expect(respostaDeVerdade(t), t).toBe(false);
  });

  it("resposta com conteúdo fecha", () => {
    for (const t of [
      "tão sim Vanessa, deu 49 conversas essa semana",
      "vou conferir aqui e já te falo",
      "a arte sai hoje até as 17h",
    ]) expect(respostaDeVerdade(t), t).toBe(true);
  });
});

describe("janela e prazo", () => {
  it("SLA é 45 min, não 30 — com mediana de 3 min, 30 alarmaria em cima de quem ia responder", () => {
    expect(SLA_MINUTOS).toBe(45);
  });

  it("fora do expediente não abre pendência", () => {
    const domingo = new Date("2026-08-23T15:00:00-03:00");
    const noite = new Date("2026-08-25T22:00:00-03:00");
    const madrugada = new Date("2026-08-25T03:00:00-03:00");
    expect(dentroDoExpediente(domingo)).toBe(false);
    expect(dentroDoExpediente(noite)).toBe(false);
    expect(dentroDoExpediente(madrugada)).toBe(false);
  });

  it("terça às 14h abre", () => {
    expect(dentroDoExpediente(new Date("2026-08-25T14:00:00-03:00"))).toBe(true);
  });
});
