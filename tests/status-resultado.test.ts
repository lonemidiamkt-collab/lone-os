import { describe, it, expect } from "vitest";
import { statusPorResultado, saiDeOnboarding, DIAS_ONBOARDING } from "@/lib/traffic/status-resultado";

// Números REAIS de 13/09/2026 (últimos 7 dias, metric_snapshots x client_traffic_policy). O kanban
// mostrava todos esses em "Bons resultados".

const base = { temConta: true, convMin: 8 };

describe("status pelo resultado do anúncio — os casos de hoje", () => {
  it("Nova União: CPL 25,6 com crítico 21,7 → em risco", () => {
    const v = statusPorResultado({ ...base, gasto7d: 230, conv7d: 9, cplAlerta: 15.19, cplCritico: 21.69, convMin: 5 });
    expect(v.status).toBe("at_risk");
    expect(v.motivo).toMatch(/acima do crítico/);
  });

  it("Óticas Raki: CPL 17,6 com crítico 10,7 → em risco", () => {
    const v = statusPorResultado({ ...base, gasto7d: 123, conv7d: 7, cplAlerta: 7.5, cplCritico: 10.72, convMin: 6 });
    expect(v.status).toBe("at_risk");
  });

  it("Bruno Tintas Araruama: conta parada há 7 dias → em risco, antes de qualquer CPL", () => {
    const v = statusPorResultado({ ...base, gasto7d: 0, conv7d: 0, cplAlerta: 19.03, cplCritico: 27.18 });
    expect(v.status).toBe("at_risk");
    expect(v.motivo).toMatch(/sem nenhum gasto/);
  });

  it("Léo Carros: CPL 11,7 entre alerta 8,7 e crítico 12,4 → médio", () => {
    const v = statusPorResultado({ ...base, gasto7d: 432, conv7d: 37, cplAlerta: 8.68, cplCritico: 12.4 });
    expect(v.status).toBe("average");
  });

  it("Império dos Pisos: CPL 3,0 com alerta 7,8 → bom", () => {
    const v = statusPorResultado({ ...base, gasto7d: 1949, conv7d: 648, cplAlerta: 7.83, cplCritico: 11.19 });
    expect(v.status).toBe("good");
    expect(v.cpl).toBeCloseTo(3.0, 1);
  });

  it("Veneza: CPL 2,1 com meta 2,06 mas alerta 2,88 → bom (a régua é o alerta, não a meta)", () => {
    // Usar a meta como corte jogaria em "médio" quem errou por 2%. A meta é o alvo; o alerta é o aviso.
    const v = statusPorResultado({ ...base, gasto7d: 181, conv7d: 88, cplAlerta: 2.88, cplCritico: 4.12 });
    expect(v.status).toBe("good");
  });
});

describe("status pelo resultado — os limites da regra", () => {
  it("gastou e não converteu nada → em risco, sem CPL", () => {
    const v = statusPorResultado({ ...base, gasto7d: 300, conv7d: 0, cplAlerta: 10, cplCritico: 15 });
    expect(v.status).toBe("at_risk");
    expect(v.cpl).toBeNull();
  });

  it("volume abaixo do mínimo combinado → em risco mesmo com CPL bom", () => {
    const v = statusPorResultado({ ...base, gasto7d: 20, conv7d: 2, cplAlerta: 15, cplCritico: 25, convMin: 8 });
    expect(v.status).toBe("at_risk");
    expect(v.motivo).toMatch(/mínimo combinado/);
  });

  it("sem conta de anúncio → null: não julga quem não tem anúncio", () => {
    // Cliente só de social não pode ter status por resultado de anúncio — não existe o dado.
    const v = statusPorResultado({ ...base, temConta: false, gasto7d: 0, conv7d: 0, cplAlerta: null, cplCritico: null });
    expect(v.status).toBeNull();
  });

  it("com gasto mas sem política → null, e diz o CPL para quem for definir a meta", () => {
    const v = statusPorResultado({ ...base, gasto7d: 100, conv7d: 10, cplAlerta: null, cplCritico: null });
    expect(v.status).toBeNull();
    expect(v.motivo).toMatch(/não tem meta definida/);
  });
});

describe("saída do onboarding", () => {
  const semVeredito = { status: null, motivo: "", cpl: null };
  it("passou dos 30 dias → sai, mesmo sem resultado de anúncio", () => {
    expect(saiDeOnboarding(DIAS_ONBOARDING + 1, semVeredito)).toBe(true);
    expect(saiDeOnboarding(146, semVeredito)).toBe(true); // Atlas
  });
  it("tem resultado de anúncio para julgar → sai, mesmo novo", () => {
    expect(saiDeOnboarding(5, { status: "good", motivo: "", cpl: 3 })).toBe(true);
  });
  it("novo e sem dado → fica", () => {
    expect(saiDeOnboarding(5, semVeredito)).toBe(false); // JP barbearia, Celmapel
  });
});
