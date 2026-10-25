// tests/traffic-diagnostico-falhas.test.ts — fonte que não foi lida não vira "nada fora do lugar"
// (auditoria 25/10/2026, 11.6).
//
// O erro original: as cinco consultas do diagnóstico ignoravam o erro. Falha nos clientes saía como
// "0 contas, nada fora do lugar hoje"; falha em metric_snapshots, como "nenhum gasto ontem" em TODAS as
// contas (e todas iam para "Contas sem entrega").

import { describe, it, expect, vi, beforeEach } from "vitest";

type Res = { data: unknown[] | null; error: { message: string } | null };
const respostas: Record<string, Res> = {};

// Builder encadeável: qualquer filtro devolve o mesmo objeto; aguardar devolve a resposta da tabela.
function consulta(tabela: string) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "not", "neq", "or", "is", "gte", "lte", "in", "eq", "order", "limit"]) q[m] = () => q;
  q.then = (ok: (r: Res) => unknown, erro?: (e: unknown) => unknown) =>
    Promise.resolve(respostas[tabela] ?? { data: [], error: null }).then(ok, erro);
  return q;
}
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: (t: string) => consulta(t) } }));

const { montarDiagnostico } = await import("@/lib/traffic/diagnostico");
const { legendaDiagnostico, diagnosticoPdfHtml } = await import("@/lib/reports/diagnosticoPdf");

const AGORA = new Date("2026-10-25T12:00:00Z");
const CLIENTES = [
  { id: "c1", name: "Bazar", nome_fantasia: null, meta_ad_account_id: "act_1", active: true, draft_status: null },
  { id: "c2", name: "Dijana", nome_fantasia: null, meta_ad_account_id: "act_2", active: true, draft_status: null },
];

beforeEach(() => {
  for (const k of Object.keys(respostas)) delete respostas[k];
  respostas.clients = { data: CLIENTES, error: null };
});

describe("diagnóstico com fonte que falhou", () => {
  it("sem os clientes: falha geral (quem chama diz 'não consegui'), não '0 contas'", async () => {
    respostas.clients = { data: null, error: { message: "timeout" } };
    await expect(montarDiagnostico(AGORA)).rejects.toThrow(/clientes de tráfego/);
  });

  it("o erro original: gasto diário que não leu deixava TODA conta 'sem entrega'", async () => {
    respostas.metric_snapshots = { data: null, error: { message: "502" } };
    const d = await montarDiagnostico(AGORA);
    const semEntrega = d.funcoes.find((f) => f.nome === "Contas sem entrega")!;
    expect(semEntrega.itens).toEqual([]);
    expect(semEntrega.semDado).toMatch(/Não consegui ler gasto diário/);
    expect(d.gastoOntem).toBeNull();
    expect(d.falhas).toEqual(["gasto diário das contas"]);
  });

  it("a legenda e o PDF dizem o que não foi lido — nada de 'nada fora do lugar'", async () => {
    respostas.metric_snapshots = { data: null, error: { message: "502" } };
    const d = await montarDiagnostico(AGORA);
    const legenda = legendaDiagnostico(d);
    expect(legenda).not.toMatch(/nada fora do lugar/);
    expect(legenda).toMatch(/Não consegui ler gasto diário das contas/);
    const html = diagnosticoPdfHtml(d, "");
    expect(html).toContain("gasto de ontem não lido");
    expect(html).toContain("⚠ Contas sem entrega");
    expect(html).not.toContain("R$&nbsp;0,00 investidos ontem");
  });

  it("anúncios que não leram: as seções que dependem deles ficam 'não verificadas'", async () => {
    respostas.meta_entity_snapshots = { data: null, error: { message: "x" } };
    const d = await montarDiagnostico(AGORA);
    for (const nome of ["Desperdício", "Verba mal distribuída", "Acima da meta do cliente", "Criativo cansado", "Merece mais verba"]) {
      expect(d.funcoes.find((f) => f.nome === nome)!.semDado).toBeTruthy();
    }
    expect(d.funcoes.find((f) => f.nome === "Anomalias")!.semDado).toBeUndefined();
  });

  it("tudo lido: nenhuma falha, e o 'nada fora do lugar' continua valendo", async () => {
    respostas.metric_snapshots = { data: [
      { client_id: "c1", spend: 50, conversions: 3, metric_date: "2026-10-24" },
      { client_id: "c2", spend: 40, conversions: 2, metric_date: "2026-10-24" },
    ], error: null };
    const d = await montarDiagnostico(AGORA);
    expect(d.falhas).toEqual([]);
    expect(d.funcoes.every((f) => !f.semDado)).toBe(true);
    expect(legendaDiagnostico(d)).toMatch(/nada fora do lugar/);
  });
});
