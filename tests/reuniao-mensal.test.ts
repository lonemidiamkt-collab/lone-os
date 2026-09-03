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
