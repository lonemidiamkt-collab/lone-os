// Teste OFFLINE dos guarda-corpos da mensagem ao cliente (sem banco/IA).
// Essa mensagem vai DIRETO pro grupo do cliente — é a última barreira antes dele ler.
import { describe, it, expect } from "vitest";
import { revisarMensagem, temAssunto, descreverSinais, escolherFoco, type SinaisCliente } from "@/lib/cs/mensagem-cliente";

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

// O Roberto leu a mensagem do Body Skin e disse "não entendi o sentido". Era colagem de fatos:
// "entregamos uma arte e publicamos 2 posts, MAS ainda estamos curiosos sobre a promoção".
// A correção é estrutural: o código escolhe UM objetivo e a IA só vê os fatos daquele objetivo.
describe("escolherFoco — uma mensagem, um propósito", () => {
  const zerado: SinaisCliente = {
    aguardandoAprovacao: 0, entreguesNaSemana: 0, diasSemFalar: 2,
    promoDoMesSemResposta: false, destaqueIg: null, postsNaSemana: 0,
  };

  it("sem assunto nenhum → não força mensagem", () => {
    expect(escolherFoco(zerado)).toBeNull();
  });

  it("arte parada ganha de tudo — é trabalho feito esperando o cliente", () => {
    const f = escolherFoco({ ...zerado, aguardandoAprovacao: 2, promoDoMesSemResposta: true,
      destaqueIg: { curtidas: 80, comentarios: 9 }, entreguesNaSemana: 3 })!;
    expect(f.objetivo).toBe("aprovar_arte");
    // O ponto todo: os outros fatos NÃO chegam na IA.
    expect(f.fatos).toHaveLength(1);
    expect(f.fatos[0]).toContain("2 arte");
    expect(f.fatos.join(" ")).not.toContain("promoção");
    expect(f.fatos.join(" ")).not.toContain("curtidas");
  });

  it("silêncio longo vem antes de pedir qualquer coisa", () => {
    const f = escolherFoco({ ...zerado, diasSemFalar: 15, promoDoMesSemResposta: true })!;
    expect(f.objetivo).toBe("reengajar");
    expect(f.missao).toContain("SEM cobrar");
  });

  it("post que foi bem vira comemoração, sozinho", () => {
    const f = escolherFoco({ ...zerado, destaqueIg: { curtidas: 76, comentarios: 10 }, entreguesNaSemana: 2 })!;
    expect(f.objetivo).toBe("comemorar_post");
    expect(f.fatos).toHaveLength(1);
    expect(f.fatos[0]).toContain("76");
  });

  it("promoção sem resposta é a mensagem inteira, não um apêndice", () => {
    const f = escolherFoco({ ...zerado, promoDoMesSemResposta: true })!;
    expect(f.objetivo).toBe("promo_do_mes");
    expect(f.missao).toContain("única coisa");
  });

  it("semana que rendeu: reconhece e oferece o próximo", () => {
    const f = escolherFoco({ ...zerado, entreguesNaSemana: 2, postsNaSemana: 3 })!;
    expect(f.objetivo).toBe("oferecer_proximo");
    expect(f.fatos.join(" ")).toContain("2 arte");
    expect(f.fatos.join(" ")).toContain("3 post");
  });

  it("clientes em situações diferentes recebem OBJETIVOS diferentes — a variedade vem daí", () => {
    const a = escolherFoco({ ...zerado, aguardandoAprovacao: 1 })!;
    const b = escolherFoco({ ...zerado, promoDoMesSemResposta: true })!;
    const c = escolherFoco({ ...zerado, diasSemFalar: 20 })!;
    expect(new Set([a.objetivo, b.objetivo, c.objetivo]).size).toBe(3);
  });
});
