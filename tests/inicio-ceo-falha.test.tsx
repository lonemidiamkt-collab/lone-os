// tests/inicio-ceo-falha.test.tsx — 25/10/2026, auditoria de erro recuperável (6.2, 6.3, 6.5). Dados INVENTADOS.
//
// 6.2: erro ao ler `meetings` voltava como mapa vazio — todo cliente "sem reunião", cobertura 0% — e a rota respondia ok:true.
// 6.3: as 4 leituras do cockpit usavam `data ?? []`: "Posts publicados 0", "Tarefas vencidas 0" — e o fechamento gravava.
// 6.5: os KPIs da Área CEO saíam do store sem olhar se carregou: "0 clientes", "Publicações atrasadas 0 — nenhuma".

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextRequest } from "next/server";

type Linha = Record<string, unknown>;
const banco = vi.hoisted(() => ({ dados: {} as Record<string, Linha[]>, falhas: new Set<string>(), gravadas: [] as string[] }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (tabela: string) => {
      let acao = "select";
      let cabeca = false;
      let faixa: [number, number] | null = null;
      const q: Record<string, unknown> = {};
      q.select = (_c: string, o?: { head?: boolean }) => { cabeca = !!o?.head; return q; };
      for (const m of ["in", "is", "or", "neq", "eq", "gte", "lte", "order", "not"]) q[m] = () => q;
      q.range = (a: number, b: number) => { faixa = [a, b]; return q; };
      q.upsert = () => { acao = "upsert"; banco.gravadas.push(tabela); return q; };
      q.maybeSingle = () => Promise.resolve({ data: null, error: null });
      q.then = (ok: (v: unknown) => unknown) => {
        if (acao !== "select") return Promise.resolve({ data: null, error: null }).then(ok);
        if (banco.falhas.has(tabela)) return Promise.resolve({ data: null, error: { message: `${tabela} fora do ar` }, count: null }).then(ok);
        const todas = banco.dados[tabela] ?? [];
        if (cabeca) return Promise.resolve({ data: null, error: null, count: todas.length }).then(ok);
        const fatia = faixa ? todas.slice(faixa[0], faixa[1] + 1) : todas;
        return Promise.resolve({ data: fatia, error: null, count: todas.length }).then(ok);
      };
      return q;
    },
  },
}));
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => ({ id: "u1", email: "gestao@exemplo.com", isAdmin: true }) }));
vi.mock("@/lib/api/cron-guard", () => ({ requireCron: () => null }));

const { reunioesDosClientes } = await import("@/lib/meetings/consulta");
const cobertura = await import("@/app/api/reunioes/cobertura/route");
const { calcularCockpit } = await import("@/lib/metrics/cockpit");
const cockpitRota = await import("@/app/api/ceo/cockpit/route");
const { situacaoDaFonte, valorDaFonte, legendaDaFonte } = await import("@/lib/ceo/fontes");
const { OperationalKpisPanel } = await import("@/components/ceo/OperationalKpisPanel");

beforeEach(() => {
  banco.falhas.clear();
  banco.gravadas.length = 0;
  banco.dados = {
    clients: [{ id: "k1", name: "Cliente Exemplo", status: "good", current_health_score: 80, posts_goal: 12, last_client_msg_at: null }],
    meetings: [],
    content_cards: [],
    tasks: [{ id: "t1", status: "pending", due_date: "2020-01-01" }],
    client_ig_posts: [{ id: "p1" }, { id: "p2" }],
  };
});

describe("cobertura de reuniões (6.2)", () => {
  it("o erro original: a leitura de reuniões falhava e virava 'ninguém teve reunião' — agora lança", async () => {
    banco.falhas.add("meetings");
    await expect(reunioesDosClientes(["k1"])).rejects.toThrow(/Não consegui ler as reuniões/);
  });
  it("a rota responde 500 com o motivo, não ok:true com cobertura 0%", async () => {
    banco.falhas.add("meetings");
    const r = await cobertura.GET(new NextRequest("http://x/api/reunioes/cobertura"));
    expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/reuniões/);
  });
  it("clientes que não carregam também são falha", async () => {
    banco.falhas.add("clients");
    const r = await cobertura.GET(new NextRequest("http://x/api/reunioes/cobertura"));
    expect(r.status).toBe(500);
  });
});

describe("cockpit 'Como estamos' (6.3)", () => {
  it("lido: posts pela contagem, tarefas vencidas contadas", async () => {
    const c = await calcularCockpit("2026-10");
    expect(c.falhas).toEqual([]);
    expect(c.postsPublicados.valor).toBe(2);
    expect(c.tarefasVencidas.valor).toBe(1);
  });
  it("o erro original: tarefas fora do ar viravam 'Tarefas vencidas 0' — agora '—' com o motivo", async () => {
    banco.falhas.add("tasks");
    const c = await calcularCockpit("2026-10");
    expect(c.tarefasVencidas).toEqual({ valor: null, semFonte: "não consegui ler as tarefas agora" });
    expect(c.falhas[0]).toMatch(/as tarefas/);
    // As outras fontes continuam valendo.
    expect(c.postsPublicados.valor).toBe(2);
  });
  it("posts fora do ar: não é 'Posts publicados 0'", async () => {
    banco.falhas.add("client_ig_posts");
    const c = await calcularCockpit("2026-10");
    expect(c.postsPublicados.valor).toBeNull();
  });
  it("o fechamento (POST) recusa gravar com fonte falhando", async () => {
    banco.falhas.add("content_cards");
    const r = await cockpitRota.POST(new NextRequest("http://x/api/ceo/cockpit?periodo=2026-09", { method: "POST" }));
    expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/Não gravei o fechamento de 2026-09/);
    expect(banco.gravadas).toEqual([]);
  });
  it("tudo lido: o fechamento grava", async () => {
    const r = await cockpitRota.POST(new NextRequest("http://x/api/ceo/cockpit?periodo=2026-09", { method: "POST" }));
    expect(r.status).toBe(200);
    expect(banco.gravadas).toEqual(["snapshots"]);
  });
});

describe("Área CEO (6.5)", () => {
  it("número só com a fonte pronta", () => {
    expect(valorDaFonte(0, situacaoDaFonte({ carregada: false }))).toBe("—");
    expect(valorDaFonte(0, situacaoDaFonte({ carregada: false, erro: "falhou" }))).toBe("—");
    expect(valorDaFonte(7, situacaoDaFonte({ carregada: true }))).toBe(7);
    expect(legendaDaFonte("na carteira", "erro")).toBe("não carregou");
    expect(legendaDaFonte("na carteira", "carregando")).toBe("carregando…");
  });
  it("o erro original: cards que não carregaram mostravam 'Publicações atrasadas 0 — nenhuma' em verde", () => {
    render(<OperationalKpisPanel cards={[]} indisponivel="não carregou" />);
    expect(screen.queryByText("nenhuma")).not.toBeInTheDocument();
    expect(screen.getByText(/os cards não carregaram/)).toBeInTheDocument();
  });
});
