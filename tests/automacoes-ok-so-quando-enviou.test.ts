// @vitest-environment node
// Rotina com envio que falhou não responde ok (auditoria 21/10/2026, item 5.12). Dados INVENTADOS.
//
// O QUE ACONTECIA: véspera, raio-x, datas e as reuniões respondiam `ok: true` com o WhatsApp recusando o envio — a
// Central de Automações (que lê o `ok` do topo) mostrava verde e ninguém sabia que a mensagem não saiu.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

let envio: { ok: boolean; error?: string } = { ok: true };
const enviadas: string[] = [];
vi.mock("@/lib/cs/notify", () => ({ csSendGroupText: async (_j: string, t: string) => { enviadas.push(t); return envio; } }));
vi.mock("@/lib/api/cron-guard", () => ({ requireCron: () => null }));
vi.mock("@/lib/supabase/queries", () => ({ fetchContentCards: async () => [] }));
type Linha = Record<string, unknown>;
let reunioesVenda: Linha[] = [];
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gt", "gte", "lte", "is", "or", "not", "update", "insert"]) q[m] = () => q;
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: tabela === "crm_reunioes" ? reunioesVenda : [], error: null }).then(ok);
      return q;
    },
  },
}));
vi.mock("@/lib/crm/grupo-vendas-envio", () => ({ mandarNoGrupoVendas: async (t: string) => { enviadas.push(t); return envio; } }));

const raioX = await import("@/app/api/system/cs-raio-x/route");
const crmReunioes = await import("@/app/api/system/crm-reunioes/route");
const { resultadoDosEnvios } = await import("@/lib/automacoes/envios");
const { okDaResposta } = await import("@/lib/automacoes/saude");

const post = (url: string) => new NextRequest(`https://painel.exemplo.com${url}`, { method: "POST" });

beforeEach(() => { envio = { ok: true }; enviadas.length = 0; reunioesVenda = []; process.env.CS_INTERNAL_GROUP_JID = "interno@g.us"; });

describe("raio-x", () => {
  it("o erro original: WhatsApp recusou e a rotina dizia ok — agora ok:false com o motivo (e a Central vê falha)", async () => {
    envio = { ok: false, error: "HTTP 400 Bad Request" };
    const res = await raioX.POST(post("/api/system/cs-raio-x"));
    const corpo = await res.json();
    expect(corpo.ok).toBe(false);
    expect(corpo.erro).toMatch(/grupo interno: HTTP 400/);
    expect(okDaResposta(res.status, JSON.stringify(corpo))).toBe(false);
  });
  it("sem o grupo interno configurado também é falha (antes passava em silêncio)", async () => {
    delete process.env.CS_INTERNAL_GROUP_JID;
    expect((await (await raioX.POST(post("/api/system/cs-raio-x"))).json()).ok).toBe(false);
  });
  it("enviou: ok", async () => {
    expect((await (await raioX.POST(post("/api/system/cs-raio-x"))).json()).ok).toBe(true);
  });
  it("ensaio (dry) não manda e não é falha", async () => {
    delete process.env.CS_INTERNAL_GROUP_JID;
    expect((await (await raioX.POST(post("/api/system/cs-raio-x?dry=1"))).json()).ok).toBe(true);
  });
});

describe("lembretes das reuniões de venda", () => {
  const daqui = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
  beforeEach(() => {
    reunioesVenda = [{
      id: "r1", lead_id: "l1", inicio: daqui(40), fim: daqui(85), formato: "meet", local: null, meet_url: null, estado: "agendada",
      lembrete_vespera_em: null, lembrete_hora_em: null, criado_em: daqui(-600),
      crm_leads: { empresa: "Loja Exemplo", contato_nome: "Ana", telefone: null, endereco: null, cidade: null },
    }];
  });
  it("o erro original: o envio era ignorado e a rotina dizia ok — agora a falha aparece", async () => {
    envio = { ok: false, error: "HTTP 500" };
    const corpo = await (await crmReunioes.POST(post("/api/system/crm-reunioes"))).json();
    expect(corpo.ok).toBe(false);
    expect(corpo.falhas[0].alvo).toMatch(/grupo de vendas \(Loja Exemplo/);
    expect(corpo.enviados).toEqual([]);
  });
  it("enviou: ok e conta o lembrete", async () => {
    const corpo = await (await crmReunioes.POST(post("/api/system/crm-reunioes"))).json();
    expect(corpo.ok).toBe(true);
    expect(corpo.enviados).toHaveLength(1);
  });
});

describe("regra e as outras rotinas", () => {
  it("resultadoDosEnvios: ok só sem falha, e a frase diz o que não saiu", () => {
    expect(resultadoDosEnvios([])).toEqual({ ok: true, falhas: [] });
    const r = resultadoDosEnvios([{ alvo: "grupo interno", erro: "HTTP 400" }]);
    expect(r.ok).toBe(false);
    expect(r.erro).toBe("1 envio não saiu — grupo interno: HTTP 400");
  });
  it("véspera, datas e reunião mensal fecham a resposta com o resultado dos envios (não mais `ok: true` fixo)", () => {
    for (const rota of ["cs-vespera", "cs-datas", "cs-reuniao-mensal"]) {
      const fonte = readFileSync(`app/api/system/${rota}/route.ts`, "utf8");
      expect(fonte, rota).toContain("...resultadoDosEnvios(falhas)");
      expect(fonte, rota).toMatch(/falhas\.push\(\{ alvo: .*erro: r\.error \?\? "o WhatsApp recusou" \}\)/);
    }
  });
});
