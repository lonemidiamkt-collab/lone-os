import { describe, it, expect, vi, beforeEach } from "vitest";

// 401 no meio de uma criação travava a tela (20 por dia nos quadros; GoTrue nunca recusou token válido —
// era pedido sem header). authedFetch renova a sessão e repete UMA vez.
const auth = { getSession: vi.fn(), refreshSession: vi.fn() };
vi.mock("@/lib/supabase/client", () => ({ supabase: { auth } }));
const { authedFetch } = await import("@/lib/supabase/authed-fetch");

beforeEach(() => { vi.restoreAllMocks(); auth.getSession.mockReset(); auth.refreshSession.mockReset(); });

describe("authedFetch com 401", () => {
  it("renova a sessão e repete o pedido uma vez com o token novo e o mesmo corpo", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    auth.refreshSession.mockResolvedValue({ data: { session: { access_token: "novo" } } });
    const chamadas: { auth: string | null; body: unknown }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: unknown, init?: RequestInit) => {
      const h = new Headers(init?.headers); chamadas.push({ auth: h.get("Authorization"), body: init?.body });
      return new Response(chamadas.length === 1 ? "nao" : "{\"id\":\"x\"}", { status: chamadas.length === 1 ? 401 : 200 });
    }));
    const r = await authedFetch("/api/design-requests/create", { method: "POST", body: "{\"a\":1}" });
    expect(r.status).toBe(200);
    expect(chamadas).toHaveLength(2);
    expect(chamadas[0].auth).toBeNull();
    expect(chamadas[1].auth).toBe("Bearer novo");
    expect(chamadas[1].body).toBe("{\"a\":1}");
  });
  it("se continuar 401, devolve o 401 e avisa a tela (evento), sem laço", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    auth.refreshSession.mockResolvedValue({ data: { session: null } });
    let n = 0; vi.stubGlobal("fetch", vi.fn(async () => { n++; return new Response("nao", { status: 401 }); }));
    const ouviu = vi.fn(); window.addEventListener("lone:sessao-expirada", ouviu);
    const r = await authedFetch("/api/x");
    expect(r.status).toBe(401); expect(n).toBe(1); expect(ouviu).toHaveBeenCalledTimes(1);
  });
});
