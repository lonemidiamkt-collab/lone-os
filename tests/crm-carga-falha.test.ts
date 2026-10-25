// @vitest-environment node
// Carga que falha não vira vazio (auditoria 21/10/2026, item 4.11). Dados INVENTADOS.
//
// O QUE ACONTECIA: a leitura que falhava devolvia [] / null — funil vazio, meta "não definida" (R$ 0), histórico "sem
// registro ainda" e o sino "Tudo em dia". Agora a leitura devolve o erro e cada rota responde 503 com a frase; a tela
// mostra "não consegui carregar" com "Tentar de novo".
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

let falhar = false;
const resultado = () => (falhar ? { data: null, error: { message: "timeout do banco" } } : { data: [], error: null });
vi.mock("@/lib/supabase/server", () => {
  const consulta = () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "order", "eq", "limit", "or", "in"]) q[m] = () => q;
    q.maybeSingle = async () => (falhar ? { data: null, error: { message: "timeout do banco" } } : { data: null, error: null });
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(resultado()).then(ok);
    return q;
  };
  return { supabaseAdmin: { from: consulta } };
});
vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/api/require-role", () => ({ requireRole: async () => ({ user: { email: "socio@exemplo.com" } }) }));
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => ({ email: "lonemidiamkt@gmail.com" }) }));
vi.mock("@/lib/crm/extras", () => ({ carregarExtras: async () => new Map(), EXTRAS_VAZIOS: {} }));
vi.mock("@/lib/prospeccao/config", () => ({ carregarConfig: async () => ({ segmentos: [] }) }));
vi.mock("@/lib/crm/etapas-historico", () => ({ lerHistoricoDeEtapas: async () => ({ ok: true, itens: [] }), registrarEtapa: async () => {} }));

const db = await import("@/lib/supabase/queries");
const leadsRota = await import("@/app/api/crm/leads/route");
const metasRota = await import("@/app/api/crm/metas/route");
const avisosRota = await import("@/app/api/data/notifications/route");
const atividadesRota = await import("@/app/api/crm/activities/route");

beforeEach(() => { falhar = false; });
const get = (url: string) => new NextRequest(`https://painel.exemplo.com${url}`);

describe("a leitura devolve o erro", () => {
  it("funil, meta e histórico LANÇAM na falha (antes: [] e null)", async () => {
    falhar = true;
    await expect(db.fetchCrmLeads()).rejects.toThrow(/Não consegui ler o funil/);
    await expect(db.fetchCrmMeta("2026-10")).rejects.toThrow(/meta do mês/);
    await expect(db.fetchLeadActivities("l1")).rejects.toThrow(/histórico do lead/);
  });
  it("meta não definida continua sendo null (não é erro)", async () => {
    expect(await db.fetchCrmMeta("2026-10")).toBeNull();
  });
  it("avisos: lerNotificacoes diz que falhou; fetchNotifications (carga geral) segue devolvendo []", async () => {
    falhar = true;
    expect(await db.lerNotificacoes("Roberto Lino")).toEqual({ ok: false, erro: "timeout do banco" });
    expect(await db.fetchNotifications()).toEqual([]);
  });
});

describe("as rotas respondem 503, não vazio", () => {
  it("funil", async () => {
    falhar = true;
    const r = await leadsRota.GET(get("/api/crm/leads"));
    expect(r.status).toBe(503);
  });
  it("meta do mês (antes: { meta: null } → 'sem meta', R$ 0)", async () => {
    falhar = true;
    const r = await metasRota.GET(get("/api/crm/metas?mes=2026-10"));
    expect(r.status).toBe(503);
  });
  it("sino (antes: [] → 'Tudo em dia')", async () => {
    falhar = true;
    const r = await avisosRota.GET(get("/api/data/notifications"));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/Não consegui carregar os avisos/);
  });
  it("histórico do lead (antes: 'Sem histórico ainda')", async () => {
    falhar = true;
    const r = await atividadesRota.GET(get("/api/crm/activities?leadId=l1"));
    expect(r.status).toBe(503);
  });
  it("com o banco no ar, tudo 200", async () => {
    expect((await leadsRota.GET(get("/api/crm/leads"))).status).toBe(200);
    expect((await avisosRota.GET(get("/api/data/notifications"))).status).toBe(200);
  });
});
