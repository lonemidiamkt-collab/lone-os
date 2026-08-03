// Teste OFFLINE dos guarda-corpos da mensagem ao cliente (sem banco/IA).
// Essa mensagem vai DIRETO pro grupo do cliente — é a última barreira antes dele ler.
import { describe, it, expect } from "vitest";
import { revisarMensagem, temAssunto, descreverSinais, escolherFoco, variacaoPara, type SinaisCliente } from "@/lib/cs/mensagem-cliente";

const sem: SinaisCliente = {
  aguardandoAprovacao: 0, aprovouRecentemente: false, esperandoDesde: null, entreguesNaSemana: 0, diasSemFalar: 2,
  promoDoMesSemResposta: false, destaqueIg: null, postsNaSemana: null, pedirProdutosHoje: false,
};
const com: SinaisCliente = {
  aguardandoAprovacao: 2, aprovouRecentemente: false, esperandoDesde: null, entreguesNaSemana: 3, diasSemFalar: 4,
  promoDoMesSemResposta: true, destaqueIg: { curtidas: 41, comentarios: 6 }, postsNaSemana: 3, pedirProdutosHoje: false,
};

describe("temAssunto", () => {
  it("cliente sem nada acontecendo → não força papo", () => {
    expect(temAssunto(sem)).toBe(false);
  });

  it("quem JÁ APROVOU não entra na cobrança de aprovação", async () => {
    // O status do card atrasa: ele aprova no grupo e ninguém move o card. Cobrar aprovação de
    // quem já aprovou passa a impressão de que a gente não presta atenção nele.
    const f = await escolherFoco({ ...sem, aguardandoAprovacao: 0, aprovouRecentemente: true })!;
    expect(f.objetivo).not.toBe("aprovar_arte");
  });

  it("nada pendente → mensagem de PRESENÇA, não silêncio nem texto genérico", async () => {
    const f = await escolherFoco({ ...sem, aprovouRecentemente: true })!;
    expect(f.objetivo).toBe("presenca");
    expect(f.fatos).toHaveLength(0);            // sem número pra inventar
    expect(f.missao).toContain("NÃO cite arte");
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
    aguardandoAprovacao: 0, aprovouRecentemente: false, esperandoDesde: null, entreguesNaSemana: 1, diasSemFalar: 3,
    promoDoMesSemResposta: true, destaqueIg: null, postsNaSemana: 2, pedirProdutosHoje: false,
  };

  it("BARRA 'arte esperando seu OK' quando não há nenhuma (a IA inventou isso pro Bruno Tintas)", () => {
    const r = revisarMensagem("Oi, pessoal! Temos uma arte esperando seu OK pra publicar.", semArte);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("esperando aprovação");
  });

  it("BARRA falar de entrega quando não houve entrega nem arte parada", () => {
    const nada: SinaisCliente = { ...semArte, entreguesNaSemana: 0, postsNaSemana: 0, pedirProdutosHoje: false, promoDoMesSemResposta: true };
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
describe("escolherFoco — uma mensagem, um propósito", async () => {
  const zerado: SinaisCliente = {
    aguardandoAprovacao: 0, aprovouRecentemente: false, esperandoDesde: null, entreguesNaSemana: 0, diasSemFalar: 2,
    promoDoMesSemResposta: false, destaqueIg: null, postsNaSemana: 0, pedirProdutosHoje: false,
  };

  it("sem assunto nenhum → PRESENÇA (o Roberto pediu: bom dia, estamos de olho, à disposição)", async () => {
    const f = await escolherFoco(zerado)!;
    expect(f.objetivo).toBe("presenca");
    expect(f.fatos).toHaveLength(0);
  });

  it("arte parada ganha de tudo — é trabalho feito esperando o cliente", async () => {
    const f = await escolherFoco({ ...zerado, aguardandoAprovacao: 2, aprovouRecentemente: false, esperandoDesde: null, promoDoMesSemResposta: true,
      destaqueIg: { curtidas: 80, comentarios: 9 }, entreguesNaSemana: 3 })!;
    expect(f.objetivo).toBe("aprovar_arte");
    // O ponto todo: os outros fatos NÃO chegam na IA.
    expect(f.fatos).toHaveLength(1);
    expect(f.fatos[0]).toContain("2 arte");
    expect(f.fatos.join(" ")).not.toContain("promoção");
    expect(f.fatos.join(" ")).not.toContain("curtidas");
  });

  it("silêncio longo vem antes de pedir qualquer coisa", async () => {
    const f = await escolherFoco({ ...zerado, diasSemFalar: 15, promoDoMesSemResposta: true })!;
    expect(f.objetivo).toBe("reengajar");
    expect(f.missao).toContain("SEM cobrar");
  });

  it("post que foi bem vira comemoração, sozinho", async () => {
    const f = await escolherFoco({ ...zerado, destaqueIg: { curtidas: 76, comentarios: 10 }, entreguesNaSemana: 2 })!;
    expect(f.objetivo).toBe("comemorar_post");
    expect(f.fatos).toHaveLength(1);
    expect(f.fatos[0]).toContain("76");
  });

  it("promoção sem resposta é a mensagem inteira, não um apêndice", async () => {
    const f = await escolherFoco({ ...zerado, promoDoMesSemResposta: true })!;
    expect(f.objetivo).toBe("promo_do_mes");
    expect(f.missao).toContain("única coisa");
  });

  it("semana que rendeu: reconhece e oferece o próximo", async () => {
    const f = await escolherFoco({ ...zerado, entreguesNaSemana: 2, postsNaSemana: 3 , pedirProdutosHoje: false})!;
    expect(f.objetivo).toBe("oferecer_proximo");
    expect(f.fatos.join(" ")).toContain("2 arte");
    expect(f.fatos.join(" ")).toContain("3 post");
  });

  it("clientes em situações diferentes recebem OBJETIVOS diferentes — a variedade vem daí", async () => {
    const a = await escolherFoco({ ...zerado, aguardandoAprovacao: 1 })!;
    const b = await escolherFoco({ ...zerado, promoDoMesSemResposta: true })!;
    const c = await escolherFoco({ ...zerado, diasSemFalar: 20 })!;
    expect(new Set([a.objetivo, b.objetivo, c.objetivo]).size).toBe(3);
  });
});

// O Roberto: "tomar cuidado com as variações das mensagens sendo segunda, quarta e sexta."
// Estava errado: a chave era cliente+semana, então quarta e sexta do MESMO cliente na MESMA
// semana saíam com a MESMA frase — o cliente leria a mesma coisa duas vezes em três dias.
describe("variacaoPara — quarta e sexta não repetem a mesma frase", () => {
  const cliente = "ee36bf6f-fe68-47c5-9536-e29d4d282b41";
  const semana = new Date(2026, 6, 29);

  it("mesmo cliente, mesma semana: quarta ≠ sexta", () => {
    expect(variacaoPara("aprovar_arte", cliente, "quarta", semana))
      .not.toBe(variacaoPara("aprovar_arte", cliente, "sexta", semana));
  });

  it("vale pra todos os objetivos, não só um", () => {
    for (const obj of ["promo_do_mes", "reengajar", "comemorar_post", "oferecer_proximo", "presenca"] as const) {
      expect(variacaoPara(obj, cliente, "quarta", semana))
        .not.toBe(variacaoPara(obj, cliente, "sexta", semana));
    }
  });

  it("o mesmo dia continua estável (reenvio não muda o texto)", () => {
    expect(variacaoPara("presenca", cliente, "quarta", new Date(2026, 6, 29, 8)))
      .toBe(variacaoPara("presenca", cliente, "quarta", new Date(2026, 6, 29, 20)));
  });

  it("clientes diferentes recebem frases diferentes no mesmo dia", () => {
    const outro = "5bfb7cfd-1e4f-4a6a-b5ac-993713f53994";
    const frases = new Set([
      variacaoPara("presenca", cliente, "quarta", semana),
      variacaoPara("presenca", outro, "quarta", semana),
    ]);
    expect(frases.size).toBeGreaterThan(1);
  });
});

// SEGUNDA DE LOJA (construção/varejo): perguntar o que chegou de novo é o que alimenta o conteúdo
// da semana. O risco é a pergunta atropelar assunto mais urgente — ou ir pra quem sumiu do grupo.
describe("pedido de produto/preço na segunda", () => {
  const base = {
    aguardandoAprovacao: 0, aprovouRecentemente: false, esperandoDesde: null,
    entreguesNaSemana: 0, diasSemFalar: 2, promoDoMesSemResposta: false,
    destaqueIg: null, postsNaSemana: 0, pedirProdutosHoje: true,
  };

  it("na segunda, em loja marcada, o assunto é produto novo", async () => {
    const f = await escolherFoco({ ...base });
    expect(f?.objetivo).toBe("produtos_semana");
  });

  it("NÃO atropela arte parada — trabalho feito esperando o cliente custa mais", async () => {
    const f = await escolherFoco({ ...base, aguardandoAprovacao: 2, esperandoDesde: null });
    expect(f?.objetivo).toBe("aprovar_arte");
  });

  it("NÃO pede nada a quem sumiu do grupo — reatar vem antes", async () => {
    const f = await escolherFoco({ ...base, diasSemFalar: 15 });
    expect(f?.objetivo).toBe("reengajar");
  });

  it("cliente fora da lista não recebe a pergunta", async () => {
    const f = await escolherFoco({ ...base, pedirProdutosHoje: false });
    expect(f?.objetivo).not.toBe("produtos_semana");
  });
});
