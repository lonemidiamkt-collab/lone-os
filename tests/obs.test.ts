import { describe, it, expect, vi, beforeEach } from "vitest";

// Fase 0A — rastreabilidade: uma execução, um id; custo por chamada; erro do PostgREST nunca some.

const inserts: { tabela: string; linha: Record<string, unknown> }[] = [];
vi.mock("@/lib/supabase/server", async (orig) => {
  // O módulo real (com o fetch instrumentado) é testado à parte; aqui só se quer ver o que foi gravado.
  const real = await orig<typeof import("@/lib/supabase/server")>();
  return {
    ...real,
    supabaseAdmin: { from: (tabela: string) => ({ insert: async (linha: Record<string, unknown>) => { inserts.push({ tabela, linha }); return { error: null }; } }) },
  };
});

const { comExecucao, execucaoAtual, idCorrelacao, anotar, definirAtor, contarEnvio, registrarUsoLlm, totais } = await import("@/lib/obs/correlacao");
const { custoUsd, modeloBase, precoDe } = await import("@/lib/obs/preco-llm");
const { registrarChamadaLlm } = await import("@/lib/obs/llm");
const { _decodificarJwtParaTeste, asciiSeguro } = await import("@/lib/obs/ator");
const { deveReportar, tabelaDaUrl, reportarErroPostgrest, _limparJanelaErros } = await import("@/lib/obs/erro-postgrest");

const tick = () => new Promise((r) => setTimeout(r, 5));
beforeEach(() => { inserts.length = 0; _limparJanelaErros(); });

describe("preço por chamada", () => {
  it("gpt-4o-mini: 1.000 de entrada (200 em cache) + 500 de saída", () => {
    const c = custoUsd("gpt-4o-mini", { prompt_tokens: 1000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 200 } });
    // 800×0.15 + 200×0.075 + 500×0.60 por milhão
    expect(c).toBeCloseTo((800 * 0.15 + 200 * 0.075 + 500 * 0.60) / 1e6, 9);
  });
  it("modelo com data e modelo desconhecido", () => {
    expect(modeloBase("gpt-4o-mini-2024-07-18")).toBe("gpt-4o-mini");
    expect(custoUsd("modelo-que-nao-existe", { prompt_tokens: 10, completion_tokens: 10 })).toBeNull();
    expect(precoDe("gpt-5.4-mini")?.estimado).toBe(true); // marcado, não inventado como certeza
  });
});

describe("uma execução, um id", () => {
  it("dentro do comExecucao todo mundo vê o mesmo id; fora, ninguém", async () => {
    expect(idCorrelacao()).toBeNull();
    let visto: string | null = null;
    await comExecucao({ origem: "teste" }, async (e) => {
      await tick();
      visto = idCorrelacao();
      expect(visto).toBe(e.id);
      anotar("demanda criada");
      definirAtor("Julio", "manager");
      contarEnvio();
      registrarUsoLlm({ modelo: "gpt-4o-mini", promptTokens: 1000, completionTokens: 100, cachedTokens: 0, custoUsd: 0.00021, ms: 300, ok: true });
      return Response.json({ ok: true, classified: true, cliente: "Quero Tintas" });
    });
    expect(idCorrelacao()).toBeNull();
    await tick();
    const run = inserts.find((i) => i.tabela === "agent_runs")!;
    expect(run).toBeTruthy();
    expect(run.linha).toMatchObject({
      id: visto, origem: "teste", ator: "Julio", papel: "manager", chamadas_llm: 1, tokens_prompt: 1000, envios: 1,
      notas: ["demanda criada"], resultado: { status: 200, ok: true, classified: true, cliente: "Quero Tintas" }, erro: null,
    });
    expect(run.linha.custo_usd).toBeCloseTo(0.00021, 6);
  });

  it("erro na execução: rethrow E linha com o erro", async () => {
    await expect(comExecucao({ origem: "teste" }, async () => { throw new Error("quebrou"); })).rejects.toThrow("quebrou");
    await tick();
    expect(inserts.find((i) => i.tabela === "agent_runs")?.linha.erro).toMatch(/quebrou/);
  });

  it("custo incompleto quando um modelo não tem preço", () => {
    const t = totais({ id: "x", origem: "t", ator: null, papel: null, iniciadoEm: 0, envios: 0, escritas: 0, notas: [], extra: {},
      llm: [{ modelo: "a", promptTokens: 1, completionTokens: 1, cachedTokens: 0, custoUsd: 0.1, ms: 1, ok: true },
            { modelo: "b", promptTokens: 1, completionTokens: 1, cachedTokens: 0, custoUsd: null, ms: 1, ok: true }] });
    expect(t.custoConhecido).toBe(false);
    expect(t.custo).toBeCloseTo(0.1);
  });

  it("recibo de chamada grava llm_calls com run_id da execução (ou null fora dela)", async () => {
    registrarChamadaLlm({ modelo: "gpt-4o", usage: { prompt_tokens: 10, completion_tokens: 5 }, ms: 50, ok: true, origem: "cs:vision" });
    await tick();
    expect(inserts.find((i) => i.tabela === "llm_calls")?.linha).toMatchObject({ run_id: null, origem: "cs:vision", modelo: "gpt-4o", tokens_prompt: 10 });
    inserts.length = 0;
    await comExecucao({ origem: "inbound" }, async (e) => {
      registrarChamadaLlm({ modelo: "gpt-4o-mini", usage: { prompt_tokens: 10, completion_tokens: 5 }, ms: 50, ok: true });
      await tick();
      expect(inserts.find((i) => i.tabela === "llm_calls")?.linha).toMatchObject({ run_id: e.id, origem: "inbound" });
      expect(execucaoAtual()?.llm).toHaveLength(1);
    });
  });
});

describe("quem está por trás da request", () => {
  const jwt = (payload: Record<string, unknown>) =>
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.assinatura`;
  it("e-mail, papel e aal saem do payload do JWT (sem verificar — é atribuição, não autorização)", () => {
    expect(_decodificarJwtParaTeste(jwt({ email: "Julio@LoneMidia.com", app_metadata: { user_role: "manager" }, aal: "aal1" })))
      .toEqual({ email: "julio@lonemidia.com", papel: "manager", aal: "aal1" });
    expect(_decodificarJwtParaTeste("segredo-do-cron")).toBeNull();
  });
  it("header só aceita ASCII: acento cai, resto vira ?", () => {
    expect(asciiSeguro("Júlio César")).toBe("Julio Cesar");
    expect(asciiSeguro("equipe 😀")).toBe("equipe ?");
  });
});

describe("LONE-023: erro do PostgREST que ninguém leu", () => {
  it("reporta 4xx/5xx do /rest/v1, ignora 406 (.single sem linha) e o /auth/v1", () => {
    expect(deveReportar("http://x/rest/v1/clients?id=eq.1", 500)).toBe(true);
    expect(deveReportar("http://x/rest/v1/clients?id=eq.1", 400)).toBe(true);
    expect(deveReportar("http://x/rest/v1/clients?id=eq.1", 406)).toBe(false);
    expect(deveReportar("http://x/auth/v1/user", 401)).toBe(false);
    expect(deveReportar("http://x/rest/v1/clients", 200)).toBe(false);
    expect(tabelaDaUrl("http://x/rest/v1/cs_client_rules?select=id")).toBe("cs_client_rules");
    expect(tabelaDaUrl("http://x/rest/v1/rpc/minha_funcao")).toBe("rpc:minha_funcao");
  });
  it("mesmo erro repetido em 5 min reporta uma vez só", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = () => new Response(JSON.stringify({ code: "PGRST204", message: "Could not find the 'x' column" }), { status: 400 });
    await reportarErroPostgrest("http://x/rest/v1/cs_outbound", "POST", res());
    await reportarErroPostgrest("http://x/rest/v1/cs_outbound", "POST", res());
    await reportarErroPostgrest("http://x/rest/v1/clients", "PATCH", new Response("boom", { status: 500 }));
    const linhas = err.mock.calls.map((c) => String(c[0]));
    expect(linhas.filter((l) => l.includes("POST cs_outbound → 400 PGRST204"))).toHaveLength(1);
    expect(linhas.filter((l) => l.includes("PATCH clients → 500"))).toHaveLength(1);
    err.mockRestore();
  });
});
