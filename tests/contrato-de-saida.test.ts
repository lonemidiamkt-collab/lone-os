// @vitest-environment node
// tests/contrato-de-saida.test.ts — leva 1-M (26/11/2026). O substituto indicado do gpt-4o e do
// gpt-4o-mini (gpt-6-luna) é de raciocínio. Família de raciocínio recusa `max_tokens` e `temperature`
// livre. Quatro pontos (visão, revisão de arte, revisão de post, análise de anúncios) montavam o
// limite à mão e quebrariam no dia da troca. Agora todo limite sai de limiteDeSaida().

import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/obs/llm", () => ({ registrarChamadaLlm: () => {} }));

const { limiteDeSaida, usaContratoNovo } = await import("@/lib/ai/modelos");
const { chatJson } = await import("@/lib/ai/openai");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "node_modules" || n.startsWith(".") ? [] : arquivos(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe("contrato de parâmetros de saída", () => {
  it("família 4o: max_tokens + temperature; famílias de raciocínio: só max_completion_tokens", () => {
    expect(limiteDeSaida("gpt-4o-mini", 900)).toEqual({ max_tokens: 900, temperature: 0 });
    expect(limiteDeSaida("gpt-4o", 600, 0.3)).toEqual({ max_tokens: 600, temperature: 0.3 });
    for (const m of ["gpt-6-luna", "gpt-6.1-terra", "gpt-5.4-mini", "o4-mini", " GPT-6-luna "]) {
      expect(usaContratoNovo(m), m).toBe(true);
      expect(limiteDeSaida(m, 500, 0.7), m).toEqual({ max_completion_tokens: 500 });
    }
  });

  it("chatJson manda o contrato certo para cada família", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-teste");
    const corpos: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (_u: string, init?: RequestInit) => {
      corpos.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ choices: [{ message: { content: "{\"ok\":true}" } }], usage: {} }), { headers: { "content-type": "application/json" } });
    });
    const base = { system: "s", user: "u", schema: { type: "object" }, schemaName: "t", origem: "cs:classificador" as never };
    await chatJson({ ...base, model: "gpt-4o-mini", maxTokens: 300, temperature: 0.2 });
    await chatJson({ ...base, model: "gpt-6-luna", maxTokens: 300, temperature: 0.2 });
    expect(corpos[0]).toMatchObject({ max_tokens: 300, temperature: 0.2 });
    expect(corpos[1]).toMatchObject({ max_completion_tokens: 300 });
    expect(corpos[1]).not.toHaveProperty("max_tokens");
    expect(corpos[1]).not.toHaveProperty("temperature");
    vi.unstubAllGlobals(); vi.unstubAllEnvs();
  });

  it("nenhuma chamada escreve max_tokens / max_completion_tokens à mão (fora lib/ai/modelos.ts)", () => {
    const fora: string[] = [];
    for (const f of ["app", "lib", "components"].flatMap(arquivos)) {
      if (f === "lib/ai/modelos.ts") continue;
      readFileSync(f, "utf8").split("\n").forEach((l, i) => {
        const codigo = l.replace(/\/\/.*$/, "");
        if (/\bmax_(completion_)?tokens\s*:/.test(codigo)) fora.push(`${f}:${i + 1}`);
      });
    }
    expect(fora).toEqual([]);
  });
});
