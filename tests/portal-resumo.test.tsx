// tests/portal-resumo.test.tsx — Visão geral do Painel de Resultados no desenho do protótipo
// (lib/portal/resumo.ts + PortalResumo). 19/11/2026.
// A frase só fala do canal que tem resultado; canal que falhou diz "atualizando" e o que o cliente não tem
// diz "ainda não ativo" — nunca zero.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { comSinal, destaqueDoResumo, leituraDoPeriodo, numerosDoInstagram, textoDaFrase } from "@/lib/portal/resumo";
import type { SnapshotData } from "@/lib/portal/types";

describe("frase de destaque", () => {
  it("anúncios na frente, com a variação; o resto vai para o apoio", () => {
    const d = destaqueDoResumo({
      periodo: "7d",
      anuncios: { resultados: 417, variacaoPct: 22, custo: 4.58, variacaoCustoPct: -13, tipo: "mensagens" },
      googlePerfil: { contatos: 38 },
      instagram: { saldoSeguidores: 56 },
    })!;
    expect(textoDaFrase(d.partes)).toBe("Os anúncios trouxeram 417 conversas, 22% acima da semana anterior.");
    expect(d.partes).toContainEqual({ texto: "417 conversas", tom: "numero" });
    expect(d.partes).toContainEqual({ texto: "22% acima", tom: "bom" });
    expect(d.nota).toEqual([
      "O custo médio foi de R$\u00a04,58 por conversa (−13%).",
      "No Instagram, o saldo foi de +56 seguidores.",
      "Pelo Google, 38 contatos pelo seu perfil.",
    ]);
  });

  it("queda em âmbar; diferença pequena é 'parecido'; sem comparação termina no número", () => {
    const base = { periodo: "14d" as const };
    const cai = destaqueDoResumo({ ...base, anuncios: { resultados: 1200, variacaoPct: -8, tipo: "leads" } })!;
    expect(textoDaFrase(cai.partes)).toBe("Os anúncios trouxeram 1.200 leads, 8% abaixo das 2 semanas anteriores.");
    expect(cai.partes).toContainEqual({ texto: "8% abaixo", tom: "atencao" });
    expect(textoDaFrase(destaqueDoResumo({ ...base, anuncios: { resultados: 10, variacaoPct: 3 } })!.partes))
      .toBe("Os anúncios trouxeram 10 conversas, parecido com as 2 semanas anteriores.");
    expect(textoDaFrase(destaqueDoResumo({ ...base, anuncios: { resultados: 1, variacaoPct: null } })!.partes))
      .toBe("Os anúncios trouxeram 1 conversa.");
  });

  it("canal zerado, sem dado ou com saldo negativo fica de fora da frase e do apoio", () => {
    const d = destaqueDoResumo({
      periodo: "7d", anuncios: { resultados: 50 }, googlePerfil: { contatos: 0 }, googleAnuncios: { cliques: null }, instagram: { saldoSeguidores: -4 },
    })!;
    expect(d.nota).toEqual([]);
  });

  it("sem anúncios: o perfil no Google; sem ele, o Instagram; sem nada, nenhuma frase", () => {
    expect(textoDaFrase(destaqueDoResumo({ periodo: "7d", anuncios: null, googlePerfil: { contatos: 38, variacaoPct: 12 }, googleAnuncios: { cliques: 5 } })!.partes))
      .toBe("Seu perfil no Google gerou 38 contatos, 12% acima da semana anterior.");
    expect(textoDaFrase(destaqueDoResumo({ periodo: "7d", instagram: { saldoSeguidores: 56 } })!.partes))
      .toBe("O Instagram ganhou 56 seguidores nos últimos 7 dias.");
    expect(destaqueDoResumo({ periodo: "7d", anuncios: { resultados: 0 }, instagram: null })).toBeNull();
    expect(destaqueDoResumo({ periodo: "7d" })).toBeNull();
  });
});

describe("leitura do período", () => {
  it("sai só dos números: volume × custo", () => {
    expect(leituraDoPeriodo(22, -13)).toBe("O volume de conversas subiu enquanto o custo por conversa caiu.");
    expect(leituraDoPeriodo(22, 18, "leads")).toBe("Vieram mais leads, com o custo por lead mais alto.");
    expect(leituraDoPeriodo(-20, 15)).toBe("Vieram menos conversas e o custo por conversa subiu.");
    expect(leituraDoPeriodo(2, -3)).toBe("O período ficou parecido com o anterior, em conversas e em custo por conversa.");
  });

  it("sem comparação não inventa leitura", () => {
    expect(leituraDoPeriodo(null, -13)).toBeNull();
    expect(leituraDoPeriodo(22, undefined)).toBeNull();
  });
});

describe("números do Instagram", () => {
  it("saldo = entraram − saíram, como na área do Instagram", () => {
    expect(numerosDoInstagram({
      conta: { seguidores: 19055 }, resumo: { alcance: 100, seguidoresGanhos: 90, postsNoPeriodo: 5 },
      metricas: { atual: { alcance: 20170, entraram: 90, sairam: 34 }, anterior: { alcance: 22900 } },
    })).toEqual({ seguidores: 19055, saldo: 56, entraram: 90, sairam: 34, alcance: 20170, alcanceAnterior: 22900, posts: 5 });
  });

  it("sem entraram/saíram usa os novos; perfil lido por fora não tem saldo nem alcance", () => {
    expect(numerosDoInstagram({ conta: { seguidores: 10 }, resumo: { alcance: 5, seguidoresGanhos: 3 } })?.saldo).toBe(3);
    const publico = numerosDoInstagram({ conta: { seguidores: 10 }, resumo: { alcance: 5, seguidoresGanhos: 3 }, fonte: "publico" });
    expect(publico).toMatchObject({ seguidores: 10, saldo: null, alcance: null });
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
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

const kpi = (value: number, delta_pct = 22) => ({ value, delta_pct, direction: "up" as const });
const snap = {
  ads_status: "ok", result_kind: "mensagens",
  period: { kind: "last_week", start: "2026-11-12", end: "2026-11-18", label: "7 dias", previous_start: "2026-11-05", previous_end: "2026-11-11" },
  kpis: { messages: kpi(417), spend: kpi(1909.69, 5.8), cpa: kpi(4.58, -13), reach: kpi(61353, 15) },
  chart: { days: ["2026-11-17", "2026-11-18"], series: { messages: [200, 217], clicks: [1, 2], spend: [900, 1009.69], reach: [1, 2] }, previous_messages: [170, 172], peak: null },
  top_creatives: [{ id: "1", name: "Vídeo Acabamos de receber", thumbnail_url: null, thumbnail_path: null, messages: 55, spend: 200.83, cpa: 3.65, ctr: 1, frequency: 1, is_winner: true }],
  demographics: { gender: null, age_ranges: [] }, agency_actions: [], generated_at: "2026-11-19T09:00:00Z",
} as unknown as SnapshotData;
const igInicial = { conta: { seguidores: 19055 }, resumo: { alcance: 20170, seguidoresGanhos: 90, postsNoPeriodo: 5 }, metricas: { atual: { alcance: 20170, entraram: 90, sairam: 34 }, anterior: null } };

const base = { token: "t", clientId: "c", periodo: "7d" as const, temAnuncios: true, temGoogleAds: true, temGoogleMaps: true, temInstagram: true, onAbrir: () => {} };
const canal = (nome: string) => within(screen.getByRole("button", { name: `${nome}: abrir a área` }));

describe("tela da Visão geral", () => {
  it("as cinco seções do protótipo, com os números de cada canal", async () => {
    chamar.mockImplementation(async (url: string) => url.includes("/google")
      ? { ok: true, status: 200, data: { perfil: { kpis: [{ chave: "acoes", valor: 38, variacaoPct: -9 }] }, ads: { kpis: [{ chave: "cliques", valor: 0, variacaoPct: null }], semVeiculacao: true } } }
      : { ok: true, status: 200, data: { items: [{ entregueEm: new Date().toISOString() }, { entregueEm: new Date().toISOString() }] } });
    render(<PortalResumo {...base} anuncios={{ dados: snap, carregando: false, falhou: false }} igInicial={igInicial} />);

    expect(await screen.findByLabelText("Os anúncios trouxeram 417 conversas, 22% acima da semana anterior.")).toBeInTheDocument();
    for (const t of ["Os números mais importantes", "Evolução e origem dos resultados", "Resultados por canal", "Crescimento e execução"]) {
      expect(screen.getByRole("heading", { name: t })).toBeInTheDocument();
    }
    expect(screen.getByText("Criativo de destaque")).toBeInTheDocument();
    expect(screen.getByText("Vídeo Acabamos de receber")).toBeInTheDocument();
    expect(screen.getByText("7 dias · antes: 342")).toBeInTheDocument(); // soma real do período anterior
    expect(screen.getByText("90 entraram − 34 saíram")).toBeInTheDocument();

    expect(canal("Meta Ads").getByText("417")).toBeInTheDocument();
    expect(canal("Meta Ads").getByText("Com dados")).toBeInTheDocument();
    expect(await canal("Google Maps").findByText("38")).toBeInTheDocument();
    expect(canal("Google Ads").getByText("Sem veiculação")).toBeInTheDocument();
    expect(canal("Instagram").getByText("20.170")).toBeInTheDocument();

    expect(screen.getByText("Google Ads · sem veiculação")).toBeInTheDocument(); // selo no resumo
    expect(screen.getByText("O volume de conversas subiu enquanto o custo por conversa caiu.")).toBeInTheDocument();
    expect(await screen.findByText("artes entregues")).toBeInTheDocument();
  });

  it("canal que falhou diz 'atualizando'; canal que o cliente não tem diz 'ainda não ativo' — nenhum vira zero", async () => {
    chamar.mockImplementation(async () => ({ ok: false, status: 503 }));
    render(<PortalResumo {...base} temInstagram={false} anuncios={{ dados: snap, carregando: false, falhou: false }} />);

    expect(await canal("Google Maps").findByText("Atualizando")).toBeInTheDocument();
    expect(canal("Google Maps").queryByText("0")).toBeNull();
    expect(canal("Instagram").getByText("Ainda não ativo")).toBeInTheDocument();
    expect(canal("Instagram").getByText("toque para ver como ativar")).toBeInTheDocument();
    // A frase segue com o que foi lido (anúncios), sem citar Google nem Instagram.
    expect(screen.getByLabelText("Os anúncios trouxeram 417 conversas, 22% acima da semana anterior.")).toBeInTheDocument();
    expect(screen.queryByText(/Pelo Google/)).toBeNull();
  });

  it("anúncios que falharam: sem frase deles, sem número, e a evolução avisa", async () => {
    chamar.mockImplementation(async (url: string) => url.includes("/google")
      ? { ok: true, status: 200, data: { perfil: { kpis: [{ chave: "acoes", valor: 38, variacaoPct: 12 }] }, ads: null } }
      : { ok: false, status: 500 });
    render(<PortalResumo {...base} temGoogleAds={false} temInstagram={false} anuncios={{ dados: null, carregando: false, falhou: true }} />);
    expect(await screen.findByLabelText("Seu perfil no Google gerou 38 contatos, 12% acima da semana anterior.")).toBeInTheDocument();
    expect(canal("Meta Ads").getByText("Atualizando")).toBeInTheDocument();
    expect(screen.getByText("Estamos atualizando os números dos anúncios. Volte em alguns minutos.")).toBeInTheDocument();
    expect(screen.queryByText("Criativo de destaque")).toBeNull();
  });
});

describe("anúncios ativos na Visão geral", () => {
  const ativos = { items: [{ id: "a1", name: "Anúncio no ar", thumbnail_url: null, thumbnail_path: null, messages: 3, spend: 10, cpa: 3.33, clicks: 9 }], total: 3, with_messages: 1 };

  it("com anúncio no ar, o botão abre a lista sem sair da Visão geral", async () => {
    chamar.mockImplementation(async () => ({ ok: false, status: 500 }));
    render(<PortalResumo {...base} temGoogleAds={false} temGoogleMaps={false} temInstagram={false}
      anuncios={{ dados: { ...snap, active_ads: ativos } as SnapshotData, carregando: false, falhou: false }} />);
    const botao = screen.getByRole("button", { name: /Ver todos os anúncios ativos/ });
    expect(within(botao).getByText("3")).toBeInTheDocument();
    fireEvent.click(botao);
    expect(await screen.findByRole("dialog", { name: "Anúncios ativos" })).toBeInTheDocument();
  });

  it("sem anúncio no ar (ou sem a lista), o botão não aparece", () => {
    chamar.mockImplementation(async () => ({ ok: false, status: 500 }));
    render(<PortalResumo {...base} temGoogleAds={false} temGoogleMaps={false} temInstagram={false}
      anuncios={{ dados: { ...snap, active_ads: { items: [], total: 0, with_messages: 0 } } as SnapshotData, carregando: false, falhou: false }} />);
    expect(screen.queryByRole("button", { name: /Ver todos os anúncios ativos/ })).toBeNull();
  });
});
