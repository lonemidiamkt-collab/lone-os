import { describe, it, expect, vi } from "vitest";

// Chamada de modelo sem rótulo não pode ficar anônima no recibo — 66 chamadas de gpt-4o em 3 dias
// (a fatia mais cara) chegaram assim. Sem `origem` e fora de execução, entra o arquivo que chamou.
const gravadas: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: () => ({ insert: async (r: Record<string, unknown>) => { gravadas.push(r); return { error: null }; } }) } }));

const { registrarChamadaLlm } = await import("@/lib/obs/llm");

describe("recibo da chamada de modelo", () => {
  it("sem origem e sem execução: a origem vem da pilha (arquivo que chamou), não fica nula", async () => {
    registrarChamadaLlm({ modelo: "gpt-4o", ms: 10, ok: true, usage: { prompt_tokens: 100, completion_tokens: 10 } });
    await new Promise((r) => setTimeout(r, 5));
    const r = gravadas.at(-1)!;
    expect(typeof r.origem).toBe("string");
    expect(String(r.origem)).toMatch(/tests\/obs-origem-pilha|obs-origem-pilha/);
  });
  it("gpt-image-1 sem usage recebe custo fixo estimado, não null", async () => {
    registrarChamadaLlm({ modelo: "gpt-image-1", ms: 20_000, ok: true, origem: "trafego:previa", tipo: "image" });
    await new Promise((r) => setTimeout(r, 5));
    const r = gravadas.at(-1)!;
    expect(r.custo_usd).toBeCloseTo(0.063, 3);
    expect(r.custo_estimado).toBe(true);
  });
});
