// tests/trafego-contas-verba.test.ts — Tráfego › Contas & Verba (Leva 4): ritmo do mês na mesma linha
// do saldo, aviso de aporte, "sync atrasado" que não acende toda manhã e a migração do aporte que
// ficou só no navegador.

import { describe, it, expect } from "vitest";
import { diaDoMes, ritmoDoMes, avisoAporte, syncAtrasado, aportesParaMigrar } from "@/lib/trafego/contas-verba";

describe("ritmo do mês", () => {
  it("dia e tamanho do mês pela data de São Paulo", () => {
    expect(diaDoMes("2026-09-24")).toEqual({ dia: 24, diasNoMes: 30 });
    expect(diaDoMes("2028-02-10")).toEqual({ dia: 10, diasNoMes: 29 });
  });

  it("sem verba não inventa ritmo", () => {
    const r = ritmoDoMes({ verba: null, gasto: 500, hoje: "2026-09-10" });
    expect(r.status).toBe("sem_verba");
    expect(r.pctGasto).toBeNull();
    expect(r.mediaDia).toBe(50);
    expect(ritmoDoMes({ verba: 0, gasto: 0, hoje: "2026-09-10" }).status).toBe("sem_verba");
  });

  it("no ritmo linear é ok; o marcador de hoje e a barra batem com o mês", () => {
    const r = ritmoDoMes({ verba: 3000, gasto: 1000, hoje: "2026-09-10" });
    expect(r.status).toBe("ok");
    expect(r.pctGasto).toBeCloseTo(33.33, 1);
    expect(r.pctMes).toBeCloseTo(33.33, 1);
    expect(r.diaIdeal).toBe(100);
    expect(r.mediaDia).toBe(100);
    expect(r.fimProjetado).toBe(30);
  });

  it("gasto desconhecido é sem dados (nunca 'no ritmo'); zero depois do dia 2 é parado", () => {
    expect(ritmoDoMes({ verba: 3000, gasto: null, hoje: "2026-09-10" }).status).toBe("sem_dados");
    expect(ritmoDoMes({ verba: 3000, gasto: 0, hoje: "2026-09-10" }).status).toBe("parado");
  });

  it("gastou demais: crítico, barra limitada a 100%", () => {
    const r = ritmoDoMes({ verba: 1000, gasto: 1500, hoje: "2026-09-10" });
    expect(r.status).toBe("critical");
    expect(r.pctGasto).toBe(100);
  });
});

describe("aviso de aporte", () => {
  const base = { hoje: "2026-09-24", pctGasto: 40 };
  it("Pix/Boleto: vencido, hoje, em até 3 dias; longe não avisa", () => {
    expect(avisoAporte({ ...base, forma: "pix", proximo: "2026-09-22" })).toEqual({ tipo: "vencido", texto: "Aporte vencido há 2 dias" });
    expect(avisoAporte({ ...base, forma: "boleto", proximo: "2026-09-24" })?.tipo).toBe("hoje");
    expect(avisoAporte({ ...base, forma: "pix", proximo: "2026-09-25" })?.texto).toBe("Aporte em 1 dia");
    expect(avisoAporte({ ...base, forma: "pix", proximo: "2026-10-10" })).toBeNull();
  });
  it("cartão não tem aporte; boleto com 80% da verba pede novo boleto", () => {
    expect(avisoAporte({ ...base, forma: "cartao", proximo: "2026-09-22" })).toBeNull();
    expect(avisoAporte({ hoje: "2026-09-24", pctGasto: 85, forma: "boleto", proximo: null })?.tipo).toBe("boleto_80");
  });
});

describe("sync atrasado", () => {
  // Horas em São Paulo (UTC−3).
  const sp = (dia: string, hora: string) => Date.parse(`${dia}T${hora}:00-03:00`);
  const iso = (ms: number) => new Date(ms).toISOString();

  it("de dia, mais de 3h sem sync acende", () => {
    const agora = sp("2026-09-24", "15:00");
    expect(syncAtrasado(iso(sp("2026-09-24", "12:30")), agora)).toBe(false);
    expect(syncAtrasado(iso(sp("2026-09-24", "11:30")), agora)).toBe(true);
  });

  it("de manhã cedo, a última das 20h de ontem não é atraso", () => {
    const agora = sp("2026-09-24", "07:00");
    expect(syncAtrasado(iso(sp("2026-09-23", "20:00")), agora)).toBe(false);
    expect(syncAtrasado(iso(sp("2026-09-23", "16:00")), agora)).toBe(true);
    // 8h30: a leitura das 8h pode estar rodando
    expect(syncAtrasado(iso(sp("2026-09-23", "20:00")), sp("2026-09-24", "08:30"))).toBe(false);
  });

  it("sem data não acende", () => {
    expect(syncAtrasado(null, Date.now())).toBe(false);
  });
});

describe("migração do aporte que ficou no navegador", () => {
  const contas = [
    { id: "acc-1", clientId: "c1", proximoAporte: null },
    { id: "acc-1b", clientId: "c1", proximoAporte: null }, // mesma conta do cliente em dois cadastros
    { id: "acc-2", clientId: "c2", proximoAporte: "2026-10-01" }, // servidor já tem
    { id: "acc-3", clientId: "c3", proximoAporte: null },
  ];
  it("sobe só data válida, que ainda vale e que o servidor não tem — uma por cliente", () => {
    const local = JSON.stringify({
      c1: { monthlyBudget: 3000, nextPaymentDate: "2026-09-30" },
      c2: { nextPaymentDate: "2026-09-28" },
      c3: { nextPaymentDate: "2026-09-01" }, // passou
    });
    expect(aportesParaMigrar(local, contas, "2026-09-24")).toEqual([{ adAccountId: "acc-1", clientId: "c1", data: "2026-09-30" }]);
  });
  it("nada ou lixo no navegador não sobe nada", () => {
    expect(aportesParaMigrar(null, contas, "2026-09-24")).toEqual([]);
    expect(aportesParaMigrar("{quebrado", contas, "2026-09-24")).toEqual([]);
    expect(aportesParaMigrar(JSON.stringify({ c1: { nextPaymentDate: "amanhã" } }), contas, "2026-09-24")).toEqual([]);
  });
});

// Leva 7A: a leitura que a barra nova desenha (gasto, "hoje", projeção no ritmo recente e a frase).
import { lerRitmo, foraDoRitmo } from "@/lib/trafego/contas-verba";

describe("leitura do ritmo (barra de Contas & Verba)", () => {
  it("no ritmo: projeção pelo ritmo dos últimos 3 dias e o marcador de hoje", () => {
    const l = lerRitmo(ritmoDoMes({ verba: 3000, gasto: 1000, hoje: "2026-09-10" }), 100);
    expect(l.tom).toBe("no_ritmo");
    expect(l.titulo).toBe("No ritmo");
    expect(l.pctHoje).toBeCloseTo(33.33, 1);
    expect(l.projetadoFim).toBe(3000);
    expect(l.pctProjetado).toBe(100);
    expect(l.diaEstouro).toBe(30); // acaba no último dia: é o ritmo certo
    expect(l.fonteRitmo).toBe("3d");
    expect(foraDoRitmo(l)).toBe(false);
  });

  it("acima: diz o dia em que a verba acaba", () => {
    const l = lerRitmo(ritmoDoMes({ verba: 3000, gasto: 1500, hoje: "2026-09-10" }), 150);
    expect(l.tom).toBe("acima");
    expect(l.diaEstouro).toBe(20);
    expect(l.titulo).toBe("Acima do ritmo — estoura dia 20");
    expect(l.pctProjetado).toBe(150);
    expect(foraDoRitmo(l)).toBe(true);
  });

  it("mês no ritmo, mas o ritmo de agora estoura antes do fim: vira acima; 4% de folga não", () => {
    const acelerou = lerRitmo(ritmoDoMes({ verba: 3000, gasto: 1000, hoje: "2026-09-10" }), 140);
    expect(acelerou.tom).toBe("acima");
    expect(acelerou.titulo).toBe("Acima do ritmo — estoura dia 25");
    const quase = lerRitmo(ritmoDoMes({ verba: 3000, gasto: 1000, hoje: "2026-09-10" }), 106);
    expect(quase.tom).toBe("no_ritmo");
  });

  it("verba já estourada", () => {
    const l = lerRitmo(ritmoDoMes({ verba: 1000, gasto: 1200, hoje: "2026-09-10" }), 120);
    expect(l.tom).toBe("acima");
    expect(l.titulo).toBe("Verba estourada");
    expect(l.diaEstouro).toBe(10);
  });

  it("abaixo do ritmo", () => {
    const l = lerRitmo(ritmoDoMes({ verba: 3000, gasto: 500, hoje: "2026-09-10" }), 50);
    expect(l.tom).toBe("abaixo");
    expect(l.titulo).toBe("Abaixo do ritmo");
    expect(l.projetadoFim).toBe(1500);
  });

  it("travada: nada no mês, ou nada nos últimos 3 dias", () => {
    expect(lerRitmo(ritmoDoMes({ verba: 3000, gasto: 0, hoje: "2026-09-10" }), 0).tom).toBe("travada");
    const parou = lerRitmo(ritmoDoMes({ verba: 3000, gasto: 1000, hoje: "2026-09-10" }), 0);
    expect(parou.tom).toBe("travada");
    expect(parou.titulo).toBe("Travada — sem gasto há 3 dias");
  });

  it("sem média de 3 dias usa a média do mês; sem verba e sem dados não inventam", () => {
    const l = lerRitmo(ritmoDoMes({ verba: 3000, gasto: 1000, hoje: "2026-09-10" }), null);
    expect(l.fonteRitmo).toBe("mes");
    expect(l.projetadoFim).toBe(3000);
    expect(lerRitmo(ritmoDoMes({ verba: null, gasto: 500, hoje: "2026-09-10" }), 50).tom).toBe("sem_verba");
    const sd = lerRitmo(ritmoDoMes({ verba: 3000, gasto: null, hoje: "2026-09-10" }), 50);
    expect(sd.tom).toBe("sem_dados");
    expect(foraDoRitmo(sd)).toBe(false);
  });
});
