// tests/ranking-criativos.test.ts — Leva 7A (N5) ranking de criativos e (N6) referência por nicho.

import { describe, it, expect } from "vitest";
import { agregarPorAnuncio, ranquear, mediana, adIdDe, type LinhaAnuncioDia } from "@/lib/traffic/ranking-criativos";
import { metricasDoCliente, referenciasPorNicho, compararComNicho, MIN_CLIENTES, type Metricas30d } from "@/lib/traffic/referencia-nicho";

const dia = (ad: string, data: string, spend: number, conversions: number, o: Partial<LinhaAnuncioDia> = {}): LinhaAnuncioDia => ({
  client_id: "c", entity_id: `${ad}_${data}`, entity_name: `Anúncio ${ad}`, campaign_name: "Camp", metric_date: data,
  spend, impressions: spend * 100, clicks: spend, conversions, ...o,
});

describe("ranking de criativos", () => {
  it("agrega por anúncio (o id vem antes do _data) e a cópia repetida do dia não soma duas vezes", () => {
    expect(adIdDe("123_2026-09-20")).toBe("123");
    const m = agregarPorAnuncio([dia("1", "2026-09-20", 50, 5), dia("1", "2026-09-21", 50, 5), dia("1", "2026-09-21", 50, 5)]);
    expect(m.get("1")).toMatchObject({ gasto: 100, resultados: 10, primeiroDia: "2026-09-20", ultimoDia: "2026-09-21" });
  });

  it("do mais barato ao mais caro; pouco gasto fica de fora; gastou sem resultado vai pra faixa própria", () => {
    const ag = [...agregarPorAnuncio([
      dia("barato", "2026-09-20", 100, 20),   // R$ 5
      dia("caro", "2026-09-20", 100, 4),      // R$ 25
      dia("medio", "2026-09-20", 100, 10),    // R$ 10
      dia("nada", "2026-09-20", 80, 0),
      dia("pouco", "2026-09-20", 10, 3),
    ]).values()];
    const r = ranquear(ag, { hoje: "2026-09-24" }, { gastoMinimo: 30 });
    expect(r.ranqueados.map((c) => c.adId)).toEqual(["barato", "medio", "caro"]);
    expect(r.ranqueados[0]).toMatchObject({ posicao: 1, custo: 5, diasNoAr: 5 });
    expect(r.medianaCusto).toBe(10);
    expect(r.ranqueados[0].vsMediana).toBe(0.5);
    expect(r.semResultado.map((c) => c.adId)).toEqual(["nada"]);
    expect(r.poucoGasto).toBe(1);
  });

  it("frequência de 7 dias e dias no ar vêm de fora quando existem", () => {
    const ag = [...agregarPorAnuncio([dia("1", "2026-09-23", 100, 10)]).values()];
    const [c] = ranquear(ag, { hoje: "2026-09-24", frequencia: new Map([["1", 3.4]]), diasNoAr: new Map([["1", 40]]) }).ranqueados;
    expect(c).toMatchObject({ frequencia7d: 3.4, diasNoAr: 40 });
  });

  it("tipo de resultado pelo que o anúncio trouxe", () => {
    const ag = [...agregarPorAnuncio([dia("1", "2026-09-23", 100, 10, { result_kind: "leads" })]).values()];
    expect(ranquear(ag, { hoje: "2026-09-24" }).ranqueados[0].tipoResultado).toBe("leads");
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([])).toBeNull();
  });
});

describe("referência por nicho", () => {
  const m = (custo: number, tipo: Metricas30d["tipo"] = "mensagens"): Metricas30d =>
    ({ gasto: 1000, resultados: 1000 / custo, impressoes: 100_000, cliques: 1500, custo, ctr: 1.5, cpm: 10, tipo });

  it("métricas de 30 dias do cliente: resultado pelo objetivo quando gravado", () => {
    const r = metricasDoCliente([
      { metric_date: "2026-09-20", spend: 100, impressions: 10_000, clicks: 100, conversions: 1, results: 10, result_kind: "leads" },
      { metric_date: "2026-09-21", spend: 100, impressions: 10_000, clicks: 100, conversions: 10 },
    ]);
    expect(r).toMatchObject({ gasto: 200, resultados: 20, custo: 10, ctr: 1, cpm: 10, tipo: "misto" });
  });

  it(`só nicho com ${MIN_CLIENTES}+ clientes; custo só entre o mesmo tipo de resultado`, () => {
    const refs = referenciasPorNicho([
      { nicho: "construcao", m: m(10) }, { nicho: "construcao", m: m(20) }, { nicho: "construcao", m: m(30) },
      { nicho: "construcao", m: m(50, "leads") },
      { nicho: "pet", m: m(5) }, { nicho: "pet", m: m(6) },   // só 2: não vira referência
      { nicho: null, m: m(1) },
    ]);
    expect(refs.has("pet")).toBe(false);
    const c = refs.get("construcao")!;
    expect(c.clientes).toBe(4);
    expect(c.custo.mensagens).toEqual({ valor: 20, clientes: 3 });
    expect(c.custo.leads).toBeUndefined(); // 1 cliente de lead: anônimo demais
  });

  it("comparação com ±15% de folga", () => {
    expect(compararComNicho(8, 10)).toBe("abaixo");
    expect(compararComNicho(10.5, 10)).toBe("na_media");
    expect(compararComNicho(13, 10)).toBe("acima");
    expect(compararComNicho(null, 10)).toBeNull();
  });
});
