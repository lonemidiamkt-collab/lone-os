// tests/relatorio-cliente.test.ts — o relatório do cliente (semanal e mensal), com as respostas da
// Meta no formato real (tests/fixtures/relatorio-cliente.ts).
//
// O ponto de partida foi o PDF do Horto Naenc de 14–20/09/2026 que o Roberto mandou: gênero
// "Homens 0.0% · Mulheres 100.0%" numa rosca toda cinza, faixa 18-24 sumida, "Conjunto com melhor
// resultado" sem nome, eixo 3/5/8 com curva suavizada e nenhuma comparação com a semana anterior.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  lerPublico, leituraDoPublico, montarRelatorio, resumirPeriodo, tipoDoRelatorio, melhorConjunto, topCriativos,
  ticksRedondos, janelaDoRelatorio, janelaDosUltimosDias, janelaAnterior, vocabulario, fraseDoPeriodo,
  type LinhaCampanhaDia,
} from "@/lib/reports/relatorioCliente";
import { relatorioClienteHtml } from "@/lib/reports/relatorioClientePdf";
import { lerRelatorioAnuncios } from "@/lib/reports/relatorioClienteDados";
import { fetchAccountDemographics, fetchCampaignInsights } from "@/lib/meta/insights-server";
import {
  HORTO_SEMANA, HORTO_SEMANA_ANTERIOR, HORTO_CONJUNTOS, HORTO_ANUNCIOS, HORTO_DEMOGRAFIA, DEMOGRAFIA_MISTA,
  HORTO_IG, acoesDeMensagem,
} from "./fixtures/relatorio-cliente";

const SEMANA = janelaDoRelatorio("2026-09-14", "2026-09-20");
/** formatarBRL usa espaço não separável entre "R$" e o número (não quebra linha no PDF). */
const sp = (s: string | null | undefined) => (s ?? "").replace(/\u00a0/g, " ");

function relatorioHorto(extra: Partial<Parameters<typeof montarRelatorio>[0]> = {}) {
  return montarRelatorio({
    janela: SEMANA,
    anterior: { janela: janelaAnterior(SEMANA), linhas: HORTO_SEMANA_ANTERIOR, alcance: 12410 },
    linhas: HORTO_SEMANA,
    alcance: 13696,
    conjuntos: HORTO_CONJUNTOS,
    anuncios: HORTO_ANUNCIOS,
    demografia: HORTO_DEMOGRAFIA,
    ...extra,
  });
}

// ── Público ──────────────────────────────────────────────────────────────────

describe("público (gênero e idade) — linhas no formato da Meta", () => {
  it("Horto 14–20/09: só mulheres de 25+ é DADO, não erro de leitura — e as faixas batem 100%", () => {
    const p = lerPublico(HORTO_DEMOGRAFIA)!;
    expect(p.base).toBe("alcance");
    expect(p.genero).toEqual({ mulheres: 100, homens: 0 });
    // Os mesmos percentuais do PDF real (11,7 / 24,8 / 28,1 / 22,4 / 13,0)...
    const pct = Object.fromEntries(p.idades.map((i) => [i.faixa, i.pct]));
    expect(pct).toMatchObject({ "25-34": 11.7, "35-44": 24.8, "45-54": 28.1, "55-64": 22.4, "65+": 13 });
    // ...e a faixa sem ninguém aparece com 0% em vez de sumir (o "18-24 missing" do relatório).
    expect(pct["18-24"]).toBe(0);
    expect(p.idades.map((i) => i.faixa)).toEqual(["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]);
    expect(p.idades.reduce((s, i) => s + i.pct, 0)).toBeCloseTo(100, 0);
  });

  it("a linha 'Unknown' (com maiúscula, como a Meta manda) não vira faixa nem entra no denominador", () => {
    const p = lerPublico(DEMOGRAFIA_MISTA)!;
    expect(p.idades.map((i) => i.faixa)).not.toContain("Unknown");
    expect(p.idades.reduce((s, i) => s + i.pct, 0)).toBeCloseTo(100, 0);
  });

  it("13-17 aparece quando a Meta devolve, na ordem de idade (primeiro)", () => {
    const p = lerPublico(DEMOGRAFIA_MISTA)!;
    expect(p.idades[0].faixa).toBe("13-17");
    expect(p.idades[p.idades.length - 1].faixa).toBe("65+");
  });

  it("gênero só com masculino e feminino (unknown fica de fora) e soma exatamente 100", () => {
    const p = lerPublico(DEMOGRAFIA_MISTA)!;
    // female 4400, male 4080 (unknown 325 fora)
    expect(p.genero!.mulheres).toBeCloseTo((4400 / 8480) * 100, 1);
    expect(p.genero!.mulheres + p.genero!.homens).toBe(100);
  });

  it("sem gênero conhecido NÃO inventa 50/50: genero = null", () => {
    const p = lerPublico([
      { age: "25-34", gender: "unknown", reach: "300", impressions: "400" },
      { age: "35-44", gender: "unknown", reach: "100", impressions: "150" },
    ])!;
    expect(p.genero).toBeNull();
    expect(p.idades.find((i) => i.faixa === "25-34")!.pct).toBe(75);
  });

  it("sem alcance nas linhas, cai para impressões", () => {
    const p = lerPublico([
      { age: "25-34", gender: "female", impressions: "300" },
      { age: "25-34", gender: "male", impressions: "100" },
    ])!;
    expect(p.base).toBe("impressoes");
    expect(p.genero).toEqual({ mulheres: 75, homens: 25 });
  });

  it("sem linha nenhuma: null (o PDF omite a seção)", () => {
    expect(lerPublico([])).toBeNull();
  });

  it("a leitura em uma frase diz o que o gráfico mostra", () => {
    expect(leituraDoPublico(lerPublico(HORTO_DEMOGRAFIA))).toBe("Seus anúncios foram vistos só por mulheres — a maior parte de 45 a 54 anos (28%).");
    expect(leituraDoPublico(lerPublico(DEMOGRAFIA_MISTA))).toMatch(/^Quem mais viu seus anúncios: homens e mulheres de 25 a 34 anos \(\d+%\)\.$/);
  });
});

describe("fetchAccountDemographics (aba Anúncios) usa a mesma leitura", () => {
  afterEach(() => vi.restoreAllMocks());
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

  it("segue paging.next e não inventa 50/50", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(ok({ data: HORTO_DEMOGRAFIA.slice(0, 3), paging: { next: "https://graph.facebook.com/next" } }))
      .mockResolvedValueOnce(ok({ data: HORTO_DEMOGRAFIA.slice(3) }));
    global.fetch = f;
    const d = await fetchAccountDemographics("tk", "act_1", 7);
    expect(f).toHaveBeenCalledTimes(2);
    expect(d!.genderSplit).toEqual({ women: 100, men: 0 });
    expect(d!.ageRanges.map((a) => a.range)).toContain("18-24");
    expect(d!.ageRanges.map((a) => a.range)).not.toContain("Unknown");

    global.fetch = vi.fn().mockResolvedValueOnce(ok({ data: [{ age: "25-34", gender: "unknown", reach: "10" }] }));
    expect((await fetchAccountDemographics("tk", "act_1", 7))!.genderSplit).toBeNull();
  });
});

// ── Conjunto campeão (a causa do card sem nome) ──────────────────────────────

describe("conjunto com melhor resultado", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a leitura por conjunto NÃO pede effective_status (a Meta recusava a chamada inteira) e o nome volta", async () => {
    const urls: string[] = [];
    global.fetch = vi.fn(async (u: string | URL | Request) => {
      const url = String(u);
      urls.push(url);
      const q = new URL(url).searchParams;
      const resp = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
      if (url.includes("/campaigns?")) return resp({ data: [{ id: "c1", name: "ENGAJAMENTO - MENSAGEM - F", objective: "OUTCOME_ENGAGEMENT", status: "ACTIVE" }] });
      if (q.get("level") === "adset") {
        // O que a Meta faz com campo inexistente no /insights: 400, code 100.
        if ((q.get("fields") ?? "").includes("effective_status")) {
          return { ok: false, status: 400, json: async () => ({ error: { code: 100, message: "(#100) effective_status is not valid for fields param." } }) } as Response;
        }
        return resp({ data: HORTO_CONJUNTOS.slice(0, 2) });
      }
      if (q.get("time_increment") === "1") return resp({ data: [] });
      return resp({ data: [{ spend: "144.15", impressions: "12320", reach: "9000", clicks: "700", inline_link_clicks: "669", actions: acoesDeMensagem(27, 669) }] });
    }) as typeof fetch;

    const [camp] = await fetchCampaignInsights("tk", "act_1", 7);
    const adsetUrl = urls.find((u) => new URL(u).searchParams.get("level") === "adset")!;
    expect(new URL(adsetUrl).searchParams.get("fields")).not.toContain("effective_status");
    expect(camp.cheapestAdSetName).toBe("Público quente | engajou nos últimos 90 dias");
    expect(camp.cheapestAdSetCostPerMessage).toBeCloseTo(4.65, 2);
  });

  it("no relatório: o mais barato com volume, com nome e campanha", () => {
    const c = melhorConjunto(HORTO_CONJUNTOS, "mensagens")!;
    expect(c.nome).toBe("Público quente | engajou nos últimos 90 dias");
    expect(c.campanha).toBe("ENGAJAMENTO - MENSAGEM - F");
    expect(c.custo).toBeCloseTo(4.65, 2);
    expect(c.resultados).toBe(7);
  });

  it("com um conjunto só na disputa, não existe 'o melhor' — null", () => {
    expect(melhorConjunto(HORTO_CONJUNTOS.slice(0, 1), "mensagens")).toBeNull();
  });

  it("R$ 1 com 1 conversa não ganha de conjunto com volume", () => {
    const c = melhorConjunto([
      ...HORTO_CONJUNTOS,
      { adset_id: "x", adset_name: "Teste relâmpago", campaign_name: "X", objective: "OUTCOME_ENGAGEMENT", spend: "1.00", actions: acoesDeMensagem(1, 3) },
    ], "mensagens")!;
    expect(c.nome).not.toBe("Teste relâmpago");
  });
});

describe("criativos em destaque", () => {
  it("os que mais trouxeram conversa, com custo; boost sem conversa fica de fora", () => {
    const top = topCriativos(HORTO_ANUNCIOS, "mensagens");
    expect(top.map((c) => c.nome)).toEqual(["Vídeo | Tour pelo horto", "Foto | As orquídeas chegaram", "Reels | 3 erros com suculentas"]);
    expect(top[0].custo).toBeCloseTo(70.2 / 14, 4);
  });
});

// ── Período, comparação e resultado pelo objetivo ────────────────────────────

describe("período × período anterior", () => {
  it("Horto: 38 conversas contra 34, custo só das campanhas que trouxeram conversa", () => {
    const r = relatorioHorto();
    expect(r.tipo).toBe("mensagens");
    expect(r.palavras.Varios).toBe("Conversas");
    const k = Object.fromEntries(r.kpis.map((x) => [x.chave, x]));
    expect(k.resultados.valor).toBe(38);
    expect(k.resultados.anterior).toBe(34);
    expect(k.resultados.tom).toBe("bom");
    expect(k.investimento.valor).toBeCloseTo(252.45, 2);
    expect(k.investimento.tom).toBe("neutro"); // investimento não é bom nem ruim
    // 199,95 = 252,45 − 52,50 do impulsionamento que não traz conversa
    expect(k.custo.valor).toBeCloseTo(199.95 / 38, 4);
    expect(sp(k.custo.nota)).toContain("R$ 199,95");
    expect(k.custo.tom).toBe("bom"); // custo caiu: bom (natureza inversa)
    expect(k.alcance.valor).toBe(13696);
  });

  it("série diária alinhada dia a dia com a semana anterior; melhor dia = ter 15", () => {
    const r = relatorioHorto();
    expect(r.serie.map((p) => p.atual)).toEqual([4, 8, 5, 5, 6, 3, 7]);
    expect(r.serie.map((p) => p.anterior)).toEqual([3, 6, 6, 6, 4, 5, 4]);
    expect(r.melhorDia).toEqual({ dia: "2026-09-15", valor: 8 });
  });

  it("anterior que não pôde ser lido: relatório sai, sem variação", () => {
    const r = relatorioHorto({ anterior: null });
    expect(r.kpis.every((k) => k.variacaoPct === null)).toBe(true);
    expect(r.serie.every((p) => p.anterior === null)).toBe(true);
    expect(sp(r.frase)).toBe("Na última semana, seus anúncios trouxeram 38 conversas, a R$ 5,26 cada.");
  });

  it("anterior sem veiculação não é base (0 → 38 não é +∞%)", () => {
    const r = relatorioHorto({ anterior: { janela: janelaAnterior(SEMANA), linhas: [], alcance: null } });
    expect(r.totalAnterior).toBeNull();
    expect(r.kpis[0].variacaoPct).toBeNull();
  });

  it("campanha de cadastro conta LEADS e o relatório fala 'leads'", () => {
    const leads: LinhaCampanhaDia[] = [
      { campaign_id: "9", campaign_name: "CADASTRO", objective: "OUTCOME_LEADS", date_start: "2026-09-14", spend: "50", impressions: "1000", inline_link_clicks: "30",
        actions: [{ action_type: "lead", value: "6" }, { action_type: "onsite_conversion.lead_grouped", value: "6" }, { action_type: "link_click", value: "30" }] },
    ];
    const r = montarRelatorio({ janela: SEMANA, anterior: null, linhas: leads, alcance: 800 });
    expect(r.tipo).toBe("leads");
    expect(r.total).toBe(6); // lead + lead_grouped NÃO somam
    expect(r.palavras.custo).toBe("Custo por lead");
    expect(r.frase).toContain("6 leads");
  });

  it("sem resultado nenhum no período, o rótulo vem do anterior (e do objetivo)", () => {
    const atual = resumirPeriodo([]);
    expect(tipoDoRelatorio(atual, resumirPeriodo(HORTO_SEMANA_ANTERIOR))).toBe("mensagens");
  });

  it("semana sem veiculação: a frase diz isso, sem números inventados", () => {
    const r = montarRelatorio({ janela: SEMANA, anterior: { janela: janelaAnterior(SEMANA), linhas: HORTO_SEMANA_ANTERIOR, alcance: 1 }, linhas: [], alcance: null });
    expect(r.semVeiculacao).toBe(true);
    expect(r.frase).toBe("Na última semana, os anúncios não rodaram.");
  });
});

describe("a frase da semana", () => {
  it("resultado, variação e custo", () => {
    expect(relatorioHorto().frase).toBe("Na última semana, seus anúncios trouxeram 38 conversas, 12% a mais que na semana anterior — e cada conversa saiu 9% mais barata.");
  });

  it("mês fechado compara com o mês anterior pelo nome", () => {
    const ago = janelaDoRelatorio("2026-08-01", "2026-08-31");
    const v = vocabulario(ago, janelaAnterior(ago));
    expect(v.abertura).toBe("Em agosto");
    expect(v.referenciaAnterior).toBe("em julho");
    expect(v.titulo).toBe("Relatório mensal");
    const r = relatorioHorto({ janela: ago, anterior: { janela: janelaAnterior(ago), linhas: HORTO_SEMANA_ANTERIOR, alcance: null } });
    expect(fraseDoPeriodo(r)).toMatch(/^Em agosto, seus anúncios trouxeram 38 conversas, 12% a mais que em julho/);
  });
});

// ── Eixo e janelas ───────────────────────────────────────────────────────────

describe("eixo do gráfico: do zero, passo redondo", () => {
  it("o caso do PDF (pico 8) deixa de ser 3/5/8", () => {
    expect(ticksRedondos(8)).toEqual([0, 2, 4, 6, 8]);
  });
  it("outros tamanhos", () => {
    expect(ticksRedondos(7)).toEqual([0, 2, 4, 6, 8]);
    expect(ticksRedondos(3)).toEqual([0, 1, 2, 3]);
    expect(ticksRedondos(1)).toEqual([0, 1]);
    expect(ticksRedondos(0)).toEqual([0, 1]);
    expect(ticksRedondos(45)).toEqual([0, 20, 40, 60]);
    expect(ticksRedondos(1234)).toEqual([0, 500, 1000, 1500]);
  });
  it("contagem nunca tem meio (passo 2,5 só para valores fracionários)", () => {
    expect(ticksRedondos(10).every(Number.isInteger)).toBe(true);
  });
});

describe("janelas", () => {
  it("semanal de segunda: os 7 dias que terminam ontem, e a semana antes deles", () => {
    const j = janelaDosUltimosDias(7, "2026-09-21");
    expect([j.inicio, j.fim, j.tipo]).toEqual(["2026-09-14", "2026-09-20", "semana"]);
    expect(j.rotulo).toBe("14 a 20 set 2026");
    const a = janelaAnterior(j);
    expect([a.inicio, a.fim]).toEqual(["2026-09-07", "2026-09-13"]);
  });
  it("mês fechado compara com o mês anterior INTEIRO (março × fevereiro de 28 dias)", () => {
    const mar = janelaDoRelatorio("2026-03-01", "2026-03-31");
    expect(mar.tipo).toBe("mes");
    expect(mar.rotulo).toBe("março de 2026");
    const fev = janelaAnterior(mar);
    expect([fev.inicio, fev.fim, fev.dias]).toEqual(["2026-02-01", "2026-02-28", 28]);
  });
  it("mês × mês mais curto: os dias que sobram ficam sem par (null), não zero", () => {
    const mar = janelaDoRelatorio("2026-03-01", "2026-03-31");
    const linhas = (ini: string, n: number): LinhaCampanhaDia[] => Array.from({ length: n }, (_, i) => {
      const d = new Date(`${ini}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i);
      return { campaign_id: "1", objective: "OUTCOME_ENGAGEMENT", date_start: d.toISOString().slice(0, 10), spend: "10", actions: acoesDeMensagem(1, 1) };
    });
    const r = montarRelatorio({ janela: mar, anterior: { janela: janelaAnterior(mar), linhas: linhas("2026-02-01", 28), alcance: null }, linhas: linhas("2026-03-01", 31), alcance: null });
    expect(r.serie[27].anterior).toBe(1);
    expect(r.serie[28].anterior).toBeNull();
    expect(r.serie[30].anterior).toBeNull();
  });
  it("virada de mês e de ano no rótulo", () => {
    expect(janelaDoRelatorio("2026-09-28", "2026-10-04").rotulo).toBe("28 set a 4 out 2026");
    expect(janelaDoRelatorio("2025-12-29", "2026-01-04").rotulo).toBe("29 dez 2025 a 4 jan 2026");
  });
});

// ── O HTML ───────────────────────────────────────────────────────────────────

describe("HTML do PDF", () => {
  const base = { clienteNome: "Veneza Estofados & Cia <Matriz>", logo: "", geradoEm: "2026-09-21", janela: SEMANA };

  it("escapa o nome, fala 'conversas', mostra 18-24 com 0% e a semana anterior", () => {
    const html = relatorioClienteHtml({ ...base, anuncios: relatorioHorto() });
    expect(html).toContain("Veneza Estofados &amp; Cia &lt;Matriz&gt;");
    expect(html).not.toContain("Mensagens");
    expect(html).not.toContain("msgs");
    expect(html).toContain("Conversas por dia");
    expect(html).toContain("Semana anterior · 34");
    expect(html).toContain("Público quente | engajou nos últimos 90 dias");
    expect(html).toMatch(/18-24<\/span>[\s\S]*?0%/);
    expect(html).not.toMatch(/NaN|undefined|Infinity/);
    // nada interno: sem nome do gestor, sem custo da agência
    expect(html).not.toMatch(/fee|mensalidade|gestor/i);
  });

  it("uma folha só de anúncios; com Instagram, a segunda folha é do Instagram", () => {
    const so = relatorioClienteHtml({ ...base, anuncios: relatorioHorto() });
    expect(so.match(/class="folha"/g)).toHaveLength(1);
    const com = relatorioClienteHtml({ ...base, anuncios: relatorioHorto(), instagram: HORTO_IG });
    expect(com.match(/class="folha"/g)).toHaveLength(2);
    expect(com).toContain("@hortonaencplantas");
    expect(com).toContain("1/2");
  });

  it("cliente só de Instagram: o nome do cliente é o título", () => {
    const html = relatorioClienteHtml({ ...base, clienteNome: "CIIL", anuncios: null, instagram: HORTO_IG });
    expect(html).toContain("<h1>CIIL</h1>");
    expect(html.match(/class="folha"/g)).toHaveLength(1);
  });

  it("alcance que a Meta não devolveu some do PDF (não vira '—')", () => {
    const html = relatorioClienteHtml({ ...base, anuncios: relatorioHorto({ alcance: null }) });
    expect(html).not.toContain(`<div class="rotulo">Pessoas alcançadas</div>`);
    expect(relatorioClienteHtml({ ...base, anuncios: relatorioHorto() })).toContain(`<div class="rotulo">Pessoas alcançadas</div>`);
  });

  it("leitura por anúncio que falhou (ou veio vazia com 38 conversas): omite o cartão em vez de afirmar 'nenhum anúncio trouxe'", () => {
    for (const anuncios of [null, []]) {
      const html = relatorioClienteHtml({ ...base, anuncios: relatorioHorto({ anuncios }) });
      expect(html).not.toContain("Nenhum anúncio registrou");
      expect(html).not.toContain("Anúncios que mais trouxeram");
    }
  });
});

// ── Leitura do servidor com a Meta simulada ──────────────────────────────────

describe("lerRelatorioAnuncios — chamadas à Meta", () => {
  afterEach(() => vi.restoreAllMocks());

  it("monta o relatório com ~8 leituras pela conta e embute a miniatura", async () => {
    const resp = (body: unknown) => ({ ok: true, status: 200, json: async () => body, headers: new Headers({ "content-type": "application/json" }) }) as unknown as Response;
    const f = vi.fn(async (u: string | URL | Request) => {
      const url = new URL(String(u));
      const q = url.searchParams;
      if (url.hostname === "cdn.meta.test") {
        return { ok: true, status: 200, headers: new Headers({ "content-type": "image/jpeg" }), arrayBuffer: async () => new Uint8Array([255, 216, 255, 224]).buffer } as unknown as Response;
      }
      if ((q.get("fields") ?? "").startsWith("creative.")) return resp({ creative: { thumbnail_url: `https://cdn.meta.test/${url.pathname.split("/").pop()}.jpg` } });
      const desde = JSON.parse(q.get("time_range") ?? "{}").since;
      if (q.get("breakdowns") === "age,gender") return resp({ data: HORTO_DEMOGRAFIA });
      if (q.get("level") === "campaign") return resp({ data: desde === "2026-09-14" ? HORTO_SEMANA : HORTO_SEMANA_ANTERIOR });
      if (q.get("level") === "adset") return resp({ data: HORTO_CONJUNTOS });
      if (q.get("level") === "ad") return resp({ data: HORTO_ANUNCIOS });
      if (q.get("fields") === "reach") return resp({ data: [{ reach: desde === "2026-09-14" ? "13696" : "12410" }] });
      throw new Error(`chamada inesperada: ${url}`);
    });
    global.fetch = f as unknown as typeof fetch;

    const r = (await lerRelatorioAnuncios("tk", "act_1", SEMANA))!;
    expect(r.total).toBe(38);
    expect(r.totalAnterior).toBe(34);
    expect(r.kpis.find((k) => k.chave === "alcance")!.variacaoPct).toBeCloseTo(((13696 - 12410) / 12410) * 100, 3);
    expect(r.publico!.genero).toEqual({ mulheres: 100, homens: 0 });
    expect(r.conjunto!.nome).toBe("Público quente | engajou nos últimos 90 dias");
    expect(r.criativos[0].miniatura).toMatch(/^data:image\/jpeg;base64,/);
    // 7 leituras + 3 miniaturas (Graph) + 3 imagens — nada por campanha
    expect(f.mock.calls.length).toBe(13);
    // Toda leitura de resultado com a atribuição do Gerenciador
    for (const [u] of f.mock.calls) {
      const q = new URL(String(u)).searchParams;
      if (q.get("level")) expect(q.get("action_attribution_windows")).toBe('["7d_click"]');
    }
  });

  it("período atual ilegível: lança (o PDF não sai pela metade)", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 190, message: "token" } }) }) as Response) as unknown as typeof fetch;
    await expect(lerRelatorioAnuncios("tk", "act_1", SEMANA)).rejects.toThrow(/190/);
  });
});
