// tests/portal-resumo.test.tsx — Visão geral do Painel de Resultados (lib/portal/resumo.ts + PortalResumo). 19/11/2026.
// A frase só fala do canal que tem resultado; canal que falhou diz "atualizando", nunca zero.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { comSinal, fraseDoResumo, numerosDoInstagram } from "@/lib/portal/resumo";
import type { SnapshotData } from "@/lib/portal/types";

describe("frase do resumo", () => {
  it("junta os canais que têm resultado", () => {
    expect(fraseDoResumo({
      periodo: "7d",
      anuncios: { resultados: 417, tipo: "mensagens" },
      googlePerfil: { contatos: 38 },
      instagram: { saldoSeguidores: 56 },
    })).toBe("Nos últimos 7 dias: 417 conversas pelos anúncios, 38 contatos pelo seu perfil no Google e 56 seguidores novos no Instagram.");
  });

  it("canal zerado, sem dado ou com saldo negativo fica de fora", () => {
    expect(fraseDoResumo({
      periodo: "14d",
      anuncios: { resultados: 1200, tipo: "leads" },
      googlePerfil: { contatos: 0 },
      googleAnuncios: { cliques: null },
      instagram: { saldoSeguidores: -4 },
    })).toBe("Nas últimas 2 semanas: 1.200 leads pelos anúncios.");
  });

  it("singular e dois canais", () => {
    expect(fraseDoResumo({ periodo: "7d", anuncios: { resultados: 1 }, googleAnuncios: { cliques: 1 } }))
      .toBe("Nos últimos 7 dias: 1 conversa pelos anúncios e 1 clique nos anúncios do Google.");
  });

  it("nenhum canal com resultado: sem frase", () => {
    expect(fraseDoResumo({ periodo: "7d", anuncios: { resultados: 0 }, instagram: null })).toBeNull();
    expect(fraseDoResumo({ periodo: "7d" })).toBeNull();
  });
});

describe("números do Instagram", () => {
  it("saldo = entraram − saíram, como na aba do Instagram", () => {
    expect(numerosDoInstagram({
      conta: { seguidores: 19055 }, resumo: { alcance: 100, seguidoresGanhos: 90 },
      metricas: { atual: { alcance: 20170, entraram: 90, sairam: 34 }, anterior: { alcance: 22900 } },
    })).toEqual({ seguidores: 19055, saldo: 56, alcance: 20170, alcanceAnterior: 22900 });
  });

  it("sem entraram/saíram usa os novos; perfil lido por fora não tem saldo nem alcance", () => {
    expect(numerosDoInstagram({ conta: { seguidores: 10 }, resumo: { alcance: 5, seguidoresGanhos: 3 } })?.saldo).toBe(3);
    expect(numerosDoInstagram({ conta: { seguidores: 10 }, resumo: { alcance: 5, seguidoresGanhos: 3 }, fonte: "publico" }))
      .toEqual({ seguidores: 10, saldo: null, alcance: null, alcanceAnterior: null });
    expect(numerosDoInstagram(null)).toBeNull();
  });

  it("sinal do saldo", () => {
    expect(comSinal(56)).toBe("+56");
    expect(comSinal(-1200)).toBe("−1.200");
    expect(comSinal(0)).toBe("0");
  });
});

// ── A tela ──
const chamar = vi.fn();
vi.mock("@/lib/api/chamar", () => ({ chamar: (...a: unknown[]) => chamar(...a) }));
const { default: PortalResumo } = await import("@/components/portal/PortalResumo");

beforeAll(() => {
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

const kpi = (value: number) => ({ value, delta_pct: 22, direction: "up" as const });
const snap = {
  ads_status: "ok", result_kind: "mensagens",
  period: { kind: "last_week", start: "2026-11-12", end: "2026-11-18", label: "7 dias", previous_start: "2026-11-05", previous_end: "2026-11-11" },
  kpis: { messages: kpi(417), spend: kpi(1909.69), cpa: kpi(4.58), reach: kpi(61353) },
  chart: { days: [], series: { messages: [], clicks: [], spend: [], reach: [] }, peak: null },
  top_creatives: [{ id: "1", name: "Vídeo Acabamos de receber", thumbnail_url: null, thumbnail_path: null, messages: 55, spend: 200.83, cpa: 3.65, ctr: 1, frequency: 1, is_winner: true }],
  demographics: { gender: null, age_ranges: [] }, agency_actions: [], generated_at: "2026-11-19T09:00:00Z",
} as unknown as SnapshotData;

const base = { token: "t", clientId: "c", periodo: "7d" as const, temAnuncios: true, temGoogle: true, temInstagram: true, temConteudo: false, onAbrir: () => {} };

describe("tela da Visão geral", () => {
  it("frase com os canais lidos; o Google que falhou diz 'atualizando' e não vira zero", async () => {
    chamar.mockImplementation(async (url: string) => (url.includes("/google") ? { ok: false, status: 503 } : { ok: false, status: 500 }));
    render(<PortalResumo {...base} anuncios={{ dados: snap, carregando: false, falhou: false }}
      igInicial={{ conta: { seguidores: 19055 }, metricas: { atual: { alcance: 20170, entraram: 90, sairam: 34 }, anterior: null } }} />);

    expect(await screen.findByText("Nos últimos 7 dias: 417 conversas pelos anúncios e 56 seguidores novos no Instagram.")).toBeInTheDocument();
    const google = within(await screen.findByRole("button", { name: /Google/ }));
    expect(await google.findByText(/Estamos atualizando/)).toBeInTheDocument();
    expect(google.queryByText("0")).toBeNull();

    const anuncios = within(screen.getByRole("button", { name: /^Anúncios/ }));
    expect(anuncios.getByText("417")).toBeInTheDocument();
    expect(anuncios.getByText("+22%")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /Instagram/ })).getByText("+56 no período")).toBeInTheDocument();
    expect(screen.getByText("Vídeo Acabamos de receber")).toBeInTheDocument();
  });

  it("anúncios que falharam não entram na frase nem mostram número", async () => {
    chamar.mockImplementation(async () => ({ ok: true, status: 200, data: { perfil: { kpis: [{ chave: "acoes", valor: 38, variacaoPct: 3 }] }, ads: null } }));
    render(<PortalResumo {...base} temInstagram={false} anuncios={{ dados: null, carregando: false, falhou: true }} />);
    expect(await screen.findByText("Nos últimos 7 dias: 38 contatos pelo seu perfil no Google.")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /^Anúncios/ })).getByText(/Estamos atualizando/)).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /Google/ })).getByText("estável")).toBeInTheDocument();
  });

  it("Instagram ainda não ligado (404): o cartão dele não aparece", async () => {
    chamar.mockImplementation(async (url: string) => (url.includes("/instagram") ? { ok: false, status: 404 } : { ok: false, status: 500 }));
    render(<PortalResumo {...base} temGoogle={false} anuncios={{ dados: snap, carregando: false, falhou: false }} />);
    await screen.findByText(/417 conversas pelos anúncios\./);
    expect(screen.queryByRole("button", { name: /Instagram/ })).toBeNull();
  });
});
