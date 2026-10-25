// @vitest-environment node
// Lone Score e saúde (cron 06:20): leitura que falha não vira zero gravado, e o corpus é lido inteiro (auditoria 6.1,
// 25/10/2026). Dados INVENTADOS.
//
// O QUE ACONTECIA: `sinaisDoLoninho` não conferia `.error` e usava `data ?? []` — cs_demandas fora do ar virava "0
// reclamações, sentimento 90", e o "sem contato" ia a 100% da carteira; tudo gravado em client_health_scores. O corpus
// de 180 dias vinha numa leitura só, em ordem crescente: com o teto de 1000 linhas do PostgREST, só as mais antigas.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { lerTodasAsLinhas } from "@/lib/scores/ler-tudo";

type Linha = Record<string, unknown>;
const dados: Record<string, Linha[]> = {};
const falhas = new Set<string>();
const gravacoes: string[] = [];
/** O teto do servidor (como o max_rows do PostgREST): nenhuma resposta passa disto. */
let TETO = 1000;

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (tabela: string) => {
      let faixa: [number, number] | null = null;
      let contar = false;
      let acao = "select";
      const q: Record<string, unknown> = {};
      q.select = (_c: string, o?: { count?: string }) => { contar = o?.count === "exact"; return q; };
      for (const m of ["in", "gte", "is", "or", "order", "eq", "not"]) q[m] = () => q;
      q.range = (a: number, b: number) => { faixa = [a, b]; return q; };
      q.upsert = () => { acao = "upsert"; gravacoes.push(tabela); return q; };
      q.update = () => { acao = "update"; gravacoes.push(tabela); return q; };
      q.then = (ok: (v: unknown) => unknown) => {
        if (acao !== "select") return Promise.resolve({ data: null, error: null }).then(ok);
        if (falhas.has(tabela)) return Promise.resolve({ data: null, error: { message: `${tabela} fora do ar` }, count: null }).then(ok);
        const todas = dados[tabela] ?? [];
        const [a, b] = faixa ?? [0, todas.length - 1];
        const fatia = todas.slice(a, Math.min(b + 1, a + TETO));
        return Promise.resolve({ data: fatia, error: null, count: contar ? todas.length : null }).then(ok);
      };
      return q;
    },
  },
}));
vi.mock("@/lib/api/cron-guard", () => ({ requireCronOrUser: async () => null }));
vi.mock("@/lib/cs/nps-server", () => ({ notasParaSaude: async () => new Map() }));

const { sinaisDoLoninho } = await import("@/lib/scores/sinais-loninho");
const rota = await import("@/app/api/scores/route");

const DIA = 86_400_000;
beforeEach(() => {
  TETO = 1000;
  falhas.clear();
  gravacoes.length = 0;
  // 2.500 mensagens em ordem crescente: as 1.000 mais antigas são de 170 dias atrás; a última é de ontem.
  dados.cs_message_corpus = Array.from({ length: 2500 }, (_, i) => ({
    client_id: "k1",
    created_at: new Date(Date.now() - (i < 1000 ? 170 * DIA : DIA) + i * 1000).toISOString(),
    is_team: i % 2 === 0,
  }));
  dados.cs_demandas = [{ client_id: "k1", tipo: "reclamacao", status: "pendente", created_at: new Date(Date.now() - 2 * DIA).toISOString() }];
  dados.cs_rework_events = [];
  dados.clients = [{ id: "k1", name: "Cliente Exemplo", status: "good", active: true, assigned_social: "Ana Exemplo", created_at: "2026-01-01T00:00:00Z" }];
  dados.content_cards = [];
  dados.team_members = [];
});

describe("lerTodasAsLinhas", () => {
  it("lê tudo mesmo com teto do servidor MENOR que a página (pela contagem exata)", async () => {
    TETO = 300;
    const linhas = await lerTodasAsLinhas((de, ate, contar) => {
      const todas = Array.from({ length: 950 }, (_, i) => i);
      return Promise.resolve({ data: todas.slice(de, Math.min(ate + 1, de + TETO)), error: null, count: contar ? 950 : null });
    });
    expect(linhas).toHaveLength(950);
  });
  it("erro em qualquer página lança", async () => {
    await expect(lerTodasAsLinhas(() => Promise.resolve({ data: null, error: { message: "timeout" } }))).rejects.toThrow("timeout");
  });
});

describe("sinaisDoLoninho", () => {
  it("o erro original: com o teto de 1000 linhas, o 'último contato' vinha de 170 dias atrás — agora é o de ontem", async () => {
    const s = (await sinaisDoLoninho(["k1"])).get("k1")!;
    expect(s.diasSemContato).toBeLessThanOrEqual(1);
  });
  it("pedidos fora do ar: lança dizendo qual fonte — não vira '0 reclamações, sentimento 90'", async () => {
    falhas.add("cs_demandas");
    await expect(sinaisDoLoninho(["k1"])).rejects.toThrow(/Não consegui ler os pedidos dos clientes/);
  });
});

describe("/api/scores?gravar=1", () => {
  it("fonte do Loninho falhou: ok:false com o motivo e NADA gravado em client_health_scores nem em clients", async () => {
    falhas.add("cs_message_corpus");
    const res = await rota.GET(new NextRequest("http://x/api/scores?gravar=1"));
    expect(res.status).toBe(500);
    const j = await res.json();
    expect(j.ok).toBe(false);
    expect(j.error).toMatch(/conversas dos grupos/);
    expect(gravacoes).toEqual([]);
  });
  it("cards fora do ar: ok:false e nada gravado (antes cardsQ.error não era lido)", async () => {
    falhas.add("content_cards");
    const res = await rota.GET(new NextRequest("http://x/api/scores?gravar=1"));
    expect(res.status).toBe(500);
    expect(gravacoes).toEqual([]);
  });
  it("tudo lido: grava a saúde", async () => {
    const res = await rota.GET(new NextRequest("http://x/api/scores?gravar=1"));
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(gravacoes).toContain("client_health_scores");
  });
});
