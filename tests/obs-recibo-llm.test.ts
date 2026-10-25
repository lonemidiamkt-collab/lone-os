import { describe, it, expect, vi } from "vitest";

// Recibo de cada chamada de modelo (llm_calls).
// Até 25/10/2026, chamada sem rótulo ganhava o arquivo da pilha — no servidor, o arquivo COMPILADO
// ("app/.next/server/app/api/ai/morning-briefing/route", ~1.400 por mês). Agora a etiqueta do agente é
// obrigatória (tests/agentes-etiqueta.test.ts); se mesmo assim chegar vazia, o recibo diz "sem-etiqueta".
const gravadas: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: () => ({ insert: async (r: Record<string, unknown>) => { gravadas.push(r); return { error: null }; } }) } }));

const { registrarChamadaLlm } = await import("@/lib/obs/llm");

describe("recibo da chamada de modelo", () => {
  it("com etiqueta: grava a etiqueta do agente", async () => {
    registrarChamadaLlm({ modelo: "gpt-4o", ms: 10, ok: true, usage: { prompt_tokens: 100, completion_tokens: 10 }, origem: "cs:revisao-arte" });
    await new Promise((r) => setTimeout(r, 5));
    expect(gravadas.at(-1)!.origem).toBe("cs:revisao-arte");
  });
  it("sem etiqueta (código sem tipo): 'sem-etiqueta', nunca o nome do arquivo", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    registrarChamadaLlm({ modelo: "gpt-4o", ms: 10, ok: true, usage: { prompt_tokens: 100, completion_tokens: 10 } } as never);
    await new Promise((r) => setTimeout(r, 5));
    expect(gravadas.at(-1)!.origem).toBe("sem-etiqueta");
    log.mockRestore();
  });
  it("gpt-image-1 sem usage recebe custo fixo estimado, não null", async () => {
    registrarChamadaLlm({ modelo: "gpt-image-1", ms: 20_000, ok: true, origem: "trafego:previa", tipo: "image" });
    await new Promise((r) => setTimeout(r, 5));
    const r = gravadas.at(-1)!;
    expect(r.custo_usd).toBeCloseTo(0.063, 3);
    expect(r.custo_estimado).toBe(true);
  });
});
