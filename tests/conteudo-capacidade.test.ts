// Cronômetro da etapa e carga diária do designer (lib/conteudo/capacidade.ts, Leva 7B N18).
import { describe, it, expect } from "vitest";
import { SEM_DONO } from "@/lib/design/dono";
import {
  cargaPorDesigner, cronometroDaEtapa, diasUteis, duracaoCurta, LIMITE_ARTES_POR_DIA,
} from "@/lib/conteudo/capacidade";

const agora = Date.parse("2026-09-24T12:00:00-03:00"); // quinta

describe("cronômetro", () => {
  type Item = Parameters<typeof cronometroDaEtapa>[0];
  const it0 = (p: { prazoArte?: string | null; card?: Partial<Item["card"]> } = {}): Item => ({
    etapa: "com_designer", prazoArte: p.prazoArte === undefined ? "2026-09-28" : p.prazoArte,
    card: { status: "in_production", columnEnteredAt: { in_production: "2026-09-23T12:00:00-03:00" }, ...(p.card ?? {}) },
  });

  it("formata a duração", () => {
    expect(duracaoCurta(30 * 60_000)).toBe("30min");
    expect(duracaoCurta(5 * 3_600_000)).toBe("5h");
    expect(duracaoCurta(3 * 86_400_000)).toBe("3d");
  });
  it("tempo na etapa contra o prazo da arte", () => {
    const c = cronometroDaEtapa(it0(), agora)!;
    expect(c.prazo).toBe("2026-09-28");
    expect(c.tom).toBe("ok");
    expect(c.rotulo).toBe("24h na etapa · faltam 4d");
    expect(c.fracao).toBeCloseTo(0.2, 1);
  });
  it("perto do prazo fica em atenção; passado, estourado", () => {
    expect(cronometroDaEtapa(it0({ prazoArte: "2026-09-24", card: { dueTime: "18:00", dueDate: "2026-09-24" } }), agora)!.tom).toBe("atencao");
    const vencido = cronometroDaEtapa(it0({ prazoArte: "2026-09-23" }), agora)!;
    expect(vencido.tom).toBe("estourado");
    expect(vencido.rotulo).toContain("venceu há");
  });
  it("revisão e cliente usam a data de postagem; sem prazo = neutro", () => {
    const r = cronometroDaEtapa({ etapa: "com_cliente", prazoArte: null, card: { status: "client_approval", dueDate: "2026-09-30", statusChangedAt: "2026-09-22T12:00:00-03:00" } }, agora)!;
    expect(r.prazo).toBe("2026-09-30");
    expect(r.rotulo.startsWith("2d na etapa")).toBe(true);
    const semPrazo = cronometroDaEtapa({ etapa: "revisao", prazoArte: null, card: { status: "approval", statusChangedAt: "2026-09-24T10:00:00-03:00" } }, agora)!;
    expect(semPrazo.tom).toBe("neutro");
    expect(semPrazo.rotulo).toBe("2h na etapa");
  });
  it("pauta, agendado e no ar não têm cronômetro", () => {
    expect(cronometroDaEtapa({ etapa: "pauta", prazoArte: null, card: { status: "ideas", statusChangedAt: "2026-09-01T00:00:00Z" } }, agora)).toBeNull();
    expect(cronometroDaEtapa({ etapa: "agendado", prazoArte: null, card: { status: "scheduled", statusChangedAt: "2026-09-01T00:00:00Z" } }, agora)).toBeNull();
  });
});

describe("carga do designer", () => {
  it("dias úteis a partir de hoje", () => {
    expect(diasUteis("2026-09-24", 5)).toEqual(["2026-09-24", "2026-09-25", "2026-09-28", "2026-09-29", "2026-09-30"]);
  });
  it("conta o que o designer deve por dia; vencida vai para hoje; fim de semana para sexta; aviso acima do limite", () => {
    const deve = (designer: string | null, prazoArte: string | null, estado: "na_fila" | "entregue" = "na_fila") => ({ designer, prazoArte, estado });
    const itens = [
      deve("Rodrigo", "2026-09-22"),
      ...Array.from({ length: LIMITE_ARTES_POR_DIA }, () => deve("Rodrigo", "2026-09-24")),
      deve("Rodrigo", "2026-09-27"), // domingo → sexta 25
      deve("Rodrigo", "2026-09-25", "entregue"), // já entregue: não conta
      deve("Rodrigo", null),
      deve(null, "2026-09-28"),
      deve("Rodrigo", "2026-10-20"), // fora da janela
    ];
    const [rod, sem] = cargaPorDesigner(itens, "2026-09-24", { designers: ["Rodrigo", "Gabriel"] }).filter((c) => c.designer !== "Gabriel");
    expect(rod.designer).toBe("Rodrigo");
    expect(rod.dias[0]).toEqual({ data: "2026-09-24", artes: LIMITE_ARTES_POR_DIA + 1, acima: true });
    expect(rod.dias[1].artes).toBe(1);
    expect(rod.vencidas).toBe(1);
    expect(rod.semPrazo).toBe(1);
    expect(rod.acima).toBe(true);
    expect(sem.designer).toBe(SEM_DONO);
    expect(sem.dias[2].artes).toBe(1);
    const gabriel = cargaPorDesigner(itens, "2026-09-24", { designers: ["Gabriel"] }).find((c) => c.designer === "Gabriel")!;
    expect(gabriel.maxDia).toBe(0);
    expect(gabriel.acima).toBe(false);
  });
});
