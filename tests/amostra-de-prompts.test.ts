// @vitest-environment node
// tests/amostra-de-prompts.test.ts — leva 1-M (26/11/2026). Amostra de pedidos reais para comparar o
// modelo atual × o candidato antes de trocar gpt-4o/4o-mini (saem da API em 14/01/2027).
//  · desligado por padrão; ligado guarda o pedido exato e a resposta, sem imagem embutida;
//  · nunca atrapalha a chamada (banco fora do ar = chamada segue);
//  · a comparação reenvia no contrato do candidato e mede JSON e campos iguais. Dados inventados.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const banco = vi.hoisted(() => ({ taxa: null as string | null, quebrado: false, inseridos: [] as { tabela: string; linha: Record<string, unknown> }[] }));
vi.mock("@/lib/obs/llm", () => ({ registrarChamadaLlm: () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (tabela: string) => {
      if (banco.quebrado) throw new Error("banco fora do ar");
      const q = {
        select: () => q, eq: () => q, lt: async () => ({ error: null }), delete: () => q,
        maybeSingle: async () => ({ data: tabela === "agency_settings" && banco.taxa !== null ? { value: banco.taxa } : null, error: null }),
        insert: async (linha: Record<string, unknown>) => { banco.inseridos.push({ tabela, linha }); return { error: null }; },
      };
      return q;
    },
  },
}));

const { taxaDe, deveAmostrar, limparCorpo, _zerarCacheDaAmostra } = await import("@/lib/ai/amostra");
const { corpoParaCandidato, compararSaidas, resumir } = await import("@/lib/ai/comparar");
const { chatJson } = await import("@/lib/ai/openai");

const base = { model: "gpt-4o-mini", system: "Você classifica mensagens.", user: "Cliente Exemplo: pode subir a arte?", schema: { type: "object" }, schemaName: "t", origem: "cs:classificador" as never };

beforeEach(() => {
  banco.taxa = null; banco.quebrado = false; banco.inseridos.length = 0; _zerarCacheDaAmostra();
  vi.stubEnv("OPENAI_API_KEY", "sk-teste");
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ choices: [{ message: { content: "{\"intencao\":\"aprovacao\"}" } }], usage: {} }), { headers: { "content-type": "application/json" } }));
});

describe("interruptor e limpeza", () => {
  it("taxa: N inteiro ≥ 1; vazio, off, 0 ou lixo = desligado", () => {
    expect(taxaDe("50")).toBe(50);
    expect(taxaDe(" 1 ")).toBe(1);
    for (const v of [null, "", "off", "0", "-3", "1.5", "sim"]) expect(taxaDe(v), String(v)).toBeNull();
    expect(deveAmostrar(null, 0)).toBe(false);
    expect(deveAmostrar(1, 0.99)).toBe(true);
    expect(deveAmostrar(10, 0.05)).toBe(true);
    expect(deveAmostrar(10, 0.2)).toBe(false);
  });

  it("imagem embutida não é guardada e marca a amostra como não reenviável", () => {
    const r = limparCorpo({ messages: [{ content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }, { type: "text", text: "oi" }] }] });
    expect(JSON.stringify(r.corpo)).not.toContain("base64");
    expect(JSON.stringify(r.corpo)).toContain("[imagem inline]");
    expect(r.reenviavel).toBe(false);
    expect(limparCorpo({ messages: [{ content: "texto" }] }).reenviavel).toBe(true);
  });
});

describe("chatJson guarda a amostra só com o interruptor ligado", () => {
  it("desligado (sem a chave): não grava nada", async () => {
    const r = await chatJson(base);
    expect(r.ok).toBe(true);
    await new Promise((ok) => setTimeout(ok, 20));
    expect(banco.inseridos.filter((i) => i.tabela === "llm_amostras")).toEqual([]);
  });

  it("ligado (1 em 1): grava o pedido exato e a resposta", async () => {
    banco.taxa = "1";
    await chatJson({ ...base, maxTokens: 300 });
    await vi.waitFor(() => expect(banco.inseridos.some((i) => i.tabela === "llm_amostras")).toBe(true));
    const a = banco.inseridos.find((i) => i.tabela === "llm_amostras")!.linha;
    expect(a).toMatchObject({ origem: "cs:classificador", modelo: expect.any(String), resposta: "{\"intencao\":\"aprovacao\"}", ok: true, reenviavel: true });
    expect(a.corpo).toMatchObject({ max_tokens: 300, response_format: { type: "json_schema" }, messages: [{ role: "system" }, { role: "user", content: base.user }] });
  });

  it("banco fora do ar não derruba a chamada", async () => {
    banco.taxa = "1"; banco.quebrado = true;
    const r = await chatJson(base);
    expect(r).toMatchObject({ ok: true, data: { intencao: "aprovacao" } });
  });
});

describe("comparação", () => {
  it("o pedido vai no contrato do candidato (modelo de raciocínio: sem temperature, max_completion_tokens)", () => {
    const corpo = { model: "gpt-4o-mini", messages: [{ role: "user", content: "x" }], max_tokens: 500, temperature: 0.2, response_format: { type: "json_schema" } };
    expect(corpoParaCandidato(corpo, "gpt-6-luna")).toEqual({ model: "gpt-6-luna", messages: corpo.messages, response_format: corpo.response_format, max_completion_tokens: 500 });
    expect(corpoParaCandidato({ ...corpo, max_tokens: undefined, max_completion_tokens: 900 }, "gpt-4o")).toMatchObject({ model: "gpt-4o", max_tokens: 900, temperature: 0.2 });
  });

  it("mede JSON válido e a fração de campos iguais", () => {
    expect(compararSaidas('{"a":1,"b":"x","c":[1]}', '{"a":1,"b":"y","c":[1]}')).toEqual({ json_valido: true, campos_iguais: 0.6667 });
    expect(compararSaidas('{"a":1}', "não é json")).toEqual({ json_valido: false, campos_iguais: null });
    expect(compararSaidas(null, '{"a":1}')).toEqual({ json_valido: true, campos_iguais: null });
  });

  it("resumo do lote só com números", () => {
    const r = resumir("l", [
      { candidato: "gpt-6-luna", ok: true, json_valido: true, campos_iguais: "1.0000", duracao_ms: 1000, custo_usd: "0.0001" },
      { candidato: "gpt-6-luna", ok: false, json_valido: false, campos_iguais: null, duracao_ms: 3000, custo_usd: null },
    ]);
    expect(r).toEqual({ lote: "l", candidato: "gpt-6-luna", feitas: 2, responderam: 1, jsonValido: 1, camposIguaisMedia: 1, msMedio: 2000, custoUsd: 0.0001 });
  });

  it("a rota é só de admin e limita o lote", () => {
    const src = readFileSync("app/api/system/comparar-modelos/route.ts", "utf8");
    expect(src.match(/requireCronOrRole\(req, \["admin"\]\)/g)).toHaveLength(2);
    expect(readFileSync("lib/ai/comparar.ts", "utf8")).toMatch(/MAX_POR_LOTE = 50/);
  });
});
