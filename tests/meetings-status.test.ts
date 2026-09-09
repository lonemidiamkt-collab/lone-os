import { describe, it, expect } from "vitest";
import {
  saudeDoCliente, cobertura, porResponsavel, janelaDoMes, passaNoFiltro,
  META_PADRAO_MES, type ReuniaoRef,
} from "@/lib/meetings/status";

const AGORA = new Date("2026-09-15T12:00:00-03:00");
const r = (p: Partial<ReuniaoRef> & { estado: string }): ReuniaoRef => ({
  id: Math.random().toString(36).slice(2), clientId: "c1",
  inicio: "2026-09-10T14:00:00-03:00", ...p,
});

describe("agendada NÃO é realizada", () => {
  it("só reunião realizada deixa o cliente verde", () => {
    const s = saudeDoCliente([r({ estado: "agendada" })], "2026-09", AGORA);
    expect(s.status).toBe("agendada");
    expect(s.realizadas).toBe(0);
    expect(s.metaAtingida).toBe(false);
  });

  it("realizada deixa verde e bate a meta padrão", () => {
    const s = saudeDoCliente(
      [r({ estado: "realizada", realizadaEm: "2026-09-10T14:00:00-03:00" })], "2026-09", AGORA);
    expect(s.status).toBe("realizada");
    expect(s.meta).toBe(META_PADRAO_MES);
    expect(s.metaAtingida).toBe(true);
  });

  it("cancelada e no-show não contam como reunião do mês", () => {
    const s = saudeDoCliente(
      [r({ estado: "cancelada" }), r({ estado: "no_show" })], "2026-09", AGORA);
    expect(s.status).toBe("sem_reuniao");
    expect(s.canceladas).toBe(1);
    expect(s.naoCompareceu).toBe(1);
  });

  it("sem nada é vermelho", () => {
    expect(saudeDoCliente([], "2026-09", AGORA).status).toBe("sem_reuniao");
  });
});

describe("a data que conta é a que ACONTECEU", () => {
  it("marcada em agosto e realizada em setembro conta para setembro", () => {
    const reu = r({
      estado: "realizada",
      inicio: "2026-08-30T14:00:00-03:00",
      realizadaEm: "2026-09-02T14:00:00-03:00",
    });
    expect(saudeDoCliente([reu], "2026-09", AGORA).realizadas).toBe(1);
    expect(saudeDoCliente([reu], "2026-08", AGORA).realizadas).toBe(0);
  });
});

describe("meta por cliente", () => {
  it("cliente com meta 2 não fecha o mês com uma reunião", () => {
    const uma = [r({ estado: "realizada", realizadaEm: "2026-09-10T14:00:00-03:00" })];
    expect(saudeDoCliente(uma, "2026-09", AGORA, 2).metaAtingida).toBe(false);
    expect(saudeDoCliente(uma, "2026-09", AGORA, 1).metaAtingida).toBe(true);
  });

  it("meta nula usa o padrão da agência — nunca zero", () => {
    expect(saudeDoCliente([], "2026-09", AGORA, null).meta).toBe(META_PADRAO_MES);
  });
});

describe("última e próxima", () => {
  const reunioes = [
    r({ estado: "realizada", inicio: "2026-07-05T10:00:00-03:00", realizadaEm: "2026-07-05T10:00:00-03:00" }),
    r({ estado: "realizada", inicio: "2026-08-12T10:00:00-03:00", realizadaEm: "2026-08-12T10:00:00-03:00" }),
    r({ estado: "agendada",  inicio: "2026-09-22T15:00:00-03:00" }),
    r({ estado: "agendada",  inicio: "2026-09-01T15:00:00-03:00" }),   // já passou
  ];

  it("a última é a mais recente que aconteceu", () => {
    expect(saudeDoCliente(reunioes, "2026-09", AGORA).ultima?.slice(0, 10)).toBe("2026-08-12");
  });

  it("a próxima é a primeira DAQUI PRA FRENTE — a de ontem não é próxima", () => {
    expect(saudeDoCliente(reunioes, "2026-09", AGORA).proxima?.slice(0, 10)).toBe("2026-09-22");
  });

  it("conta os dias desde a última", () => {
    expect(saudeDoCliente(reunioes, "2026-09", AGORA).diasSemReuniao).toBe(34);
  });

  it("quem nunca teve reunião tem dias nulo, não zero", () => {
    expect(saudeDoCliente([], "2026-09", AGORA).diasSemReuniao).toBeNull();
  });
});

describe("cobertura", () => {
  const saude = (e: string, n = 1) =>
    saudeDoCliente(Array.from({ length: n }, () =>
      r({ estado: e, realizadaEm: e === "realizada" ? "2026-09-10T14:00:00-03:00" : null })),
      "2026-09", AGORA);

  it("percentual é de clientes cobertos, não de reuniões feitas", () => {
    // 3 clientes: um com DUAS reuniões, um com uma agendada, um sem nada → 1 de 3 coberto.
    const c = cobertura([saude("realizada", 2), saude("agendada"), saude("cancelada")]);
    expect(c.comReuniaoRealizada).toBe(1);
    expect(c.totalRealizadas).toBe(2);
    expect(c.percentual).toBe(33.3);
  });

  it("sem cliente elegível é 0%, não divisão por zero", () => {
    expect(cobertura([]).percentual).toBe(0);
  });
});

describe("por responsável", () => {
  it("conta pelo dono da CARTEIRA e ordena por cobertura", () => {
    const feita = saudeDoCliente(
      [r({ estado: "realizada", realizadaEm: "2026-09-10T14:00:00-03:00" })], "2026-09", AGORA);
    const vazia = saudeDoCliente([], "2026-09", AGORA);
    const out = porResponsavel([
      { responsavel: "Thiago", saude: feita },
      { responsavel: "Thiago", saude: vazia },
      { responsavel: "Carlos", saude: feita },
    ]);
    expect(out[0]).toMatchObject({ responsavel: "Carlos", cobertura: 100 });
    expect(out[1]).toMatchObject({ responsavel: "Thiago", clientes: 2, cobertura: 50 });
  });

  it("cliente sem responsável não some da conta", () => {
    const out = porResponsavel([{ responsavel: null, saude: saudeDoCliente([], "2026-09", AGORA) }]);
    expect(out[0].responsavel).toBe("(sem responsável)");
  });
});

describe("janela do mês", () => {
  it("dezembro vira janeiro do ano seguinte", () => {
    expect(janelaDoMes("2026-12").ate.toISOString().slice(0, 10)).toBe("2027-01-01");
  });
});

describe("filtros", () => {
  const semNada = saudeDoCliente([], "2026-09", AGORA);
  const antiga = saudeDoCliente(
    [r({ estado: "realizada", inicio: "2026-06-01T10:00:00-03:00", realizadaEm: "2026-06-01T10:00:00-03:00" })],
    "2026-09", AGORA);

  it("mais de 30 dias pega quem nunca teve E quem tem reunião velha", () => {
    expect(passaNoFiltro(semNada, "mais_de_30d", AGORA)).toBe(true);
    expect(passaNoFiltro(antiga, "mais_de_30d", AGORA)).toBe(true);
  });

  it("'todos' não filtra nada", () => {
    expect(passaNoFiltro(semNada, "todos", AGORA)).toBe(true);
  });
});
