// As cenas da conversa, pela decisão inteira (05/11/2026): o que o agente faz com cada mensagem do
// cliente, dado o que ele está esperando e a reunião que já existe. A rota só executa o que sai daqui.
import { describe, it, expect } from "vitest";
import {
  lerMensagemDoCliente, decidirNaConversa, sugerirHorarios, lerRespostaSocial, type ContextoDaConversa,
} from "@/lib/cs/agendar-reuniao";

const sp = (s: string) => new Date(`${s}-03:00`);
const nada: ContextoDaConversa = { propostaVale: false, perguntou: false, citouReuniao: false };
const QUARTA = sp("2026-11-04T15:00:00");

type Ativa = Parameters<typeof decidirNaConversa>[4];
const agendada = (o = {}): Ativa => ({
  id: "reu", estado: "agendada", start_at: "2026-11-05T13:00:00+00:00", responsavel: "Thiago",   // quinta 10:00
  horario_proposto: null, proposto_lado: null, ...o,
});

function decide(texto: string, ctx: ContextoDaConversa = nada, ativa: Ativa = null, agora = QUARTA) {
  return decidirNaConversa(lerMensagemDoCliente(texto, agora, ctx), texto, agora, ctx, ativa);
}

describe("o cliente propõe do nada", () => {
  it("leva ao social, com hora escrita de qualquer jeito", () => {
    for (const f of ["reunião quinta às 10", "reunião quinta 10 horas", "podemos fazer a reunião quinta 10hs", "marca a reunião pra quinta às 10"]) {
      expect(decide(f), f).toEqual({ tipo: "levar_ao_social", iso: "2026-11-05T10:00:00-03:00", agendadaId: null, alvoId: null });
    }
  });

  it("dia e turno: propõe a hora", () => {
    expect(decide("reunião quinta de manhã")).toMatchObject({ tipo: "propor", iso: "2026-11-05T10:00:00-03:00" });
  });

  it("sem horário: pergunta", () => {
    expect(decide("bora marcar a reunião desse mês").tipo).toBe("perguntar");
  });

  for (const f of ["bom dia!", "a promoção começa dia 18 às 8h", "ok", "pode ser", "a reunião de ontem foi ótima"]) {
    it(`"${f}" segue o fluxo normal`, () => expect(decide(f)).toEqual({ tipo: "seguir" }));
  }
});

describe("o cliente responde à oferta", () => {
  // Oferta de segunda 16/11: terça 17 às 10h e quarta 18 às 15h.
  const opcoes = sugerirHorarios(sp("2026-11-16T08:00:00"), 2, "2026-11-20");
  const comOferta: ContextoDaConversa = { ...nada, oferta: { id: "of", opcoes } };
  const TERCA = sp("2026-11-16T14:00:00");

  it("com outro horário: anota na própria linha da oferta", () => {
    for (const f of ["Pode ser terça às 15h", "Terça às 15h fica bom", "terça 15 horas", "terça às 15"]) {
      expect(decide(f, comOferta, null, TERCA), f).toEqual({ tipo: "levar_ao_social", iso: "2026-11-17T15:00:00-03:00", agendadaId: null, alvoId: "of" });
    }
  });

  it("escolhendo uma opção: entende qual", () => {
    expect(decide("o primeiro", comOferta, null, TERCA)).toMatchObject({ tipo: "levar_ao_social", iso: opcoes[0].iso, alvoId: "of" });
    expect(decide("pode ser quarta", comOferta, null, TERCA)).toMatchObject({ tipo: "levar_ao_social", iso: opcoes[1].iso, alvoId: "of" });
  });

  it('"pode ser" citando a oferta: pergunta qual, em vez de chutar', () => {
    expect(decide("pode ser", { ...comOferta, citouReuniao: true }, null, TERCA).tipo).toBe("perguntar");
  });

  for (const f of ["ok", "show", "a promoção começa dia 18 às 8h", "chega mercadoria quinta às 14h", "bom dia"]) {
    it(`"${f}" não é resposta, mesmo com a oferta aberta`, () => {
      expect(decide(f, comOferta, null, TERCA)).toEqual({ tipo: "seguir" });
    });
  }
});

describe("o cliente fala da reunião que já está marcada", () => {
  it("citou o horário dela: confirma e NÃO reabre", () => {
    for (const f of ["Nossa reunião é amanhã às 10h, né?", "reunião quinta às 10 confirmada", "confirmado a reunião quinta 10h"]) {
      expect(decide(f, nada, agendada()), f).toEqual({ tipo: "ja_marcada", iso: "2026-11-05T13:00:00+00:00" });
    }
  });

  it("citou só o turno do mesmo dia: diz a hora certa", () => {
    expect(decide("a reunião é amanhã de manhã, né?", nada, agendada({ start_at: "2026-11-05T17:00:00+00:00" })))
      .toEqual({ tipo: "ja_marcada", iso: "2026-11-05T17:00:00+00:00" });
  });

  it("outro horário: muda a MESMA reunião, não cria outra", () => {
    expect(decide("podemos mudar a reunião pra sexta às 15h?", nada, agendada()))
      .toEqual({ tipo: "levar_ao_social", iso: "2026-11-06T15:00:00-03:00", agendadaId: "reu", alvoId: "reu" });
    expect(decide("vamos remarcar a reunião pra sexta às 15h", nada, agendada()))
      .toMatchObject({ tipo: "levar_ao_social", agendadaId: "reu" });
  });

  it("pediu para mudar sem dizer quando: sai dos lembretes e pede outro horário", () => {
    for (const f of ["preciso remarcar a reunião", "vou ter que cancelar a reunião", "não vou conseguir ir na reunião de amanhã"]) {
      expect(decide(f, nada, agendada()), f).toEqual({ tipo: "pedir_outro_horario", reuniaoId: "reu", iso: "2026-11-05T13:00:00+00:00", responsavel: "Thiago" });
    }
  });

  it('"vamos remarcar?" só conta com a reunião perto', () => {
    expect(decide("vamos remarcar?", nada, agendada()).tipo).toBe("pedir_outro_horario");
    expect(decide("vamos remarcar?", nada, agendada({ start_at: "2026-11-20T13:00:00+00:00" })).tipo).toBe("seguir");
  });

  it("sem reunião nenhuma, recusa segue o fluxo normal", () => {
    expect(decide("preciso remarcar a reunião")).toEqual({ tipo: "seguir" });
  });

  it("repetiu o horário que já levou ao social: não pergunta de novo", () => {
    const esperando = agendada({ estado: "aguardando_social", start_at: "2026-11-06T18:00:00+00:00", horario_proposto: "2026-11-06T18:00:00+00:00", proposto_lado: "cliente" });
    expect(decide("reunião sexta às 15h", nada, esperando).tipo).toBe("ja_proposta");
  });
});

describe("a negociação", () => {
  const propostaDoAgente: ContextoDaConversa = {
    ...nada, propostaVale: true,
    pendente: { id: "p", horario_proposto: "2026-11-10T18:00:00+00:00", proposto_lado: "agente" },
  };
  const contraproposta: ContextoDaConversa = {
    ...nada, propostaVale: true,
    pendente: { id: "p", horario_proposto: "2026-11-06T19:00:00+00:00", proposto_lado: "social" },
  };
  const naMesa = agendada({ id: "p", estado: "aguardando_social", start_at: "2026-11-06T18:00:00+00:00", horario_proposto: "2026-11-06T19:00:00+00:00", proposto_lado: "social" });

  it("aceitou a proposta do agente: agora o social decide", () => {
    expect(decide("isso, pode confirmar", propostaDoAgente)).toMatchObject({ tipo: "levar_ao_social", iso: "2026-11-10T18:00:00+00:00", alvoId: "p" });
  });

  it("aceitou a CONTRAPROPOSTA do social: fecha, sem perguntar de novo", () => {
    for (const f of ["pode", "pode ser", "isso", "fechado", "por mim ok"]) {
      expect(decide(f, contraproposta, naMesa), f).toEqual({ tipo: "fechar", iso: "2026-11-06T19:00:00+00:00", reuniaoId: "p" });
    }
  });

  it("devolveu outro horário: nova rodada com o social, na mesma linha", () => {
    expect(decide("sexta às 17h", contraproposta, naMesa)).toMatchObject({ tipo: "levar_ao_social", iso: "2026-11-06T17:00:00-03:00", alvoId: "p" });
  });

  it("recusou: pede outro horário", () => {
    expect(decide("não vai dar não", contraproposta, naMesa).tipo).toBe("pedir_outro_horario");
    expect(decide("não vai dar não", propostaDoAgente).tipo).toBe("pedir_outro_horario");
  });

  it("depois de pedir para mudar, a resposta curta é lida", () => {
    expect(decide("sexta às 15h", { ...nada, perguntou: true })).toMatchObject({ tipo: "levar_ao_social", iso: "2026-11-06T15:00:00-03:00" });
  });

  it('o social diz "ok, 10h" com o horário vindo do banco em UTC: fecha, não devolve', () => {
    expect(lerRespostaSocial("ok, 10h", QUARTA, "2026-11-05T13:00:00+00:00").tipo).toBe("aceita");
  });
});
