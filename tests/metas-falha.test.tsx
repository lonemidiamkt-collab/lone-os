// tests/metas-falha.test.tsx — 25/10/2026, auditoria de erro recuperável (7.1 a 7.5). Dados INVENTADOS.
//
// 7.1: o Enter salvava o campo vazio como 0, ignorava o "salvando" e criava linha em dobro; alvo 0 em meta "maior" nascia batida.
// 7.2: o fechamento do dia 1º gravava "não consegui ler X" como resultado oficial e alvo PADRÃO quando os alvos falhavam.
// 7.3: o fechamento por pessoa não conferia erro: posts fora do ar = todo cliente "Sem nenhum post" com o nome do social.
// 7.4: os indicadores ao vivo caíam em zeros: "Sem contato +15d: 0 de 0" em verde, "Contas no orçamento 0%".
// 7.5: erro ao ler o histórico virava "aplique a migration"; `painel.falhas` nunca aparecia.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextRequest } from "next/server";

type Linha = Record<string, unknown>;
const banco = vi.hoisted(() => ({
  dados: {} as Record<string, Linha[]>, falhas: new Map<string, string>(), upserts: [] as { tabela: string; linhas: Linha[] }[],
  rpc: { data: null as unknown, error: null as { message: string } | null },
  calculo: { valores: {} as Record<string, unknown>, falhas: [] as string[], chavesComFalha: [] as string[] },
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    rpc: async () => banco.rpc,
    from: (tabela: string) => {
      let acao = "select";
      let faixa: [number, number] | null = null;
      const q: Record<string, unknown> = {};
      for (const m of ["select", "in", "is", "or", "eq", "neq", "gte", "lt", "lte", "not", "order"]) q[m] = () => q;
      q.range = (a: number, b: number) => { faixa = [a, b]; return q; };
      q.upsert = (linhas: Linha[]) => { acao = "upsert"; banco.upserts.push({ tabela, linhas }); return q; };
      q.then = (ok: (v: unknown) => unknown) => {
        if (acao !== "select") return Promise.resolve({ data: null, error: null }).then(ok);
        const erro = banco.falhas.get(tabela);
        if (erro) return Promise.resolve({ data: null, error: { message: erro }, count: null }).then(ok);
        const todas = banco.dados[tabela] ?? [];
        return Promise.resolve({ data: faixa ? todas.slice(faixa[0], faixa[1] + 1) : todas, error: null, count: todas.length }).then(ok);
      };
      return q;
    },
  },
}));
vi.mock("@/lib/goals/calcular-server", () => ({
  calcularMetasDoMes: async (mes: string) => ({ mes, ...banco.calculo }),
}));
vi.mock("@/lib/api/cron-guard", () => ({ requireCron: () => null, requireCronOrUser: async () => null }));
vi.mock("@/lib/cs/sem-postar", () => ({ clientesIlegiveis: async () => [] }));

const { lerAlvoDigitado, motivoAlvoInvalido } = await import("@/lib/goals/alvo");
const metas = await import("@/lib/goals/metas-server");
const fechamentoRota = await import("@/app/api/system/metas-fechamento/route");
const mensalRota = await import("@/app/api/scores/mensal/route");
const { agregarVerba, lerAoVivo } = await import("@/lib/goals/ao-vivo");
const aoVivoRota = await import("@/app/api/okr/traffic-metrics/route");
const { default: CartaoMeta } = await import("@/components/goals/CartaoMeta");

beforeEach(() => {
  banco.falhas.clear();
  banco.upserts.length = 0;
  banco.rpc = { data: { ctrPct: 1.2, impressionsMonth: 5000, trafficQualIsReal: true, activeClients: 10, staleContacts: 2 }, error: null };
  banco.calculo = { valores: { posts_publicados: { valor: 200 }, clientes_ativos: { valor: 40 } }, falhas: [], chavesComFalha: [] };
  banco.dados = {
    okrs: [], goal_results: [],
    clients: [{ id: "k1", name: "Cliente Exemplo", status: "good", assigned_social: "Ana Exemplo", posts_goal: 12, service_type: "social_media", meta_ad_account_id: "act_1", draft_status: null }],
    client_ig_posts: [{ client_id: "k1", posted_at: "2026-10-10T12:00:00Z" }],
    content_cards: [], meetings: [],
    ad_accounts: [{ meta_account_id: "act_1", monthly_budget: 1000, current_month_spend: 500 }],
  };
});

describe("alvo digitado (7.1)", () => {
  const maior = { sentido: "maior" as const, alvo: 10 };
  const menor = { sentido: "menor" as const, alvo: 10 };
  it("o erro original: campo vazio virava 0 — agora pede o número", () => {
    expect(lerAlvoDigitado("", maior)).toEqual({ tipo: "erro", motivo: "Digite a meta antes de salvar." });
  });
  it("zero em meta 'quanto mais, melhor' é recusado (nasceria batida); em 'até X' pede confirmação", () => {
    expect(lerAlvoDigitado("0", maior).tipo).toBe("erro");
    expect(lerAlvoDigitado("0", menor)).toMatchObject({ tipo: "salvar", valor: 0, confirmar: expect.stringMatching(/Confirmar/) });
    expect(motivoAlvoInvalido(0, "maior")).toMatch(/nasce batida/);
  });
  it("vírgula vale; igual ao atual não faz nada", () => {
    expect(lerAlvoDigitado("12,5", maior)).toEqual({ tipo: "salvar", valor: 12.5 });
    expect(lerAlvoDigitado("10", maior)).toEqual({ tipo: "igual" });
  });
  it("o servidor recusa zero em meta 'maior'", async () => {
    const r = await metas.salvarAlvo("posts_publicados", 0, "gestao@exemplo.com");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/nasce batida/);
  });
  it("cartão: Enter com o campo vazio NÃO salva; Enter durante 'salvando' também não", () => {
    const onSalvar = vi.fn();
    const m = {
      chave: "posts_publicados", titulo: "Posts publicados", equipe: "social", unidade: "posts", casas: 0, sentido: "maior", fonte: "Instagram",
      alvo: 100, alvoPersonalizado: false,
      fechado: { valor: 90, semFonte: null, detalhe: null, alvo: 100, progresso: 90, status: "perto" },
      parcial: { valor: 30, semFonte: null, detalhe: null, alvo: 100, progresso: 30, status: "longe" },
      historico: [],
    } as never;
    const { rerender } = render(<CartaoMeta m={m} nomeMesAtual="outubro" editando onSalvar={onSalvar} onPadrao={vi.fn()} salvando={false} />);
    const campo = screen.getByLabelText("Meta");
    fireEvent.change(campo, { target: { value: "" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(onSalvar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Digite a meta antes de salvar.");

    fireEvent.change(campo, { target: { value: "120" } });
    rerender(<CartaoMeta m={m} nomeMesAtual="outubro" editando onSalvar={onSalvar} onPadrao={vi.fn()} salvando />);
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(onSalvar).not.toHaveBeenCalled();

    rerender(<CartaoMeta m={m} nomeMesAtual="outubro" editando onSalvar={onSalvar} onPadrao={vi.fn()} salvando={false} />);
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(onSalvar).toHaveBeenCalledWith("posts_publicados", 120);
  });
});

describe("fechamento do mês das metas (7.2)", () => {
  it("o erro original: fonte falhando era gravada como resultado — agora a meta fica de fora e a rotina diz qual", async () => {
    banco.calculo = { valores: { posts_publicados: { valor: null, semFonte: "não consegui ler os posts do Instagram agora" }, clientes_ativos: { valor: 40 } },
      falhas: ["os posts do Instagram: timeout"], chavesComFalha: ["posts_publicados"] };
    const r = await fechamentoRota.POST(new NextRequest("http://x/api/system/metas-fechamento?periodo=2026-09", { method: "POST" }));
    const j = await r.json();
    expect(j.ok).toBe(false);
    expect(j.error).toMatch(/não gravei posts_publicados/);
    const gravadas = banco.upserts.flatMap((u) => u.linhas.map((l) => l.chave));
    expect(gravadas).toContain("clientes_ativos");
    expect(gravadas).not.toContain("posts_publicados");
  });
  it("alvos que não carregam: nada é gravado (o padrão entraria como se fosse a meta)", async () => {
    banco.falhas.set("okrs", "timeout");
    const r = await fechamentoRota.POST(new NextRequest("http://x/api/system/metas-fechamento?periodo=2026-09", { method: "POST" }));
    const j = await r.json();
    expect(j.ok).toBe(false);
    expect(j.error).toMatch(/não consegui ler as metas do trimestre/);
    expect(banco.upserts).toHaveLength(0);
  });
  it("tudo lido: grava e responde ok", async () => {
    const r = await fechamentoRota.POST(new NextRequest("http://x/api/system/metas-fechamento?periodo=2026-09", { method: "POST" }));
    expect((await r.json()).ok).toBe(true);
    expect(banco.upserts).toHaveLength(1);
  });
});

describe("painel de metas (7.2/7.5)", () => {
  it("o erro original: erro ao ler o histórico virava 'aplique a migration' — agora é falha, e o mês é calculado", async () => {
    banco.falhas.set("goal_results", "canceling statement due to statement timeout");
    const p = await metas.montarPainelMetas(new Date("2026-10-25T15:00:00Z"));
    expect(p.historicoExiste).toBe(true);
    expect(p.historicoErro).toMatch(/timeout/);
    expect(p.falhas.join(" ")).toMatch(/histórico gravado/);
    expect(p.metas.find((m) => m.chave === "posts_publicados")?.fechado.valor).toBe(200);
  });
  it("tabela ausente continua dizendo que falta a migration (existe:false, sem erro)", async () => {
    banco.falhas.set("goal_results", "relation \"goal_results\" does not exist");
    const p = await metas.montarPainelMetas(new Date("2026-10-25T15:00:00Z"));
    expect(p.historicoExiste).toBe(false);
    expect(p.historicoErro).toBeNull();
  });
  it("alvos que falham aparecem em falhas (os cartões mostram o padrão)", async () => {
    banco.falhas.set("okrs", "timeout");
    const p = await metas.montarPainelMetas(new Date("2026-10-25T15:00:00Z"));
    expect(p.alvosFalharam).toBe(true);
    expect(p.falhas.join(" ")).toMatch(/alvo padrão/);
  });
  it("fechamento gravado só em parte: a meta que faltou é calculada agora (antes ficava 'não calculado')", async () => {
    banco.dados.goal_results = [{ periodo: "2026-09", chave: "clientes_ativos", valor: 41, alvo: 40, status: "batida", sem_fonte: null, detalhe: null, calculado_em: "2026-10-01" }];
    const p = await metas.montarPainelMetas(new Date("2026-10-25T15:00:00Z"));
    expect(p.metas.find((m) => m.chave === "clientes_ativos")?.fechado.valor).toBe(41);
    expect(p.metas.find((m) => m.chave === "posts_publicados")?.fechado.valor).toBe(200);
  });
});

describe("fechamento por pessoa (7.3)", () => {
  it("o erro original: posts fora do ar deixavam todo cliente 'Sem nenhum post' — agora 500 com o motivo", async () => {
    banco.falhas.set("client_ig_posts", "timeout");
    const r = await mensalRota.GET(new NextRequest("http://x/api/scores/mensal?mes=2026-10"));
    expect(r.status).toBe(500);
    const j = await r.json();
    expect(j.ok).toBe(false);
    expect(j.error).toMatch(/posts do Instagram/);
  });
  it("lido: conta os posts do cliente", async () => {
    const r = await mensalRota.GET(new NextRequest("http://x/api/scores/mensal?mes=2026-10"));
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.totais.publicados).toBe(1);
  });
});

describe("indicadores ao vivo (7.4)", () => {
  it("verba: sem conta com gasto lido é null, não 0%", () => {
    expect(agregarVerba([], []).accountsWithinBudgetPct).toBeNull();
    const v = agregarVerba([{ meta_account_id: "a", monthly_budget: 100, current_month_spend: 50 }], [{ meta_ad_account_id: "a", status: "good", draft_status: null }]);
    expect(v.accountsWithinBudgetPct).toBe(100);
  });
  it("função ao vivo sem dado: null, não zero", () => {
    expect(lerAoVivo(null)).toMatchObject({ staleContacts: null, activeClients: null, ctrPct: null });
  });
  it("o erro original: a função falhava e a rota caía em zeros — agora null + falhas", async () => {
    banco.rpc = { data: null, error: { message: "function okr_live_metrics() does not exist" } };
    const r = await aoVivoRota.GET(new NextRequest("http://x/api/okr/traffic-metrics"));
    const j = await r.json();
    expect(j.staleContacts).toBeNull();
    expect(j.activeClients).toBeNull();
    expect(j.falhas[0]).toMatch(/okr_live_metrics/);
    expect(j.accountsWithinBudgetPct).toBe(100);
  });
  it("contas fora do ar: verba null com o motivo", async () => {
    banco.falhas.set("ad_accounts", "timeout");
    const j = await (await aoVivoRota.GET(new NextRequest("http://x/api/okr/traffic-metrics"))).json();
    expect(j.accountsWithinBudgetPct).toBeNull();
    expect(j.falhas[0]).toMatch(/contas de anúncio/);
  });
});
