// @vitest-environment node
// "Aconteceu" / "Não veio" com Desfazer (auditoria 21/10/2026, item 4.6). Dados INVENTADOS.
//
// O QUE ACONTECIA: registrar o resultado da reunião não tinha volta, e a falha ao gravar era ignorada ("Registrado").
// Agora: falha aparece; e o Desfazer volta a reunião para agendada e tira o registro do lead, nos primeiros minutos.
import { describe, it, expect, vi, beforeEach } from "vitest";

type Linha = Record<string, unknown>;
let reuniao: Linha;
let falharUpdate = false;
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: () => {
      let dados: Linha | null = null;
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "order", "limit"]) q[m] = () => q;
      q.update = (d: Linha) => { dados = d; return q; };
      q.maybeSingle = async () => ({ data: dados ? null : { ...reuniao }, error: null });
      q.then = (ok: (v: unknown) => unknown) => {
        if (dados && falharUpdate) return Promise.resolve({ data: null, error: { message: "banco fora" } }).then(ok);
        if (dados) Object.assign(reuniao, dados);
        return Promise.resolve({ data: [], error: null }).then(ok);
      };
      return q;
    },
  },
}));
vi.mock("@/lib/supabase/queries", () => ({
  fetchCrmLeadById: async () => ({ id: "l1", contatoNome: "Ana", empresa: "Loja Exemplo", telefone: null, email: null }),
  updateCrmLead: async () => ({}),
  insertLeadActivity: async () => ({ id: "nota1" }),
}));
const registros: unknown[] = [];
const desfeitos: unknown[] = [];
vi.mock("@/lib/crm/registrar-atividade", () => ({
  registrarAtividade: async (p: unknown) => { registros.push(p); return { desfazer: { leadId: "l1", atividadeIds: ["a9"], antes: {}, depois: {} } }; },
  desfazerRegistro: async (d: unknown) => { desfeitos.push(d); return { ok: true, lead: null, mantidos: [] }; },
}));
vi.mock("@/lib/crm/grupo-vendas-envio", () => ({ mandarNoGrupoVendas: async () => ({ ok: true }) }));
vi.mock("@/lib/crm/etapas-historico", () => ({ registrarEtapa: async () => {} }));
vi.mock("@/lib/prospeccao/google", () => ({}));

const { registrarResultado, desfazerResultado } = await import("@/lib/crm/reunioes-server");

beforeEach(() => {
  reuniao = { id: "r1", lead_id: "l1", inicio: "2026-10-24T13:00:00Z", fim: "2026-10-24T13:45:00Z", formato: "meet", estado: "agendada", atualizado_em: "2026-10-20T12:00:00Z", criado_em: "2026-10-20T12:00:00Z" };
  falharUpdate = false; registros.length = 0; desfeitos.length = 0;
});

describe("registrar o resultado", () => {
  it("o erro original: o banco recusava e a tela dizia 'Registrado' — agora a falha volta", async () => {
    falharUpdate = true;
    const r = await registrarResultado("r1", "realizada", null, "Roberto");
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/banco fora/);
    expect(registros).toHaveLength(0);
  });
  it("'Aconteceu' devolve o desfazer do registro no lead", async () => {
    const r = await registrarResultado("r1", "realizada", null, "Roberto");
    expect(r).toMatchObject({ ok: true, desfazer: { leadId: "l1", atividadeIds: ["a9"] } });
    expect(reuniao.estado).toBe("realizada");
  });
});

describe("Desfazer", () => {
  it("volta a reunião para agendada e desfaz o registro no lead", async () => {
    reuniao.estado = "realizada";
    reuniao.atualizado_em = new Date().toISOString();
    const r = await desfazerResultado("r1", { leadId: "l1", atividadeIds: ["a9"], antes: {}, depois: {} });
    expect(r.ok).toBe(true);
    expect(reuniao.estado).toBe("agendada");
    expect(desfeitos).toHaveLength(1);
  });
  it("passado o prazo, não mexe", async () => {
    reuniao.estado = "nao_veio";
    reuniao.atualizado_em = new Date(Date.now() - 20 * 60_000).toISOString();
    const r = await desfazerResultado("r1", null);
    expect(r.ok).toBe(false);
    expect(reuniao.estado).toBe("nao_veio");
  });
  it("registro de outro lead é recusado", async () => {
    reuniao.estado = "realizada";
    reuniao.atualizado_em = new Date().toISOString();
    expect((await desfazerResultado("r1", { leadId: "l2", atividadeIds: [], antes: {}, depois: {} })).ok).toBe(false);
    expect(reuniao.estado).toBe("realizada");
  });
});
