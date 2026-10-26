// tests/mesa-gestor.test.ts — a Mesa do Gestor de tráfego (26/10/2026): conferência do "Já fiz", resumo da semana,
// fonte que falhou e o diagnóstico com um item por criativo/conjunto, só do que ainda está gastando.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { proximaConferencia } from "@/lib/priority/conferencia";

type Res = { data: unknown[] | null; error: { message: string } | null };
const respostas: Record<string, Res> = {};
function consulta(tabela: string) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "not", "neq", "or", "is", "gte", "lte", "in", "eq", "order", "limit", "ilike", "gt"]) q[m] = () => q;
  q.then = (ok: (r: Res) => unknown, erro?: (e: unknown) => unknown) =>
    Promise.resolve(respostas[tabela] ?? { data: [], error: null }).then(ok, erro);
  return q;
}
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: (t: string) => consulta(t) } }));

const { resumoDaSemana } = await import("@/lib/priority/mesa");
const { fontesSemLeitura } = await import("@/lib/priority/repo");
const { montarDiagnostico } = await import("@/lib/traffic/diagnostico");

const agora = new Date("2026-10-26T15:00:00Z");
const horasAtras = (h: number) => new Date(agora.getTime() - h * 3_600_000).toISOString();

describe("conferência do 'Já fiz'", () => {
  it("antes de 24 h não confere", () => {
    expect(proximaConferencia({ decidido_em: horasAtras(5), resultado: "aguardando" }, true, agora)).toBeNull();
  });
  it("no 1º dia: sumiu = confirmado no 1º dia; ainda aparece = voltou", () => {
    expect(proximaConferencia({ decidido_em: horasAtras(25), resultado: "aguardando" }, false, agora)).toEqual({ resultado: "confirmado_1d", etapa: "1d" });
    expect(proximaConferencia({ decidido_em: horasAtras(25), resultado: "aguardando" }, true, agora)).toEqual({ resultado: "voltou", etapa: "1d" });
  });
  it("entre o 1º e o 3º dia, já confirmado, espera", () => {
    expect(proximaConferencia({ decidido_em: horasAtras(48), resultado: "confirmado_1d" }, false, agora)).toBeNull();
  });
  it("no 3º dia fecha: resolvido ou voltou (mesmo se a do 1º dia não rodou)", () => {
    expect(proximaConferencia({ decidido_em: horasAtras(73), resultado: "confirmado_1d" }, false, agora)).toEqual({ resultado: "resolvido", etapa: "3d" });
    expect(proximaConferencia({ decidido_em: horasAtras(80), resultado: "confirmado_1d" }, true, agora)).toEqual({ resultado: "voltou", etapa: "3d" });
    expect(proximaConferencia({ decidido_em: horasAtras(90), resultado: null }, false, agora)).toEqual({ resultado: "resolvido", etapa: "3d" });
  });
  it("terminada não confere de novo", () => {
    expect(proximaConferencia({ decidido_em: horasAtras(100), resultado: "resolvido" }, true, agora)).toBeNull();
    expect(proximaConferencia({ decidido_em: horasAtras(100), resultado: "voltou" }, false, agora)).toBeNull();
  });
});

describe("fonte que falhou não resolve nada", () => {
  it("erro da fonte de alarmes vale para os itens de tráfego", () => {
    const s = fontesSemLeitura(["alarmes: timeout", "saude: 502", "conferência: x"]);
    expect(s.has("trafego")).toBe(true);
    expect(s.has("saude")).toBe(true);
    expect(s.has("producao")).toBe(false);
  });
});

describe("resumo da semana", () => {
  it("decididos, taxa, mediana até decidir e o desfecho dos feitos", () => {
    const r = resumoDaSemana([
      { created_at: horasAtras(30), estado: "executada", decidido_em: horasAtras(26), resultado: "resolvido" },
      { created_at: horasAtras(20), estado: "executada", decidido_em: horasAtras(10), resultado: "voltou" },
      { created_at: horasAtras(12), estado: "ignorada", decidido_em: horasAtras(6), resultado: null },
      { created_at: horasAtras(5), estado: "nova", decidido_em: null, resultado: null },
      { created_at: horasAtras(4), estado: "vista", decidido_em: null, resultado: null },
    ]);
    expect(r).toMatchObject({ recebidos: 5, decididos: 3, taxa: 60, feitos: 2, resolvidos: 1, voltaram: 1 });
    expect(r.horasAteDecidir).toBe(6); // 4, 10, 6 → mediana 6
  });
  it("semana vazia não inventa taxa", () => {
    expect(resumoDaSemana([])).toMatchObject({ recebidos: 0, taxa: null, horasAteDecidir: null });
  });
});

describe("diagnóstico: um item por criativo, só do que ainda está gastando", () => {
  const CLIENTES = [{ id: "c1", name: "Reformar", nome_fantasia: null, meta_ad_account_id: "act_1", active: true, draft_status: null }];
  const ad = (id: string, nome: string, data: string, gasto: number, conv = 0) =>
    ({ client_id: "c1", nivel: "ad", entity_id: id, entity_name: nome, campaign_name: "MSG", adset_name: "CJ", metric_date: data, spend: gasto, impressions: 500, clicks: 5, ctr: 1, frequency: 1.2, conversions: conv, cost_per_conversion: null });

  beforeEach(() => {
    for (const k of Object.keys(respostas)) delete respostas[k];
    respostas.clients = { data: CLIENTES, error: null };
  });

  it("anúncios com o mesmo nome viram um criativo, com a quantidade e os ids", async () => {
    respostas.meta_entity_snapshots = { data: [
      ad("a1", "ADS - PISO", "2026-10-24", 20), ad("a2", "ADS - PISO", "2026-10-24", 15), ad("a3", "ADS - PISO", "2026-10-25", 12),
    ], error: null };
    const d = await montarDiagnostico(agora);
    const itens = d.funcoes.find((f) => f.nome === "Desperdício")!.itens;
    expect(itens).toHaveLength(1);
    expect(itens[0].achado).toContain("(3 anúncios com esse criativo)");
    expect(itens[0].acao).toContain("Pausar os 3 anúncios desse criativo");
    expect(itens[0].entidade).toMatchObject({ nivel: "criativo", chave: "ADS - PISO" });
    expect(itens[0].entidade!.ids.sort()).toEqual(["a1", "a2", "a3"]);
  });

  it("criativo que não gastou no último dia com dado já foi pausado: sai da lista", async () => {
    respostas.meta_entity_snapshots = { data: [
      ad("a1", "ADS - PAUSADO", "2026-10-23", 30), ad("a1", "ADS - PAUSADO", "2026-10-24", 25),
      ad("b1", "ADS - RODANDO", "2026-10-24", 25), ad("b1", "ADS - RODANDO", "2026-10-25", 20),
    ], error: null };
    const d = await montarDiagnostico(agora);
    const nomes = d.funcoes.find((f) => f.nome === "Desperdício")!.itens.map((i) => i.entidade?.nome);
    expect(nomes).toEqual(["ADS - RODANDO"]);
  });

  it("o último dia é o do dado do cliente, não 'ontem' (a coleta não roda no fim de semana)", async () => {
    // Domingo: o último dado é de sexta (23). Quem gastou na sexta ainda conta como rodando.
    respostas.meta_entity_snapshots = { data: [ad("a1", "ADS - SEXTA", "2026-10-22", 30), ad("a1", "ADS - SEXTA", "2026-10-23", 20)], error: null };
    const d = await montarDiagnostico(new Date("2026-10-25T15:00:00Z"));
    expect(d.funcoes.find((f) => f.nome === "Desperdício")!.itens).toHaveLength(1);
  });
});
