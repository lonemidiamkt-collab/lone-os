// Teste OFFLINE dos guarda-corpos da mensagem ao cliente (sem banco/IA).
// Essa mensagem vai DIRETO pro grupo do cliente — é a última barreira antes dele ler.
import { describe, it, expect } from "vitest";
import { revisarMensagem, temAssunto, descreverSinais, type SinaisCliente } from "@/lib/cs/mensagem-cliente";

const sem: SinaisCliente = {
  aguardandoAprovacao: 0, entreguesNaSemana: 0, diasSemFalar: 2,
  promoDoMesSemResposta: false, destaqueIg: null, postsNaSemana: null,
};
const com: SinaisCliente = {
  aguardandoAprovacao: 2, entreguesNaSemana: 3, diasSemFalar: 4,
  promoDoMesSemResposta: true, destaqueIg: { curtidas: 41, comentarios: 6 }, postsNaSemana: 3,
};

describe("temAssunto", () => {
  it("cliente sem nada acontecendo → não força papo", () => {
    expect(temAssunto(sem)).toBe(false);
  });
  it("silêncio longo já é assunto por si só", () => {
    expect(temAssunto({ ...sem, diasSemFalar: 12 })).toBe(true);
  });
  it("arte esperando o OK é assunto", () => {
    expect(temAssunto({ ...sem, aguardandoAprovacao: 1 })).toBe(true);
  });
});

describe("descreverSinais", () => {
  it("só descreve o que existe — nada de zero disfarçado", () => {
    const l = descreverSinais(com);
    expect(l.join(" ")).toContain("2 arte(s) esperando o OK");
    expect(l.join(" ")).toContain("41 curtidas");
    expect(descreverSinais(sem)).toHaveLength(0);
  });
});

describe("revisarMensagem — guarda-corpos", () => {
  const ok = "Oi, pessoal! 👋 Ficaram 2 artes esperando o OK de vocês pra gente publicar. Deu uma olhadinha?";

  it("mensagem boa passa", () => {
    expect(revisarMensagem(ok, com).ok).toBe(true);
  });

  it("BARRA número inventado — o pecado mais caro", () => {
    const r = revisarMensagem("Oi, pessoal! Seu alcance subiu 47% essa semana, parabéns!", com);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("47");
  });

  it("BARRA promessa de prazo", () => {
    const r = revisarMensagem("Oi, pessoal! As 2 artes ficam prontas amanhã sem falta.", com);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("proibido");
  });

  it("BARRA qualquer conversa de dinheiro", () => {
    expect(revisarMensagem("Oi! Já pensaram em aumentar o investimento do mês?", com).ok).toBe(false);
    expect(revisarMensagem("Oi, pessoal! Fechamos em R$ 1.200 de retorno.", com).ok).toBe(false);
  });

  it("BARRA cobrança ao cliente", () => {
    expect(revisarMensagem("Oi! Vocês estão devendo o retorno da promoção.", com).ok).toBe(false);
  });

  it("aceita os números que vieram dos sinais, exatamente como vieram", () => {
    expect(revisarMensagem("Oi, pessoal! O post da semana bateu 41 curtidas e 6 comentários. 🔥", com).ok).toBe(true);
  });

  it("não deixa passar meia-frase nem textão", () => {
    expect(revisarMensagem("Oi!", com).ok).toBe(false);
    expect(revisarMensagem("Oi, pessoal! ".repeat(80), com).ok).toBe(false);
  });
});
