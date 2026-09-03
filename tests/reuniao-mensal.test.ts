import { describe, it, expect } from "vitest";
import {
  janelaDoMes, montarCobranca, textoCobranca, lembretesDevidos, textoLembrete,
  type ClienteCiclo,
} from "@/lib/cs/reuniao-mensal";

// Roberto (02/09): "todo dia quinze até o dia vinte e dois, eles têm que marcar a reunião com os
// clientes… lembra ele um dia antes, o horário antes."

const cli = (o: Partial<ClienteCiclo> & { cliente: string; estado: ClienteCiclo["estado"] }): ClienteCiclo => ({
  clientId: o.cliente, responsavel: "Thiago", quando: null, propostoEm: null, ...o,
});

describe("a janela de agendamento (15 a 22)", () => {
  it("fechada no dia 2, aberta no 15, aberta no 22, fechada no 23", () => {
    expect(janelaDoMes(new Date(2026, 8, 2)).aberta).toBe(false);
    expect(janelaDoMes(new Date(2026, 8, 15)).aberta).toBe(true);
    expect(janelaDoMes(new Date(2026, 8, 22)).aberta).toBe(true);
    expect(janelaDoMes(new Date(2026, 8, 23)).aberta).toBe(false);
  });

  it("identifica o mês de referência", () => {
    expect(janelaDoMes(new Date(2026, 8, 16)).mes).toBe("2026-09");
    expect(janelaDoMes(new Date(2026, 11, 16)).mes).toBe("2026-12");
  });
});

describe("cobrança: força pela proximidade do prazo, não pelo volume", () => {
  const clientes = [
    cli({ cliente: "A", estado: "pendente" }),
    cli({ cliente: "B", estado: "pendente" }),
    cli({ cliente: "C", estado: "agendada", quando: "2026-09-25T14:00:00-03:00" }),
    cli({ cliente: "D", estado: "proposta", propostoEm: "2026-09-14T10:00:00-03:00" }),
  ];

  it("no dia 15 é lembrete (intensidade 1)", () => {
    const [c] = montarCobranca(clientes, janelaDoMes(new Date(2026, 8, 15)), new Date(2026, 8, 15));
    expect(c.intensidade).toBe(1);
    expect(c.pendentes).toEqual(["A", "B"]);
    expect(c.agendadas).toBe(1);
  });

  it("no dia 21 aperta (intensidade 2)", () => {
    const [c] = montarCobranca(clientes, janelaDoMes(new Date(2026, 8, 21)), new Date(2026, 8, 21));
    expect(c.intensidade).toBe(2);
  });

  it("no dia 22 é o último dia (intensidade 3)", () => {
    const [c] = montarCobranca(clientes, janelaDoMes(new Date(2026, 8, 22)), new Date(2026, 8, 22));
    expect(c.intensidade).toBe(3);
  });

  it("proposta feita hoje NÃO vira cobrança — o cliente merece um dia pra responder", () => {
    const hoje = new Date(2026, 8, 16, 15);
    const [c] = montarCobranca(
      [cli({ cliente: "E", estado: "proposta", propostoEm: hoje.toISOString() })],
      janelaDoMes(hoje), hoje,
    );
    expect(c).toBeUndefined();   // nada a cobrar
  });

  it("proposta parada há dias entra, do mais antigo pro mais novo", () => {
    const hoje = new Date(2026, 8, 20);
    const [c] = montarCobranca([
      cli({ cliente: "F", estado: "proposta", propostoEm: "2026-09-18T10:00:00-03:00" }),
      cli({ cliente: "G", estado: "proposta", propostoEm: "2026-09-15T10:00:00-03:00" }),
    ], janelaDoMes(hoje), hoje);
    expect(c.propostasSemResposta.map((x) => x.cliente)).toEqual(["G", "F"]);
  });

  it("quem tem tudo agendado não é cobrado", () => {
    const hoje = new Date(2026, 8, 20);
    expect(montarCobranca([cli({ cliente: "H", estado: "agendada", quando: "x" })], janelaDoMes(hoje), hoje)).toHaveLength(0);
  });

  it("separa por pessoa e coloca quem tem mais pendência na frente", () => {
    const hoje = new Date(2026, 8, 18);
    const r = montarCobranca([
      cli({ cliente: "A", estado: "pendente", responsavel: "Carlos" }),
      cli({ cliente: "B", estado: "pendente", responsavel: "Thiago" }),
      cli({ cliente: "C", estado: "pendente", responsavel: "Thiago" }),
    ], janelaDoMes(hoje), hoje);
    expect(r[0].pessoa).toBe("Thiago");
    expect(r[1].pessoa).toBe("Carlos");
  });
});

describe("o texto muda de tom com a urgência", () => {
  const hoje22 = new Date(2026, 8, 22);
  it("no último dia diz que é o último dia", () => {
    const [c] = montarCobranca([cli({ cliente: "A", estado: "pendente" })], janelaDoMes(hoje22), hoje22);
    const t = textoCobranca(c, janelaDoMes(hoje22), "@5522999");
    expect(t).toMatch(/último dia/);
    expect(t).toContain("@5522999");
    expect(t).toMatch(/1 sem reunião marcada/);
  });

  it("no dia 15 é convite, não cobrança", () => {
    const hoje15 = new Date(2026, 8, 15);
    const [c] = montarCobranca([cli({ cliente: "A", estado: "pendente" })], janelaDoMes(hoje15), hoje15);
    expect(textoCobranca(c, janelaDoMes(hoje15), "")).toMatch(/abriu a janela/);
  });
});

describe("lembretes: véspera e uma hora antes", () => {
  const reuniao = (o: Partial<{ quando: string; lembrouVespera: boolean; lembrouUmaHora: boolean }>) => ({
    clientId: "1", cliente: "Contele", responsavel: "Thiago",
    quando: "2026-09-18T14:00:00-03:00", lembrouVespera: false, lembrouUmaHora: false, ...o,
  });

  it("dispara a véspera ~24h antes", () => {
    const agora = new Date("2026-09-17T17:00:00Z");   // 14h de SP, 24h antes
    const l = lembretesDevidos([reuniao({})], agora);
    expect(l.map((x) => x.tipo)).toEqual(["vespera"]);
  });

  it("não dispara a véspera com 3 dias de antecedência", () => {
    expect(lembretesDevidos([reuniao({})], new Date("2026-09-15T17:00:00Z"))).toHaveLength(0);
  });

  it("dispara uma hora antes", () => {
    const agora = new Date("2026-09-18T16:00:00Z");   // 13h de SP, 1h antes
    expect(lembretesDevidos([reuniao({})], agora).map((x) => x.tipo)).toEqual(["uma_hora"]);
  });

  it("não repete o que já foi lembrado", () => {
    const agora = new Date("2026-09-18T16:00:00Z");
    expect(lembretesDevidos([reuniao({ lembrouUmaHora: true })], agora)).toHaveLength(0);
  });

  it("depois da hora marcada, nada dispara", () => {
    expect(lembretesDevidos([reuniao({})], new Date("2026-09-18T18:00:00Z"))).toHaveLength(0);
  });

  it("o texto da véspera oferece o briefing; o de 1h é curto", () => {
    const l = lembretesDevidos([reuniao({})], new Date("2026-09-17T17:00:00Z"))[0];
    expect(textoLembrete(l, "sexta às 14:00", "@55")).toMatch(/prepara a reunião/);
    const l2 = lembretesDevidos([reuniao({})], new Date("2026-09-18T16:00:00Z"))[0];
    expect(textoLembrete(l2, "sexta às 14:00", "@55")).toMatch(/em uma hora/);
  });
});

// ── Regras que o Roberto definiu em 03/09 ─────────────────────────────────
import { primeiroDiaUtil, decidirAcao, diasUteisEntre, MAX_TENTATIVAS } from "@/lib/cs/reuniao-mensal";

describe("a janela respeita dia útil", () => {
  it("dia 15 no sábado empurra a abertura para segunda", () => {
    // Agosto/2026: dia 15 é sábado. Roberto: "ele tem que verificar se o dia quinze é um domingo,
    // é um sábado; se for, então ele manda no dia dezoito".
    const j = janelaDoMes(new Date(2026, 7, 17));   // segunda, 17/08
    expect(j.abre).toBe("2026-08-17");
    expect(j.ajuste).toMatch(/sábado/);
    expect(j.aberta).toBe(true);
  });

  it("dia 22 no fim de semana antecipa o fechamento para a sexta", () => {
    // Prazo que termina no sábado termina, na prática, na sexta.
    const j = janelaDoMes(new Date(2026, 10, 20));  // novembro/2026: dia 22 é domingo
    expect(j.fecha).toBe("2026-11-20");
  });

  it("sábado dentro da janela: o agente fica quieto", () => {
    const j = janelaDoMes(new Date(2026, 8, 19));   // sábado, 19/09
    expect(j.aberta).toBe(false);
  });

  it("primeiroDiaUtil pula o fim de semana e não mexe em dia útil", () => {
    expect(primeiroDiaUtil(new Date(2026, 7, 15)).getDate()).toBe(17); // sáb → seg
    expect(primeiroDiaUtil(new Date(2026, 7, 16)).getDate()).toBe(17); // dom → seg
    expect(primeiroDiaUtil(new Date(2026, 7, 18)).getDate()).toBe(18); // ter → ter
  });
});

describe("duas tentativas e depois entrega pro social", () => {
  const base = { clientId: "1", cliente: "Contele", responsavel: "Thiago", quando: null, propostoEm: null };
  const dia16 = new Date(2026, 8, 16, 8);   // quarta, dentro da janela
  const j = janelaDoMes(dia16);

  it("cliente sem oferta nenhuma: oferta a primeira", () => {
    const a = decidirAcao({ ...base, estado: "pendente" }, j, dia16);
    expect(a).toEqual({ tipo: "ofertar", tentativa: 1 });
  });

  it("ofertado hoje: espera, não insiste", () => {
    const a = decidirAcao({ ...base, estado: "ofertada", tentativas: 1, ofertadoEm: dia16.toISOString() }, j, dia16);
    expect(a.tipo).toBe("nada");
  });

  it("dois dias sem resposta: segunda tentativa", () => {
    const a = decidirAcao(
      { ...base, estado: "ofertada", tentativas: 1, ofertadoEm: new Date(2026, 8, 14).toISOString() }, j, dia16);
    expect(a).toMatchObject({ tipo: "reofertar", tentativa: 2 });
  });

  it("esgotadas as duas, passa pro social negociar — não tenta uma terceira", () => {
    const a = decidirAcao(
      { ...base, estado: "ofertada", tentativas: MAX_TENTATIVAS, ofertadoEm: new Date(2026, 8, 13).toISOString() }, j, dia16);
    expect(a.tipo).toBe("passar_pro_social");
    if (a.tipo === "passar_pro_social") expect(a.motivo).toMatch(/2 ofertas sem resposta/);
  });
});

describe("o social tem 1 dia ÚTIL para confirmar", () => {
  it("pedido ontem (dia útil): cobra", () => {
    const quarta = new Date(2026, 8, 16, 10);
    const a = decidirAcao(
      { clientId: "1", cliente: "X", responsavel: "Thiago", estado: "aguardando_social", quando: null,
        propostoEm: null, perguntadoAoSocialEm: new Date(2026, 8, 15, 10).toISOString() },
      janelaDoMes(quarta), quarta);
    expect(a.tipo).toBe("cobrar_social");
  });

  it("pedido na sexta, cobrado na segunda: conta 1 dia útil, não 3", () => {
    // Contar o fim de semana contra a pessoa seria cobrar por dias que ela não trabalhou.
    expect(diasUteisEntre(new Date(2026, 8, 18), new Date(2026, 8, 21))).toBe(1);
  });

  it("pedido hoje: não cobra ainda", () => {
    const quarta = new Date(2026, 8, 16, 17);
    const a = decidirAcao(
      { clientId: "1", cliente: "X", responsavel: "Thiago", estado: "proposta", quando: null,
        propostoEm: new Date(2026, 8, 16, 9).toISOString() },
      janelaDoMes(quarta), quarta);
    expect(a.tipo).toBe("nada");
  });
});

describe("fora da janela o agente não fala com cliente", () => {
  it("dia 2 do mês: nenhuma ação, mesmo com cliente pendente", () => {
    const dia2 = new Date(2026, 8, 2, 8);
    const a = decidirAcao(
      { clientId: "1", cliente: "X", responsavel: "Thiago", estado: "pendente", quando: null, propostoEm: null },
      janelaDoMes(dia2), dia2);
    expect(a.tipo).toBe("nada");
  });

  it("reunião já agendada não gera ação nenhuma", () => {
    const dia16 = new Date(2026, 8, 16, 8);
    const a = decidirAcao(
      { clientId: "1", cliente: "X", responsavel: "Thiago", estado: "agendada", quando: "2026-09-25T14:00:00-03:00", propostoEm: null },
      janelaDoMes(dia16), dia16);
    expect(a.tipo).toBe("nada");
  });
});
