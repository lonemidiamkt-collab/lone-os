// @vitest-environment node
// Checklist de setup: leitura que falha aborta a rodada (auditoria 13.3, 25/10/2026). Dados INVENTADOS.
//
// O QUE ACONTECIA: o erro ao ler as tarefas existentes era ignorado — o checklist parecia inexistente e era criado de
// novo para cada cliente nos 15 primeiros dias (tarefa duplicada, cobrança em dobro). Agora a rodada lança com o
// motivo e nada é criado; a rota responde ok:false.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Linha = Record<string, unknown>;
const dados: Record<string, Linha[]> = {};
const falhas = new Set<string>();
const inseridas: Linha[] = [];
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "or", "in", "ilike", "gte", "gt", "neq", "order", "limit", "maybeSingle"]) q[m] = () => q;
      q.insert = (v: Linha) => { inseridas.push(v); return q; };
      q.update = () => q;
      q.upsert = () => q;
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve(falhas.has(tabela)
        ? { data: null, error: { message: `${tabela} fora do ar` } }
        : { data: dados[tabela] ?? [], error: null }).then(ok);
      return q;
    },
  },
}));
vi.mock("@/lib/traffic/sync-core", () => ({ getMetaToken: async () => null }));
vi.mock("@/lib/cs/anuncio-no-ar", () => ({
  diagnosticar: async () => ({}), paraCobrar: () => [], textoCobranca: () => "", textoIndefinidos: () => "",
}));
vi.mock("@/lib/cs/porta-voz", () => ({ fatoSemAnuncio: (c: string) => c }));
vi.mock("@/lib/api/cron-guard", () => ({ requireCron: () => null }));

const { executarCobrancaSetup } = await import("@/lib/cs/setup-cobranca");
const rota = await import("@/app/api/system/cs-setup/route");

beforeEach(() => {
  falhas.clear();
  inseridas.length = 0;
  dados.clients = [{
    id: "k1", name: "Cliente Exemplo", status: "onboarding", created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    meta_ad_account_id: null, assigned_social: "Ana Exemplo", assigned_designer: "Bruna Exemplo", assigned_traffic: null,
    perfil_conteudo: null, service_type: "social_media",
  }];
  dados.content_cards = [];
  dados.metric_snapshots = [];
  dados.agency_settings = [];
  // O checklist já existe — antes da correção, a falha de leitura fazia ele "sumir" e ser criado de novo.
  dados.tasks = [{ id: "t1", client_id: "k1", title: "[Setup] qualquer", status: "pending" }];
});

describe("executarCobrancaSetup — leitura que falha", () => {
  it("o erro original: a leitura das tarefas falhava e o checklist era recriado — agora lança e não cria nada", async () => {
    falhas.add("tasks");
    await expect(executarCobrancaSetup({ aplicar: true, marcarMarcos: false })).rejects.toThrow(/não consegui ler as tarefas do checklist/);
    expect(inseridas).toHaveLength(0);
  });
  it("clientes que não carregam não viram 'ninguém em onboarding'", async () => {
    falhas.add("clients");
    await expect(executarCobrancaSetup({ aplicar: true, marcarMarcos: false })).rejects.toThrow(/clientes em onboarding/);
  });
  it("cards ou gasto que não carregam também abortam", async () => {
    falhas.add("metric_snapshots");
    await expect(executarCobrancaSetup({ aplicar: true, marcarMarcos: false })).rejects.toThrow(/gasto dos anúncios/);
  });
  it("a rota responde ok:false com o motivo", async () => {
    falhas.add("tasks");
    const res = await rota.POST(new NextRequest("http://x/api/system/cs-setup", { method: "POST" }));
    expect(res.status).toBe(500);
    const j = await res.json();
    expect(j.ok).toBe(false);
    expect(j.erro).toMatch(/Nada foi criado nem fechado/);
  });
});
