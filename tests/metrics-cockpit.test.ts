// Teste OFFLINE da comparação do cockpit (sem banco).
// O problema real: a tela comparava com um baseline ESCRITO NO CÓDIGO (5 clientes, 42 posts,
// health 62) e desenhava setas verdes em cima disso. Toda "evolução" era ficção.
import { describe, it, expect } from "vitest";
import { compararComAnterior, type Cockpit } from "@/lib/metrics/cockpit";

const base = (over: Partial<Cockpit> = {}): Cockpit => ({
  periodo: "2026-07", clientes: 46, ativos: 33, emRisco: 0,
  churnPct: { valor: 0 }, healthMedio: { valor: 68.2 },
  postsPublicados: { valor: 265 }, postsMeta: 480,
  slaEntregaHoras: { valor: null, semFonte: "card não registra início" },
  slaCumprimentoPct: { valor: null, semFonte: "sem card com os dois carimbos" },
  designEntregues: { valor: 60 }, designNoPrazoPct: { valor: 92 },
  designDiasMedio: { valor: null, semFonte: "ninguém marca início do trabalho" },
  tarefasConcluidas: { valor: 40 }, tarefasVencidas: { valor: 5 },
  diasSemFalarMedio: { valor: 12.4 },
  cobertura: { health: 35, interacao: 15 }, ...over,
});

describe("compararComAnterior", () => {
  it("SEM mês anterior → nenhuma variação (não inventa evolução)", () => {
    const d = compararComAnterior(base(), null);
    expect(d.every((x) => x.variacaoPct === null)).toBe(true);
    // Mas os números do mês corrente continuam aparecendo.
    expect(d.find((x) => x.chave === "postsPublicados")?.atual).toBe(265);
  });

  it("COM mês anterior real → calcula a variação", () => {
    const d = compararComAnterior(base(), base({ periodo: "2026-06", postsPublicados: { valor: 200 } }));
    const posts = d.find((x) => x.chave === "postsPublicados")!;
    expect(posts.anterior).toBe(200);
    expect(posts.variacaoPct).toBeCloseTo(32.5, 1);
  });

  it("métrica SEM FONTE não vira variação nem some — carrega o motivo", () => {
    const d = compararComAnterior(base(), base({ periodo: "2026-06" }));
    const sla = d.find((x) => x.chave === "slaEntregaHoras")!;
    expect(sla.atual).toBeNull();
    expect(sla.variacaoPct).toBeNull();
    expect(sla.semFonte).toContain("início");
  });

  it("marca onde MENOR é melhor — senão 'tarefas vencidas subiu' vira seta verde", () => {
    const d = compararComAnterior(base(), null);
    expect(d.find((x) => x.chave === "tarefasVencidas")?.menorEhMelhor).toBe(true);
    expect(d.find((x) => x.chave === "churnPct")?.menorEhMelhor).toBe(true);
    expect(d.find((x) => x.chave === "postsPublicados")?.menorEhMelhor).toBe(false);
  });

  it("anterior ZERO não vira divisão por zero nem variação infinita", () => {
    const d = compararComAnterior(base({ tarefasVencidas: { valor: 5 } }),
                                  base({ periodo: "2026-06", tarefasVencidas: { valor: 0 } }));
    expect(d.find((x) => x.chave === "tarefasVencidas")?.variacaoPct).toBeNull();
  });

  it("nunca devolve NaN — foi o que apareceu na tela como 'NaNdias'", () => {
    const d = compararComAnterior(base({ diasSemFalarMedio: { valor: null } }), base({ periodo: "2026-06" }));
    for (const x of d) {
      expect(Number.isNaN(x.atual as number)).toBe(false);
      expect(Number.isNaN(x.variacaoPct as number)).toBe(false);
    }
  });
});
