import { describe, it, expect } from "vitest";
import { validarContrato, bloqueios, familias, valoresCitados, diasCitados } from "@/lib/contracts/validacao";
import type { EntradaValidacao } from "@/lib/contracts/validacao";

// O caso concreto: contrato do Max, da Celmapel Festas, gerado em set/2026. Roberto apontou 3
// ajustes objetivos. Este teste trava os três.
const CELMAPEL: EntradaValidacao = {
  razaoSocial: "Marinho e Braga Comércio de Artigos de Festas Ltda",
  nomeFantasia: "CELMAPEL FESTAS",
  cnpj: "00.000.000/0001-00",
  segmento: "Construção Civil",
  enderecoRua: "Rua Iza Domingues Eurico",
  cidade: "Araruama",
  representante: "Max",
  cargo: "Sócio",
  cpf: "000.000.000-00",
  email: "max@celmapel.com.br",
  tipoServico: "lone_growth",
  valorMensal: 1500,
  diaPagamento: 10,
  duracaoMeses: 3,
  modalidade: "ciclos",
  clausulas: [
    { title: "Objeto", body: "Prestação de serviços de marketing digital, incluindo Meta Ads e Google Ads quando aplicável, criação de até 2 artes e 1 Reels por semana." },
    { title: "Valor e pagamento", body: "A CONTRATANTE pagará R$ 1.500,00 mensais, com vencimento todo dia 10, em ciclos sucessivos de três meses." },
  ],
};

const limpo = (over: Partial<EntradaValidacao> = {}): EntradaValidacao => ({
  ...CELMAPEL, segmento: "comércio de artigos para festas", enderecoNumero: "120", ...over,
});

describe("auditoria do contrato — o caso Celmapel", () => {
  it("bloqueia segmento que contradiz a razão social", () => {
    const b = bloqueios(validarContrato(CELMAPEL));
    const erro = b.find((a) => a.codigo === "ERRO_CRITICO_007");
    expect(erro).toBeDefined();
    expect(erro!.mensagem).toMatch(/Constru[çc][ãa]o Civil/);
    expect(erro!.mensagem).toMatch(/Artigos de Festas/);
  });

  it("aceita o segmento corrigido", () => {
    expect(bloqueios(validarContrato(limpo()))).toHaveLength(0);
  });

  it("avisa quando o endereço não tem número", () => {
    const a = validarContrato(CELMAPEL);
    const av = a.find((x) => x.codigo === "REVISAO_ENDERECO");
    expect(av?.gravidade).toBe("revisao"); // Roberto: "não significa que esteja errado, mas eu conferiria"
    expect(av!.mensagem).toMatch(/Rua Iza Domingues Eurico/);
    // Com número, cala.
    expect(validarContrato(limpo()).some((x) => x.codigo === "REVISAO_ENDERECO")).toBe(false);
    // Número embutido na rua também vale.
    expect(validarContrato(limpo({ enderecoNumero: null, enderecoRua: "Rua Iza Domingues Eurico, 120" }))
      .some((x) => x.codigo === "REVISAO_ENDERECO")).toBe(false);
  });
});

describe("auditoria do contrato — dados herdados e pacote no lugar do ramo", () => {
  it("recusa nome de pacote como segmento", () => {
    // clients.industry guarda "Lone Growth" em 24 dos 52 cadastros ativos. Cair nele escreve o
    // pacote onde deveria estar o ramo do cliente.
    for (const p of ["Lone Growth", "Trafego Pago", "Social Media", "Outro"]) {
      const b = bloqueios(validarContrato(limpo({ segmento: p })));
      expect(b.some((a) => a.codigo === "ERRO_CRITICO_007"), p).toBe(true);
    }
  });

  it("não inventa conflito quando não dá pra classificar", () => {
    // Razão social genérica: sem família identificada, não acusa nada.
    const b = bloqueios(validarContrato(limpo({ razaoSocial: "MB Comércio Ltda", segmento: "comércio varejista" })));
    expect(b).toHaveLength(0);
  });

  it("reconhece as famílias de atividade", () => {
    expect(familias("Comércio de Artigos de Festas Ltda")).toContain("festas");
    expect(familias("Construção Civil")).toContain("construcao");
    expect(familias("Farmácia de Manipulação")).toContain("saude");
  });
});

describe("auditoria do contrato — escopo", () => {
  it("bloqueia social dentro de contrato só de tráfego", () => {
    const b = bloqueios(validarContrato(limpo({ tipoServico: "assessoria_trafego" })));
    expect(b.some((a) => a.codigo === "ERRO_CRITICO_004")).toBe(true);
  });

  it("bloqueia tráfego dentro de contrato só de social", () => {
    const b = bloqueios(validarContrato(limpo({ tipoServico: "assessoria_social" })));
    expect(b.some((a) => a.codigo === "ERRO_CRITICO_005")).toBe(true);
  });

  it("bloqueia ciclo trimestral em contrato de site não solicitado", () => {
    const b = bloqueios(validarContrato(limpo({ tipoServico: "site", modalidade: "determinado", duracaoMeses: 12 })));
    expect(b.some((a) => a.codigo === "ERRO_CRITICO_006")).toBe(true);
  });
});

describe("auditoria do contrato — coerência de números", () => {
  it("bloqueia valor da cláusula diferente do quadro-resumo", () => {
    const b = bloqueios(validarContrato(limpo({ valorMensal: 2000 })));
    const e = b.find((a) => a.codigo === "ERRO_CRITICO_008");
    expect(e?.mensagem).toMatch(/2000\.00.*1500\.00/);
  });

  it("bloqueia vencimento divergente", () => {
    const b = bloqueios(validarContrato(limpo({ diaPagamento: 5 })));
    expect(b.some((a) => a.codigo === "ERRO_CRITICO_009")).toBe(true);
  });

  it("bloqueia prazo incompatível com ciclos trimestrais", () => {
    const b = bloqueios(validarContrato(limpo({ duracaoMeses: 4 })));
    expect(b.some((a) => a.codigo === "ERRO_CRITICO_003")).toBe(true);
  });

  it("bloqueia serviço e valor ausentes", () => {
    const b = bloqueios(validarContrato(limpo({ tipoServico: "", valorMensal: 0 })));
    expect(b.map((a) => a.codigo)).toEqual(expect.arrayContaining(["ERRO_CRITICO_001", "ERRO_CRITICO_002"]));
  });

  it("lê valores e dias do texto", () => {
    expect(valoresCitados("pagará R$ 1.500,00 mensais e verba de R$ 900,00")).toEqual([1500, 900]);
    expect(diasCitados("vencimento todo dia 10, prorrogável ao dia 15")).toEqual([10, 15]);
  });
});

describe("auditoria do contrato — qualidade", () => {
  it("acusa cláusula duplicada", () => {
    const c = { title: "Confidencialidade", body: "As partes se obrigam a manter sigilo sobre toda informação trocada durante a vigência deste instrumento e por dois anos após o encerramento." };
    const a = validarContrato(limpo({ clausulas: [...limpo().clausulas, c, { ...c, title: "Sigilo" }] }));
    expect(a.some((x) => x.codigo === "REVISAO_DUPLICADA")).toBe(true);
  });

  it("acusa representante sem cargo e sem e-mail", () => {
    const a = validarContrato(limpo({ cargo: "", email: "" }));
    expect(a.map((x) => x.codigo)).toEqual(expect.arrayContaining(["REVISAO_CARGO", "REVISAO_EMAIL"]));
  });
});

describe("legenda da auditoria", () => {
  it("diz explicitamente quando não há alerta", async () => {
    const { avisosDaAuditoria } = await import("@/lib/contracts/validacao");
    expect(avisosDaAuditoria([])).toMatch(/nenhum alerta/i);
    expect(avisosDaAuditoria(undefined)).toMatch(/nenhum alerta/i);
  });

  it("lista as revisões e ignora os bloqueios (que nem chegam aqui)", async () => {
    const { avisosDaAuditoria } = await import("@/lib/contracts/validacao");
    const t = avisosDaAuditoria([
      { codigo: "REVISAO_ENDERECO", gravidade: "revisao", mensagem: "Endereço sem número." },
      { codigo: "ERRO_CRITICO_002", gravidade: "bloqueio", mensagem: "Valor ausente." },
    ]);
    expect(t).toMatch(/Endereço sem número/);
    expect(t).not.toMatch(/Valor ausente/);
  });
});
