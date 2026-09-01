import { describe, it, expect } from "vitest";
import { timePdfHtml } from "@/lib/reports/desempenhoPdf";
import type { RelatorioTime } from "@/lib/reports/desempenho";

// O designer sumiu do primeiro relatório: o select pedia a coluna `designer`, que não existe em
// content_cards (é `designer_delivered_by`). O PostgREST devolvia erro, data vinha null, e o
// relatório dizia que ninguém tinha entregado nada numa semana de 44 artes. Daí duas regras:
// consulta que falha tem que gritar, e o relatório do time precisa mostrar o designer.

const base: RelatorioTime = {
  rotulo: "24/08 a 30/08",
  periodoAnterior: "17/08 a 23/08",
  blocos: [
    {
      pessoa: "Rodrigo", funcao: "designer", clientes: 12,
      variacao: { rotulo: "artes entregues", anterior: 30, atual: 44 },
      metas: { "Artes entregues": { valor: 44, alvo: 25, unidade: "un", melhorQuando: "maior" } },
      destaques: [], atencao: [],
    },
    {
      pessoa: "Carlos Augusto", funcao: "social", clientes: 8,
      variacao: { rotulo: "peças criadas", anterior: 24, atual: 24 },
      metas: {
        "Peças criadas": { valor: 24, alvo: 20, unidade: "un", melhorQuando: "maior" },
        "Pedidos decididos": { valor: null, alvo: 90, unidade: "%", melhorQuando: "maior", semBase: "nenhum pedido venceu" },
      },
      destaques: [], atencao: [],
    },
  ],
  trafego: {
    responsavel: "Julio", contasAtivas: 40, contasConectadas: 48, contasAtivasCadastro: 45,
    gasto: 13008.01, conversas: 2157, custoPorConversa: 6.03,
    variacaoCusto: 11, variacaoConversas: -10.9, variacaoGasto: -1.2,
    mes: { rotulo: "agosto de 2026", gasto: 54997.36, conversas: 9629, custoPorConversa: 5.71, contas: 43 },
    paradas: [
      { nome: "Bruno Tintas Iguaba", ultimoGasto: "2026-07-27", diasParada: 35 },
      { nome: "Dumar Comercio e serviços", ultimoGasto: null, diasParada: null },
    ],
  },
  geral: { artesEntregues: 44, pecasCriadas: 24, clientesAtendidos: 20, noPrazo: 84, retrabalho: 25, pedidosAbertos: 8, pedidosExpirados: 0 },
  estruturais: ["Rodrigo entregou 44 das 44 artes da semana. A produção inteira depende de uma pessoa."],
};

describe("relatório do time", () => {
  it("é UM documento com todas as funções", () => {
    const html = timePdfHtml(base, "");
    expect(html).toContain("Rodrigo");
    expect(html).toContain("Carlos Augusto");
    expect(html).toContain("Design");
    expect(html).toContain("Social Media");
    expect(html).toContain("Tráfego Pago");
  });

  it("mostra o risco que só aparece olhando o time junto", () => {
    // Pro Rodrigo, 44 entregas é uma semana produtiva. Só no conjunto vira ponto único de falha.
    expect(timePdfHtml(base, "")).toContain("depende de uma pessoa");
  });

  it("compara com a semana anterior — volume solto não diz se melhorou", () => {
    const html = timePdfHtml(base, "");
    expect(html).toMatch(/▲\s*47%/);          // 30 → 44
    expect(html).toContain("igual à semana passada"); // 24 → 24
    expect(html).toContain("17/08 a 23/08");
  });

  it("não inventa nota onde não há base", () => {
    const html = timePdfHtml(base, "");
    expect(html).toContain("nenhum pedido venceu");
    expect(html).not.toContain("fora da meta");
  });

  it("mostra quantos clientes cada pessoa atendeu", () => {
    const html = timePdfHtml(base, "");
    expect(html).toContain("12 clientes");
    expect(html).toContain("8 clientes");
  });

  // Roberto: "na parte do tráfego, sendo o responsável Julio, vale a pena melhorar as KPIs e
  // verificar esses números que não batem". O bloco dizia "40 contas com verba rodando" sem
  // denominador — 8 contas não gastaram nada, 5 delas de clientes ATIVOS.
  it("o tráfego tem dono e o número de contas tem denominador", () => {
    const html = timePdfHtml(base, "");
    expect(html).toContain("Julio");
    expect(html).toMatch(/40 de 45 contas/);
  });

  it("mostra investimento e conversas do MÊS, não só da semana", () => {
    const html = timePdfHtml(base, "");
    expect(html).toContain("agosto de 2026");
    expect(html).toContain("54.997,36");   // investido no mês
    expect(html).toContain("9.629");       // conversas no mês
    expect(html).toContain("Investido no mês");
  });

  it("nomeia a conta de cliente ativo com verba parada", () => {
    const html = timePdfHtml(base, "");
    expect(html).toContain("Bruno Tintas Iguaba");
    expect(html).toContain("35 dias");
    expect(html).toContain("nunca registrou gasto"); // Dumar: conta conectada que nunca rodou
  });
});

// O relatório mostrava 25% de retrabalho no topo e 18% no cartão do designer — mesma semana,
// mesmas 44 artes. Os 11 eventos de rework da semana incluíam 3 de artes entregues em semanas
// ANTERIORES; o denominador eram só as 44 desta. Numerador e denominador de conjuntos diferentes.
describe("consistência dos números na mesma página", () => {
  it("o retrabalho do topo é o mesmo critério do cartão da pessoa", () => {
    const r: RelatorioTime = {
      ...base,
      geral: { ...base.geral, artesEntregues: 44, retrabalho: 18 },
      blocos: [{
        pessoa: "Rodrigo", funcao: "designer", clientes: 26,
        metas: { "Voltaram pra refazer": { valor: 18, alvo: 15, unidade: "%", melhorQuando: "menor" } },
        destaques: [], atencao: [],
      }],
    };
    const html = timePdfHtml(r, "");
    const numeros = [...html.matchAll(/(\d+)%/g)].map((m) => m[1]);
    // 18 aparece; 25 (a razão de conjuntos misturados) não pode aparecer em lugar nenhum.
    expect(numeros).toContain("18");
    expect(numeros).not.toContain("25");
  });
});
