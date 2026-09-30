import { describe, it, expect } from "vitest";
import { vencimentoDoLink, linkVencido, erroDeImagemIndisponivel } from "@/lib/meta/link-assinado";

// Os três links que derrubaram a rotina de atributos em 30/09: capturados em 25/09, vencidos em 26
// e 29/09 — no meio do apagão da OpenAI, antes de a rotina conseguir processar.
const LINK = (oe: string) => `https://scontent-gru1-2.xx.fbcdn.net/v/t15.5256-10/777396471_n.jpg?stp=dst-jpg&_nc_cat=1&oh=00_AfX&oe=${oe}`;

describe("validade do link da Meta", () => {
  it("lê o vencimento escrito no próprio link (segundos em hexadecimal)", () => {
    expect(vencimentoDoLink(LINK("6ABBFEE7"))?.toISOString()).toBe("2026-09-29T18:09:43.000Z");
    expect(vencimentoDoLink(LINK("6AB83834"))?.toISOString()).toBe("2026-09-26T21:25:08.000Z");
  });

  it("os links de 30/09 estavam vencidos", () => {
    const agora = new Date("2026-09-30T15:19:00Z");
    expect(linkVencido(LINK("6ABBFEE7"), agora)).toBe(true);
    expect(linkVencido(LINK("6AB83834"), agora)).toBe(true);
    expect(linkVencido(LINK("6ABC145A"), agora)).toBe(true);
  });

  it("link que vence daqui a pouco já conta como vencido (não dá tempo de a IA baixar)", () => {
    const venc = new Date("2026-09-29T18:09:43Z").getTime();
    expect(linkVencido(LINK("6ABBFEE7"), new Date(venc - 30 * 60_000))).toBe(true);
    expect(linkVencido(LINK("6ABBFEE7"), new Date(venc - 5 * 3600_000))).toBe(false);
  });

  it("sem `oe`, ou link que não é da Meta: não sabe, então não trata como velho", () => {
    expect(vencimentoDoLink("https://painel.lonemidia.com/arte.png")).toBeNull();
    expect(linkVencido("https://painel.lonemidia.com/arte.png", new Date())).toBe(false);
    expect(linkVencido(null, new Date())).toBe(false);
  });
});

describe("erro de imagem indisponível", () => {
  it("o 403 do download da OpenAI é imagem indisponível, não falha da IA", () => {
    expect(erroDeImagemIndisponivel("Error while downloading file. Upstream status code: 403.")).toBe(true);
  });

  it("falta de crédito continua sendo erro de verdade", () => {
    expect(erroDeImagemIndisponivel("You have no credits remaining.")).toBe(false);
    expect(erroDeImagemIndisponivel(null)).toBe(false);
  });
});
