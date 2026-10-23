import { describe, expect, it } from "vitest";
import { cicloMedioDias, coortePorMes, diaDaOportunidade, fracao, oportunidadesParaContrato, porGrupo, taxaDeFechamento, textoFracao, type EtapaHist, type LeadTaxa } from "@/lib/crm/taxas";

// DADOS SINTÉTICOS.
const L = (id: string, estagio: string, p: Partial<LeadTaxa> = {}): LeadTaxa => ({ id, estagio, createdAt: "2026-10-01T12:00:00Z", ...p });
const H = (leadId: string, para: string, em: string): EtapaHist => ({ leadId, para, em });
const OUT = { ini: "2026-10-01", fim: "2026-10-31" };
const SET = { ini: "2026-09-01", fim: "2026-09-30" };

describe("oportunidade = chegou a Proposta", () => {
  it("visita da Rota e contato feito não são oportunidade; proposta, negociação e ganho são", () => {
    expect(diaDaOportunidade(L("a", "contato"))).toBeNull();
    expect(diaDaOportunidade(L("b", "diagnostico"))).toBeNull();
    expect(diaDaOportunidade(L("c", "negociacao", { etapaDesde: "2026-10-10T15:00:00Z" }))).toBe("2026-10-10");
    expect(diaDaOportunidade(L("d", "ganho", { fechadoEm: "2026-10-22" }))).toBe("2026-10-22");
  });
  it("usa a PRIMEIRA entrada pelo histórico ou pela proposta enviada", () => {
    const hist = [H("x", "proposta", "2026-10-05T12:00:00Z"), H("x", "negociacao", "2026-10-12T12:00:00Z")];
    expect(diaDaOportunidade(L("x", "negociacao", { etapaDesde: "2026-10-12T12:00:00Z" }), hist)).toBe("2026-10-05");
    expect(diaDaOportunidade(L("y", "contato", { propostaEnviadaEm: "2026-10-03" }))).toBe("2026-10-03"); // voltou de proposta
  });
  it("perdido que passou por negociação é oportunidade perdida; perdido sem proposta não conta", () => {
    expect(diaDaOportunidade(L("p", "perdido"), [H("p", "negociacao", "2026-10-08T12:00:00Z")])).toBe("2026-10-08");
    expect(diaDaOportunidade(L("q", "perdido"))).toBeNull();
  });
});

describe("oportunidades → contrato (o número de 'oportunidades × fechamento')", () => {
  const leads = [
    L("g1", "ganho", { fechadoEm: "2026-10-22" }),
    L("g2", "ganho", { fechadoEm: "2026-10-23", propostaEnviadaEm: "2026-10-15" }),
    L("n1", "negociacao", { etapaDesde: "2026-10-12T12:00:00Z" }),
    L("n2", "proposta", { etapaDesde: "2026-09-20T12:00:00Z" }),
    L("p1", "perdido", { fechadoEm: "2026-10-20" }),
    L("c1", "contato"),
  ];
  const hist = [H("p1", "proposta", "2026-10-02T12:00:00Z")];

  it("conta as oportunidades do período e onde estão hoje; amostra pequena não vira porcentagem", () => {
    const r = oportunidadesParaContrato(leads, hist, OUT);
    expect(r).toMatchObject({ oportunidades: 4, ganhas: 2, perdidas: 1, abertas: 1 });
    expect(r.fracao).toEqual({ n: 2, de: 4, pct: null, poucos: true });
    expect(textoFracao(r.fracao)).toBe("2 de 4");
  });
  it("respeita o período e o 'desde o início'", () => {
    expect(oportunidadesParaContrato(leads, hist, SET).oportunidades).toBe(1);
    expect(oportunidadesParaContrato(leads, hist, null).oportunidades).toBe(5);
  });
  it("com 5 ou mais, mostra porcentagem", () => {
    expect(fracao(2, 9)).toEqual({ n: 2, de: 9, pct: 22, poucos: false });
    expect(textoFracao(fracao(2, 9))).toBe("22%");
  });
});

describe("taxa de fechamento e ciclo", () => {
  const leads = [
    L("g1", "ganho", { fechadoEm: "2026-10-22", primeiroContatoEm: "2026-10-02T09:00:00Z" }),
    L("g2", "ganho", { fechadoEm: "2026-10-10", createdAt: "2026-10-01T12:00:00Z" }),
    L("p1", "perdido", { fechadoEm: "2026-10-20" }),
    L("p2", "perdido", { fechadoEm: "2026-09-15" }),
  ];
  it("dos decididos no período, quantos foram ganhos", () => {
    expect(taxaDeFechamento(leads, OUT)).toMatchObject({ ganhos: 2, perdidos: 1, fracao: { n: 2, de: 3, pct: null } });
    expect(taxaDeFechamento(leads, null).fracao.de).toBe(4);
  });
  it("ciclo médio em dias do primeiro contato (ou cadastro) ao ganho", () => {
    expect(cicloMedioDias(leads, OUT)).toBe(15); // (20 + 9) / 2 = 14,5 → 15
    expect(cicloMedioDias(leads, SET)).toBeNull();
  });
});

describe("por origem e coorte por mês", () => {
  const leads = [
    L("r1", "contato", { origem: "Visita — Rota Lagos" }),
    L("r2", "contato", { origem: "Visita — Rota Lagos" }),
    L("s1", "ganho", { origem: "Site", fechadoEm: "2026-10-20" }),
    L("s2", "negociacao", { origem: "Site", etapaDesde: "2026-10-15T12:00:00Z" }),
    L("v1", "perdido", { origem: "", createdAt: "2026-09-10T12:00:00Z", fechadoEm: "2026-09-30" }),
  ];
  it("leads → oportunidades → ganhos por origem, com a fração sobre as oportunidades", () => {
    const g = porGrupo(leads, [], OUT, (l) => l.origem, "Sem origem");
    expect(g.map((x) => [x.chave, x.leads, x.oportunidades, x.ganhos])).toEqual([["Site", 2, 2, 1], ["Visita — Rota Lagos", 2, 0, 0]]);
    expect(g[1].fracao).toEqual({ n: 0, de: 0, pct: null, poucos: true }); // 0 de 0, nunca "0%" com barra
  });
  it("coorte: dos que entraram no mês, onde estão hoje", () => {
    expect(coortePorMes(leads, [], ["2026-09", "2026-10"])).toEqual([
      { ym: "2026-09", entraram: 1, oportunidade: 0, ganharam: 0, perderam: 1, abertos: 0 },
      { ym: "2026-10", entraram: 4, oportunidade: 2, ganharam: 1, perderam: 0, abertos: 3 },
    ]);
  });
});
