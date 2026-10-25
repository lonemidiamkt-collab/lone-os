// @vitest-environment node
// Agenda livre de verdade (auditoria 21/10/2026, item 4.9). O Google responde 200 com `errors` quando não consegue ler
// a agenda (permissão, agenda trocada): antes isso virava "livre o dia todo". Dados INVENTADOS.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prospeccao/config", () => ({ lerSetting: async (k: string) => (k === "google_oauth" ? "cifrado" : null), gravarSetting: async () => {} }));
vi.mock("@/lib/crypto/vault", () => ({ encryptVault: (s: string) => s, decryptVault: () => JSON.stringify({ refresh_token: "r", email: "agenda@exemplo.com", conectado_em: "2026-10-18T12:00:00Z" }) }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: {} }));

let resposta: unknown = {};
vi.stubGlobal("fetch", async (url: string) => {
  if (url.startsWith("https://oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
  return new Response(JSON.stringify(resposta), { status: 200 });
});
process.env.GOOGLE_CLIENT_ID = "id-de-teste";
process.env.GOOGLE_CLIENT_SECRET = "segredo-de-teste";

const { ocupadosNoCalendario } = await import("@/lib/prospeccao/google");

beforeEach(() => { resposta = {}; });

describe("freeBusy", () => {
  it("o erro original: agenda com `errors` (200) parecia livre — agora é falha com o motivo", async () => {
    resposta = { calendars: { primary: { busy: [], errors: [{ domain: "global", reason: "notFound" }] } } };
    const r = await ocupadosNoCalendario("2026-10-29T03:00:00Z", "2026-10-30T02:59:00Z");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/notFound/);
  });
  it("resposta sem a agenda também não é 'livre'", async () => {
    resposta = { calendars: {} };
    expect((await ocupadosNoCalendario("2026-10-29T03:00:00Z", "2026-10-30T02:59:00Z")).ok).toBe(false);
  });
  it("agenda lida: devolve as faixas ocupadas", async () => {
    resposta = { calendars: { primary: { busy: [{ start: "2026-10-29T18:00:00Z", end: "2026-10-29T19:00:00Z" }] } } };
    const r = await ocupadosNoCalendario("2026-10-29T03:00:00Z", "2026-10-30T02:59:00Z");
    expect(r).toEqual({ ok: true, faixas: [{ inicio: "2026-10-29T18:00:00Z", fim: "2026-10-29T19:00:00Z" }] });
  });
});
