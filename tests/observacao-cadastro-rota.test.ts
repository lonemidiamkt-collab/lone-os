// @vitest-environment node
// tests/observacao-cadastro-rota.test.ts — 25/10/2026, onda 5. A rota que leva a observação do cliente
// (client_onboarding_submissions.notes) para a aba Admin da ficha: só para quem tem papel na equipe,
// nunca devolve as notas internas, e falha de leitura é erro — não "o cliente não escreveu".

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const estado = vi.hoisted(() => ({
  papel: "social" as string | null,
  logado: true,
  resposta: { data: [] as unknown[], error: null as { message: string } | null },
  colunas: "" as string,
  filtros: [] as [string, unknown][],
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (tabela: string) => {
      const q = {
        select: (c: string) => { estado.colunas = `${tabela}:${c}`; return q; },
        eq: (c: string, v: unknown) => { estado.filtros.push([c, v]); return q; },
        order: () => q,
        limit: async () => estado.resposta,
      };
      return q;
    },
  },
}));
vi.mock("@/lib/supabase/client", () => ({ supabase: {}, REALTIME_ENABLED: false }));
vi.mock("@/lib/supabase/auth-server", () => ({
  getServerUser: async () => (estado.logado ? { id: "u1", email: "ana@lonemidia.com", isAdmin: false, aal: "aal1", duasEtapas: false } : null),
}));
vi.mock("@/lib/api/require-role", () => ({ papelDoUsuario: async () => estado.papel }));

const { GET } = await import("@/app/api/clients/[id]/observacao-cadastro/route");
const ID = "11111111-2222-3333-4444-555555555555";
const chamar = (id = ID) => GET(new NextRequest(`http://x/api/clients/${id}/observacao-cadastro`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  estado.papel = "social"; estado.logado = true; estado.filtros = []; estado.colunas = "";
  estado.resposta = { data: [], error: null };
});

describe("GET /api/clients/[id]/observacao-cadastro", () => {
  it("devolve a observação do cadastro do cliente, lida só das colunas do cadastro (sem senha, sem nota interna)", async () => {
    estado.resposta = { data: [{ notes: "Nada de vermelho.", status: "submitted", submitted_at: "2026-10-21T13:00:00Z", created_at: "2026-10-20T12:00:00Z" }], error: null };
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ temCadastro: true, observacao: { texto: "Nada de vermelho.", em: "2026-10-21T13:00:00Z", enviada: true } });
    expect(estado.colunas).toBe("client_onboarding_submissions:notes, status, submitted_at, created_at");
    expect(estado.filtros).toContainEqual(["client_id", ID]);
  });

  it("falha do banco → 503 com frase, nunca 'sem observação'", async () => {
    estado.resposta = { data: [], error: { message: "connection refused" } };
    const r = await chamar();
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/Não consegui ler o cadastro/);
  });

  it("sem login 401; sem papel 403; id que não é de cliente 400", async () => {
    estado.logado = false;
    expect((await chamar()).status).toBe(401);
    estado.logado = true; estado.papel = null;
    expect((await chamar()).status).toBe(403);
    estado.papel = "designer";
    expect((await chamar("../clients")).status).toBe(400);
  });
});
