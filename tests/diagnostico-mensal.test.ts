import { describe, it, expect } from "vitest";
import { analisar, consolidar, semanal, somar, variacao, type DadosCliente, type Dia, type Entidade } from "@/lib/diagnostico-mensal/analise";
import { periodoAnterior, periodoPadrao } from "@/lib/diagnostico-mensal/dados";
import { diagnosticoMensalHtml } from "@/lib/diagnostico-mensal/pdf";

const dia = (data: string, invest: number, resultados: number): Dia => ({ data, invest, resultados, impressoes: invest * 100, cliques: resultados * 4 });
const periodo = { de: "2026-09-19", ate: "2026-10-18" };
const anterior = { de: "2026-08-20", ate: "2026-09-18" };
const somarDia = (iso: string, n: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
const serie = (de: string, n: number, invest: number, res: (i: number) => number): Dia[] => Array.from({ length: n }, (_, i) => dia(somarDia(de, i), invest, res(i)));
const ent = (o: Partial<Entidade>): Entidade => ({
  id: "x", nome: "Anúncio", campanha: "C", invest: 100, impressoes: 10000, cliques: 100, resultados: 20, frequencia: 1.5,
  recente: { invest: 25, resultados: 5 }, antigo: { invest: 75, resultados: 15 }, ativo: true, ...o,
});
const base = (o: Partial<DadosCliente> = {}): DadosCliente => ({
  nome: "Cliente Teste", servico: "tráfego + social", comConta: true, periodo, anterior, rotulo: "conversas",
  dias: [...serie(anterior.de, 30, 50, () => 5), ...serie(periodo.de, 30, 50, () => 6)],
  anuncios: [], campanhas: [], metaCpl: null, ig: null, ...o,
});

describe("períodos", () => {
  it("dia 1º assume o mês fechado; outro dia, 30 dias até ontem", () => {
    expect(periodoPadrao("2026-11-01")).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
    expect(periodoPadrao("2026-10-19")).toEqual({ de: "2026-09-19", ate: "2026-10-18" });
  });
  it("mês civil compara com o mês civil anterior; janela móvel, com a janela de mesmo tamanho", () => {
    expect(periodoAnterior("2026-10-01", "2026-10-31")).toEqual({ de: "2026-09-01", ate: "2026-09-30" });
    expect(periodoAnterior("2026-09-19", "2026-10-18")).toEqual({ de: "2026-08-20", ate: "2026-09-18" });
  });
});

describe("totais", () => {
  it("custo por resultado só existe com resultado; variação sem base é null", () => {
    expect(somar([dia("2026-10-01", 100, 0)], "2026-10-01", "2026-10-01").cpl).toBeNull();
    expect(somar([dia("2026-10-01", 100, 20)], "2026-10-01", "2026-10-01").cpl).toBe(5);
    expect(variacao(10, 0)).toBeNull();
    expect(variacao(120, 100)).toBe(20);
  });
  it("30 dias viram 4 semanas (as sobras entram na última)", () => {
    const s = semanal(base().dias, periodo.de, periodo.ate);
    expect(s).toHaveLength(4);
    expect(s.reduce((x, y) => x + y.resultados, 0)).toBe(180);
  });
});

describe("achados", () => {
  it("conta que parou de gastar nos últimos 3 dias é urgente", () => {
    const dias = [...serie(anterior.de, 30, 50, () => 5), ...serie(periodo.de, 27, 50, () => 6), ...serie(somarDia(periodo.de, 27), 3, 0, () => 0)];
    const a = analisar(base({ dias }));
    expect(a.achados.find((x) => x.titulo === "Conta parou de gastar")?.gravidade).toBe("alta");
  });
  it("contrato com tráfego e conta sem gasto é apontado; com conta vinculada e gasto anterior, é urgente", () => {
    const parou = analisar(base({ dias: serie(anterior.de, 30, 50, () => 5) }));
    expect(parou.achados.find((x) => x.titulo === "Nenhum anúncio rodou no período")?.gravidade).toBe("alta");
    const nunca = analisar(base({ dias: [] }));
    expect(nunca.achados.some((x) => x.titulo.includes("nenhum anúncio nos últimos dois períodos"))).toBe(true);
    expect(analisar(base({ dias: [], comConta: false })).achados.some((x) => x.titulo === "Sem conta de anúncios vinculada")).toBe(true);
  });
  it("anúncio que gastou acima do piso sem resultado é desperdício; abaixo do piso, não", () => {
    const caro = analisar(base({ anuncios: [ent({ id: "a", nome: "Queimando", invest: 180, resultados: 0, antigo: { invest: 180, resultados: 0 }, recente: { invest: 0, resultados: 0 } })] }));
    expect(caro.achados.some((x) => x.titulo.includes("não trouxe conversas"))).toBe(true);
    const barato = analisar(base({ anuncios: [ent({ id: "b", invest: 25, resultados: 0, antigo: { invest: 25, resultados: 0 }, recente: { invest: 0, resultados: 0 } })] }));
    expect(barato.achados.some((x) => x.titulo.includes("não trouxe"))).toBe(false);
  });
  it("criativo cansando exige frequência alta E custo piorando", () => {
    const cansado = ent({ id: "c", frequencia: 4.2, antigo: { invest: 60, resultados: 15 }, recente: { invest: 40, resultados: 4 } });
    expect(analisar(base({ anuncios: [cansado] })).achados.some((x) => x.titulo.includes("cansando"))).toBe(true);
    expect(analisar(base({ anuncios: [{ ...cansado, frequencia: 1.5 }] })).achados.some((x) => x.titulo.includes("cansando"))).toBe(false);
  });
  it("custo acima da meta cadastrada gera achado; dentro da meta, não", () => {
    const dias = [...serie(anterior.de, 30, 50, () => 5), ...serie(periodo.de, 30, 50, () => 2)]; // CPL 25
    expect(analisar(base({ dias, metaCpl: 10 })).achados.some((x) => x.titulo === "Custo acima da meta")).toBe(true);
    expect(analisar(base({ dias, metaCpl: 30 })).achados.some((x) => x.titulo === "Custo acima da meta")).toBe(false);
  });
  it("Instagram com poucos posts vira achado; sem Instagram a dimensão fica sem nota", () => {
    const ig = { usuario: "x", seguidores: 1000, alcance: 5000, alcanceJanelaDias: 28, seguidoresGanhos: 20, engajamento: 300, postsNoPeriodo: 3, postsNoAnterior: 12, posts: [], parcial: false };
    expect(analisar(base({ ig })).achados.some((x) => x.area === "instagram")).toBe(true);
    const sem = analisar(base());
    expect(sem.dimensoes.find((x) => x.nome === "Instagram e conteúdo")?.nota).toBeNull();
  });
});

describe("anúncios", () => {
  it("cópias do mesmo criativo viram um só", () => {
    const c = consolidar([ent({ id: "1", nome: "ADS - VIDEO — Cópia", invest: 50, resultados: 10 }), ent({ id: "2", nome: "ADS - VIDEO", invest: 150, resultados: 30 })]);
    expect(c).toHaveLength(1);
    expect(c[0].invest).toBe(200);
    expect(c[0].resultados).toBe(40);
  });
  it("campeão exige gasto mínimo: 6 conversas com R$ 7 não é campeão", () => {
    const a = analisar(base({ anuncios: [ent({ id: "p", nome: "Pequeno", invest: 7, resultados: 6 }), ent({ id: "g", nome: "Grande", invest: 400, resultados: 80 })] }));
    expect(a.campeoes.map((x) => x.nome)).toEqual(["Grande"]);
  });
  it("anúncio que custa mais de 4x a referência é apontado mesmo com resultado", () => {
    const a = analisar(base({ metaCpl: 5, anuncios: [ent({ id: "c", nome: "Turbinado", invest: 600, resultados: 4 })] }));
    expect(a.achados.some((x) => x.titulo.includes("custo muito acima"))).toBe(true);
  });
});

describe("nota", () => {
  it("dimensão sem evidência não entra na conta", () => {
    const so = analisar(base({ dias: serie(periodo.de, 30, 2, () => 0) })); // pouco gasto, nenhum resultado
    expect(so.dimensoes.find((x) => x.nome === "Custo por resultado")?.nota).toBeNull();
  });
  it("conta sem anúncio e sem Instagram não ganha nota inventada", () => {
    expect(analisar(base({ dias: [] })).nota).toBeNull();
  });
  it("o PDF sai com HTML completo e escapa nome de cliente", () => {
    const { html } = diagnosticoMensalHtml(base({ nome: "A & <B>" }), "");
    expect(html).toContain("A &amp; &lt;B&gt;");
    expect(html).toContain("Plano de ação");
  });
});
