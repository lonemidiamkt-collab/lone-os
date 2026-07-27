// Teste OFFLINE dos guarda-corpos da mensagem ao cliente (sem banco/IA).
// Essa mensagem vai DIRETO pro grupo do cliente — é a última barreira antes dele ler.
import { describe, it, expect } from "vitest";
import { revisarMensagem, temAssunto, descreverSinais, anguloPara, type SinaisCliente } from "@/lib/cs/mensagem-cliente";

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

// ── Furos achados na PRIMEIRA revisão com dados reais (12 clientes) ──────────────
describe("revisarMensagem — furos vistos na revisão real", () => {
  const semArte: SinaisCliente = {
    aguardandoAprovacao: 0, entreguesNaSemana: 1, diasSemFalar: 3,
    promoDoMesSemResposta: true, destaqueIg: null, postsNaSemana: 2,
  };

  it("BARRA 'arte esperando seu OK' quando não há nenhuma (a IA inventou isso pro Bruno Tintas)", () => {
    const r = revisarMensagem("Oi, pessoal! Temos uma arte esperando seu OK pra publicar.", semArte);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("esperando aprovação");
  });

  it("BARRA falar de entrega quando não houve entrega nem arte parada", () => {
    const nada: SinaisCliente = { ...semArte, entreguesNaSemana: 0, postsNaSemana: 0, promoDoMesSemResposta: true };
    expect(revisarMensagem("Oi, pessoal! A arte nova ficou pronta, deem uma olhada!", nada).ok).toBe(false);
  });

  it("deixa passar quando a arte REALMENTE está esperando o OK", () => {
    const comArte: SinaisCliente = { ...semArte, aguardandoAprovacao: 1 };
    expect(revisarMensagem("Oi, pessoal! Ficou 1 arte esperando o OK de vocês pra publicar.", comArte).ok).toBe(true);
  });

  it("post com 1 curtida não vira destaque — não tem o que comemorar", () => {
    // O piso vive em coletarSinais (precisa de banco), então aqui a checagem é do contrato:
    // sem destaque, a mensagem não pode inventar número de engajamento.
    const r = revisarMensagem("Oi, pessoal! O post que mais bombou teve 1 curtida, que legal!", semArte);
    expect(r.ok).toBe(false);
  });
});

// A revisão real mostrou dois clientes recebendo a MESMA mensagem palavra por palavra.
describe("ângulo de abertura — mensagens não podem sair iguais", () => {
  it("clientes diferentes recebem ângulos diferentes na mesma semana", () => {
    const ids = ["ee36bf6f-fe68-47c5-9536-e29d4d282b41", "5bfb7cfd-1e4f-4a6a-b5ac-993713f53994",
                 "6a147097-b464-4092-94a8-5a22af569671", "7af62768-f06b-4979-91fa-3eac3174953a"];
    const quando = new Date(2026, 6, 29);
    const angulos = new Set(ids.map((id) => anguloPara(id, quando)));
    expect(angulos.size).toBeGreaterThan(1);
  });

  it("o MESMO cliente mantém o ângulo dentro da semana (reenvio não muda o tom)", () => {
    const id = "ee36bf6f-fe68-47c5-9536-e29d4d282b41";
    expect(anguloPara(id, new Date(2026, 6, 29))).toBe(anguloPara(id, new Date(2026, 6, 29, 20)));
  });
});
