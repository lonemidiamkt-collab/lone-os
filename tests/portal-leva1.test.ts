import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/meta/api", () => ({}));
vi.mock("@/lib/meta/insights-server", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

const { calcPeriod } = await import("@/lib/portal/buildSnapshot");
const { cacheValido, CACHE_TTL_MS } = await import("@/lib/portal/snapshotCache");
const { formatDelta, resumoConversas } = await import("@/lib/portal/formatDelta");
const { criarLimite, criarTrava } = await import("@/lib/portal/limite");
const { mesesPermitidosCliente, inicioJanelaMeses } = await import("@/lib/portal/mesesCliente");

// Instantes em UTC; o servidor não tem TZ, então a conta tem que sair em São Paulo de qualquer jeito.
const em = (iso: string) => new Date(iso);

describe("calcPeriod — calendário de São Paulo", () => {
  it("dia 1º: 'Este mês' nunca tem início depois do fim", () => {
    const p = calcPeriod("this_month", em("2026-10-01T15:00:00Z")); // 12h em SP
    expect(p.start).toBe("2026-10-01");
    expect(p.end).toBe("2026-10-01");
    expect(p.start <= p.end).toBe(true);
    expect(p.previous_start).toBe("2026-09-01");
    expect(p.previous_end).toBe("2026-09-01");
  });

  it("22h em SP de 30/09 ainda é setembro (em UTC já é 01/10)", () => {
    const p = calcPeriod("this_month", em("2026-10-01T01:00:00Z"));
    expect(p.start).toBe("2026-09-01");
    expect(p.end).toBe("2026-09-29");
  });

  it("'Este mês' compara com os mesmos dias do mês anterior, sem passar do fim dele", () => {
    const p = calcPeriod("this_month", em("2026-03-31T15:00:00Z")); // 31/03: janela 1–30/03
    expect(p.start).toBe("2026-03-01");
    expect(p.end).toBe("2026-03-30");
    expect(p.previous_start).toBe("2026-02-01");
    expect(p.previous_end).toBe("2026-02-28");
  });

  it("últimos 7 dias termina ontem e o anterior encosta nele", () => {
    const p = calcPeriod("last_week", em("2026-09-23T15:00:00Z"));
    expect(p).toMatchObject({ start: "2026-09-16", end: "2026-09-22", previous_start: "2026-09-09", previous_end: "2026-09-15" });
  });

  it("mês passado em janeiro volta o ano", () => {
    const p = calcPeriod("last_month", em("2027-01-10T15:00:00Z"));
    expect(p).toMatchObject({ start: "2026-12-01", end: "2026-12-31", previous_start: "2026-11-01", previous_end: "2026-11-30" });
  });
});

describe("cacheValido — idade máxima do snapshot", () => {
  const agora = Date.parse("2026-09-23T12:00:00Z");
  it("recente vale, velho e sem data não", () => {
    expect(cacheValido("2026-09-23T10:00:00Z", agora)).toBe(true);
    expect(cacheValido(new Date(agora - CACHE_TTL_MS - 1).toISOString(), agora)).toBe(false);
    expect(cacheValido("2026-08-01T00:00:00Z", agora)).toBe(false);
    expect(cacheValido(null, agora)).toBe(false);
    expect(cacheValido("lixo", agora)).toBe(false);
  });
});

describe("formatDelta / resumo", () => {
  it("mostra o percentual e a direção certa por métrica", () => {
    expect(formatDelta("messages", 12.4, "last_week")?.text).toBe("↗ 12% a mais que a semana passada");
    expect(formatDelta("cpa", -20, "last_week")?.text).toContain("20% mais barato");
    expect(formatDelta("reach", 3, "last_week")?.text).toContain("Parecido");
    expect(formatDelta("spend", null, "last_week")).toBeNull();
  });
  it("frase de topo", () => {
    expect(resumoConversas(48, 12, "last_week")).toBe("Nos últimos 7 dias: 48 conversas, 12% a mais que a semana anterior.");
    expect(resumoConversas(1, null, "last_month")).toBe("No mês passado: 1 conversa.");
    expect(resumoConversas(null, 10, "last_week")).toBeNull();
  });
});

describe("limite em memória", () => {
  it("bloqueia depois do máximo e libera na janela seguinte; limpa entradas vencidas", () => {
    const l = criarLimite(2, 1000);
    expect(l.estourou("a", 0)).toBe(false);
    expect(l.estourou("a", 1)).toBe(false);
    expect(l.estourou("a", 2)).toBe(true);
    expect(l.estourou("a", 1500)).toBe(false);
    l.estourou("b", 1500);
    expect(l.tamanho()).toBe(2);
    l.estourou("c", 200_000); // passa da limpeza: a e b venceram
    expect(l.tamanho()).toBe(1);
  });

  it("trava de PIN: N erros travam, acerto zera", () => {
    const t = criarTrava(3, 60_000, 600_000);
    t.falhou("tok", 0); t.falhou("tok", 1);
    expect(t.travado("tok", 2)).toBe(0);
    t.falhou("tok", 3);
    expect(t.travado("tok", 4)).toBeGreaterThan(0);
    expect(t.travado("tok", 600_004)).toBe(0);
    t.falhou("x", 0); t.acertou("x"); t.falhou("x", 1); t.falhou("x", 2);
    expect(t.travado("x", 3)).toBe(0);
  });
});

describe("meses que o cliente pode lançar", () => {
  it("atual e anterior em SP, virando o ano", () => {
    expect(mesesPermitidosCliente(em("2026-01-15T15:00:00Z"))).toEqual(["2025-12", "2026-01"]);
    // 21h de 31/01 em SP (00h de 01/02 UTC) ainda é janeiro
    expect(mesesPermitidosCliente(em("2026-02-01T00:30:00Z"))).toEqual(["2025-12", "2026-01"]);
  });
  it("janela de 6 meses do 'Semestre'", () => {
    expect(inicioJanelaMeses(6, em("2026-09-23T15:00:00Z"))).toBe("2026-04");
    expect(inicioJanelaMeses(6, em("2026-03-10T15:00:00Z"))).toBe("2025-10");
  });
});
