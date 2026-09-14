// @vitest-environment node
// (o fetch instrumentado é código morto quando `window` existe — em jsdom o teste não veria nada)
import { describe, it, expect, vi } from "vitest";

// O client admin real, com o fetch global trocado: o que sai no header quando se está numa execução.

const chamadas: { url: string; headers: Headers; method: string }[] = [];
vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  chamadas.push({ url, headers: new Headers(init?.headers), method: init?.method ?? "GET" });
  return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
});
process.env.SUPABASE_INTERNAL_URL = "http://supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste";

const { supabaseAdmin } = await import("@/lib/supabase/server");
const { comExecucao } = await import("@/lib/obs/correlacao");

describe("fetch instrumentado do client admin", () => {
  it("dentro de uma execução: x-correlation-id + x-actor (ASCII) em toda request, e escrita contada", async () => {
    await comExecucao({ origem: "inbound", ator: "Júlio", papel: "manager" }, async (e) => {
      await supabaseAdmin.from("clients").select("id").limit(1);
      await supabaseAdmin.from("cs_client_rules").insert({ texto: "x" });
      const [leitura, escrita] = chamadas.slice(-2);
      expect(leitura.headers.get("x-correlation-id")).toBe(e.id);
      expect(leitura.headers.get("x-actor")).toBe("Julio");
      expect(leitura.headers.get("x-actor-role")).toBe("manager");
      expect(escrita.method).toBe("POST");
      expect(e.escritas).toBe(1);
    });
  });

  it("fora de execução e fora de request Next: sem header de ator, e a chamada segue normal", async () => {
    await new Promise((r) => setTimeout(r, 10)); // o agent_runs do teste anterior grava em background
    chamadas.length = 0;
    await supabaseAdmin.from("clients").select("id").limit(1);
    const c = chamadas.find((x) => x.url.includes("/rest/v1/clients"))!;
    expect(c).toBeTruthy();
    expect(c.headers.get("x-correlation-id")).toBeNull();
    expect(c.headers.get("x-actor")).toBeNull();
    expect(c.headers.get("apikey")).toBe("chave-de-teste"); // o resto do client intacto
  });
});
