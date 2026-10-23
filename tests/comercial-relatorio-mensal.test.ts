import { describe, expect, it } from "vitest";
import { mesAnterior, montarRelatorioMensal, primeiroDiaUtil, rotuloDoMes, type LeadRel } from "@/lib/crm/relatorio-mensal";
import { htmlRelatorioMensal } from "@/lib/crm/relatorio-mensal-html";

// DADOS SINTÉTICOS (o repositório é público: nada de nome de cliente real).
const L = (id: string, estagio: string, p: Partial<LeadRel> = {}): LeadRel => ({ id, estagio, empresa: `Loja ${id}`, contatoNome: `Contato ${id}`, createdAt: "2026-10-05T12:00:00Z", ...p });
const AGORA = new Date("2026-11-03T11:00:00Z");

const leads: LeadRel[] = [
  L("A", "ganho", { fechadoEm: "2026-10-22", origem: "Site", responsavel: "Vendedor Um", valorOrcamento: 1997, valorImplantacao: 500, clienteId: "c1", primeiroContatoEm: "2026-10-05T12:30:00Z" }),
  L("B", "ganho", { fechadoEm: "2026-10-23", origem: "Prospecção ativa", responsavel: "Vendedor Dois", valorOrcamento: 1500 }),
  L("C", "negociacao", { origem: "Site", etapaDesde: "2026-10-12T12:00:00Z", valorOrcamento: 1797, probabilidade: 0.5 }),
  L("D", "perdido", { fechadoEm: "2026-10-28", motivoPerdaCodigo: "sem_resposta", origem: "Visita — Rota Lagos" }),
  L("E", "contato", { origem: "Visita — Rota Lagos", etapaDesde: "2026-10-06T12:00:00Z" }),
  L("F", "contato", { origem: "Visita — Rota Lagos", createdAt: "2026-09-20T12:00:00Z", etapaDesde: "2026-09-20T12:00:00Z" }),
];
const r = montarRelatorioMensal({
  mes: "2026-10", agora: AGORA, leads,
  historico: [{ leadId: "D", para: "proposta", em: "2026-10-15T12:00:00Z" }],
  atividades: [
    { leadId: "E", tipo: "whatsapp", createdAt: "2026-10-07T12:00:00Z" },
    { leadId: "C", tipo: "ligacao", createdAt: "2026-10-13T12:00:00Z" },
    { leadId: "C", tipo: "nota", createdAt: "2026-10-13T12:00:00Z" },
    { leadId: "E", tipo: "whatsapp", createdAt: "2026-09-25T12:00:00Z" },
  ],
  reunioes: [
    { leadId: "C", inicio: "2026-10-14T17:00:00Z", estado: "realizada", criadoEm: "2026-10-10T12:00:00Z" },
    { leadId: "E", inicio: "2026-11-05T17:00:00Z", estado: "agendada", criadoEm: "2026-10-30T12:00:00Z" },
  ],
  metaValor: 6000,
});

describe("datas do relatório", () => {
  it("1º dia útil pula fim de semana e feriado nacional (2/11 é Finados)", () => {
    expect(primeiroDiaUtil("2026-11")).toBe("2026-11-03");
    expect(primeiroDiaUtil("2026-12")).toBe("2026-12-01");
    expect(mesAnterior("2026-01")).toBe("2025-12");
    expect(rotuloDoMes("2026-10")).toBe("outubro de 2026");
  });
});

describe("números do mês (as mesmas contas do Dashboard)", () => {
  it("resumo: vendas, oportunidades, conversão em 'X de Y' e frase", () => {
    expect(r.resumo).toMatchObject({ vendas: 2, vendasAnterior: 0, oportunidades: 4, leads: 5, leadsAnterior: 1 });
    expect(r.resumo.conversao).toEqual({ n: 2, de: 4, pct: null, poucos: true });
    expect(r.resumo.fechamento).toMatchObject({ n: 2, de: 3 });
    expect(r.resumo.frase).toBe("2 vendas fechadas em outubro — 2 a mais que setembro.");
  });
  it("funil dos leads que entraram no mês", () => {
    expect(r.funil).toEqual([
      { rotulo: "Entraram", n: 5 }, { rotulo: "Contato feito", n: 5 }, { rotulo: "Diagnóstico", n: 4 }, { rotulo: "Proposta", n: 4 }, { rotulo: "Contrato", n: 2 },
    ]);
  });
  it("vendas, origem, perdas, ritmo, Rota e o que vem", () => {
    expect(r.vendas.map((v) => [v.nome, v.virouCliente])).toEqual([["Loja A", true], ["Loja B", false]]);
    expect(r.origens[0]).toMatchObject({ chave: "Site", leads: 2, oportunidades: 2, ganhos: 1 });
    expect(r.perdas).toEqual([{ motivo: expect.stringMatching(/resposta/i), n: 1 }]);
    expect(r.ritmo).toMatchObject({ toques: 2, propostas: 0, reunioesMarcadas: 2, reunioesRealizadas: 1, naoVeio: 0, primeiraRespostaN: 1, primeiraRespostaHoras: 0.5 });
    expect(r.rota).toEqual({ visitas: 2, oportunidades: 1 });
    expect(r.proximo.reunioes).toEqual([{ nome: "Loja E", dia: "2026-11-05" }]);
    expect(r.proximo.parados[0]).toMatchObject({ nome: "Loja F", etapa: expect.any(String) });
  });
  it("mês sem venda sai assim mesmo, e diz isso sem drama", () => {
    const vazio = montarRelatorioMensal({ mes: "2026-09", agora: AGORA, leads, historico: [], atividades: [], reunioes: [], metaValor: null });
    expect(vazio.resumo.vendas).toBe(0);
    expect(vazio.resumo.frase).toMatch(/^Nenhuma venda fechada em setembro\./);
  });
});

describe("o grupo nunca recebe valor", () => {
  const grupo = htmlRelatorioMensal(r, { privado: false, geradoEm: "03/11/2026 08:00" });
  const roberto = htmlRelatorioMensal(r, { privado: true, geradoEm: "03/11/2026 08:00" });
  it("versão do grupo: sem R$, sem a página Dinheiro e sem os valores dos negócios", () => {
    expect(grupo).not.toMatch(/R\$/);
    expect(grupo).not.toMatch(/Dinheiro/);
    expect(grupo).not.toMatch(/1\.997|1\.500|1\.797|6\.000/);
    expect(grupo).toContain("Relatório de vendas — outubro de 2026");
    expect(grupo).toContain("Loja A");
  });
  it("versão do Roberto: a mesma coisa + a página Dinheiro com R$", () => {
    expect(roberto).toMatch(/Dinheiro — só para você/);
    expect(roberto).toMatch(/R\$/);
    expect(roberto).toContain("versão do Roberto");
  });
  it("nome com caractere especial é escapado", () => {
    const html = htmlRelatorioMensal({ ...r, vendas: [{ nome: "Loja <b>X</b> & Cia", origem: "Site", responsavel: "—", cicloDias: 3, virouCliente: false }] }, { privado: false, geradoEm: "x" });
    expect(html).toContain("Loja &lt;b&gt;X&lt;/b&gt; &amp; Cia");
  });
});
