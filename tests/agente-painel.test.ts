// tests/agente-painel.test.ts — /agente › Desempenho e o selo da IA (auditoria 25/10/2026, 11.7).
//
// O erro original: as cinco consultas ignoravam o erro (ok:true com "0 sugeridas", "Nada aprendido
// ainda") e o selo "IA ok" só olhava se a chave existia — com a OpenAI sem crédito (25/09) mostraria ok.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { seloDaIa } from "@/lib/ia/selo-ia";
import type { IaFora } from "@/lib/ia/saude-ia";

type Res = { data: unknown; error: { message: string } | null };
const respostas: Record<string, Res> = {};
function consulta(tabela: string) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "gte", "gt", "eq", "order", "limit", "not", "in", "is"]) q[m] = () => q;
  q.maybeSingle = () => q;
  q.then = (ok: (r: Res) => unknown, erro?: (e: unknown) => unknown) =>
    Promise.resolve(respostas[tabela] ?? { data: [], error: null }).then(ok, erro);
  return q;
}
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: (t: string) => consulta(t) } }));
vi.mock("@/lib/api/cron-guard", () => ({ isCronRequest: () => true }));
vi.mock("@/lib/ai/openai", () => ({ isOpenAIConfigured: () => true }));

const FORA: IaFora = {
  causa: { chave: "openai-sem-credito", titulo: "OpenAI sem crédito", explicacao: "", acao: "Recarregar." },
  desde: "2026-09-25T10:30:00Z", falhas: 42, porFrente: [],
};

describe("o selo da IA", () => {
  it("o erro original: chave configurada não é 'IA ok' se as chamadas estão falhando", () => {
    expect(seloDaIa({ chaveConfigurada: true, ia: FORA, registroLido: true })).toMatchObject({ estado: "fora", texto: "IA fora: OpenAI sem crédito" });
  });
  it("sem chave: desligada; registro que não leu: 'não consegui conferir', nunca ok", () => {
    expect(seloDaIa({ chaveConfigurada: false, ia: null, registroLido: true }).estado).toBe("desligada");
    expect(seloDaIa({ chaveConfigurada: true, ia: null, registroLido: false }).estado).toBe("nao_conferida");
    expect(seloDaIa({ chaveConfigurada: true, ia: null, registroLido: true }).estado).toBe("ok");
  });
});

describe("GET /api/cs/dashboard", () => {
  beforeEach(() => { for (const k of Object.keys(respostas)) delete respostas[k]; });
  const chamar = async () => {
    const { GET } = await import("@/app/api/cs/dashboard/route");
    const r = await GET(new Request("http://x/api/cs/dashboard") as never);
    return r.json();
  };

  it("seção que falha vem null e com o nome em `falhas` — nunca '0 sugeridas'", async () => {
    respostas.cs_demandas = { data: null, error: { message: "timeout" } };
    respostas.cs_client_rules = { data: null, error: { message: "timeout" } };
    const j = await chamar();
    expect(j.acuracia).toBeNull();
    expect(j.recentes).toBeNull();
    expect(j.aprendizado).toBeNull();
    expect(j.falhas).toEqual(expect.arrayContaining(["demandas dos últimos 30 dias", "o que o agente aprendeu"]));
  });

  it("tudo lido: sem falhas, e o selo vem de llm_calls", async () => {
    respostas.llm_calls = { data: [], error: null };
    const j = await chamar();
    expect(j.falhas).toEqual([]);
    expect(j.acuracia).not.toBeNull();
    expect(j.config.ia.estado).toBe("ok");
    expect(j.config.iaOk).toBe(true);
  });

  it("registro da IA que não lê: o selo não diz ok", async () => {
    respostas.llm_calls = { data: null, error: { message: "x" } };
    const j = await chamar();
    expect(j.config.ia.estado).toBe("nao_conferida");
    expect(j.config.iaOk).toBe(false);
  });
});
