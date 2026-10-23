// @vitest-environment node
// tests/broadcast-travas.test.ts — recado pontual: pra quem contratou, uma vez por grupo, uma vez
// por chave (auditoria 21/10/2026, item 5.6).
//
// O erro original:
//   • `audiencia=trafego` = "tem conta de anúncio" → cliente só de social (Dumar) recebia recado de tráfego;
//   • chave + DATA: a mesma chave rodada no dia seguinte mandava tudo de novo;
//   • o cadastro "skipped" (divide o grupo) fazia o grupo receber de novo numa segunda rodada;
//   • o erro do registro era ignorado.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ligarRelogioFalso, esperarComRelogioFalso } from "./fixtures/relogio-falso";

type Linha = { client_id: string; date_key: string; status: string; error?: string | null };
const log: Linha[] = [];
let insertFalha = false;

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: () => {
      const filtros: ((r: Record<string, unknown>) => boolean)[] = [];
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (c: string, v: unknown) => { filtros.push((r) => r[c] === v); return q; };
      q.in = (c: string, vs: unknown[]) => { filtros.push((r) => vs.includes(r[c])); return q; };
      q.insert = (row: Linha | Linha[]) => {
        if (insertFalha) return Promise.resolve({ error: { message: "sem conexão com o banco" } });
        log.push(...[row].flat());
        return Promise.resolve({ error: null });
      };
      q.then = (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) =>
        Promise.resolve({ data: log.filter((r) => filtros.every((f) => f(r as never))), error: null }).then(ok, erro);
      return q;
    },
  },
}));

const CLIENTES = [
  { id: "maric", name: "Bazar Ribeiro Maricá", nome_fantasia: null, service_type: "lone_growth", meta_ad_account_id: "act_1", whatsapp_group_jid: "bazar@g.us" },
  { id: "saqua", name: "Bazar Ribeiro Saquarema", nome_fantasia: null, service_type: "lone_growth", meta_ad_account_id: "act_2", whatsapp_group_jid: "bazar@g.us" },
  { id: "dumar", name: "Dumar", nome_fantasia: null, service_type: "assessoria_social", meta_ad_account_id: "act_3", whatsapp_group_jid: "dumar@g.us" },
];
const csSendGroupText = vi.fn();
const sendGroupText = vi.fn();

vi.mock("@/lib/api/cron-guard", () => ({ requireCron: () => null }));
vi.mock("@/lib/traffic/weekly-report", () => ({
  selectActiveClientsWithGroup: async () => CLIENTES,
  clientDisplayName: (c: { nome_fantasia: string | null; name: string }) => c.nome_fantasia || c.name,
}));
vi.mock("@/lib/cs/notify", () => ({ csSendGroupText: (...a: unknown[]) => csSendGroupText(...a) }));
vi.mock("@/lib/whatsapp/evolution", () => ({ sendGroupText: (...a: unknown[]) => sendGroupText(...a) }));
vi.mock("@/lib/system/trava-rodada", () => ({
  reservarRodada: async () => ({ conseguiu: true }),
  fecharRodada: async () => {},
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/system/broadcast/route";
import { lerAudiencia, filtrarAudiencia, chaveDoRegistro, gruposJaAtendidos } from "@/lib/system/broadcast";
import { agruparPorGrupo, juntarNomes } from "@/lib/whatsapp/grupo-compartilhado";

// A pausa de 2,5 s entre grupos passa no relógio falso; a folga é só pra máquina carregada.
vi.setConfig({ testTimeout: 30_000 });

const TEXTO = "Oi, pessoal! Recado rápido da Lone sobre o fim do mês.";
const disparar = async (qs: string) => {
  const res = await esperarComRelogioFalso(POST(new NextRequest(`http://localhost/api/system/broadcast?${qs}`, {
    method: "POST", body: JSON.stringify({ texto: TEXTO }),
  })));
  return { status: res.status, body: await res.json() as Record<string, unknown> };
};
/** Envios ao CLIENTE (o aviso interno também sai por csSendGroupText). */
const enviosAoCliente = () => csSendGroupText.mock.calls.filter((c) => (c[3] as { destino?: string })?.destino === "cliente").map((c) => c[0]);

beforeEach(() => {
  log.length = 0;
  insertFalha = false;
  csSendGroupText.mockReset().mockResolvedValue({ ok: true });
  sendGroupText.mockReset().mockResolvedValue({ ok: true });
  process.env.CS_INTERNAL_GROUP_JID = "interno@g.us";
  ligarRelogioFalso();
});
afterEach(() => { vi.useRealTimers(); });

describe("regras puras", () => {
  it("audiência é pelo CONTRATO: Dumar (só social, com conta) não é tráfego", () => {
    expect(filtrarAudiencia(CLIENTES, "trafego").map((c) => c.id)).toEqual(["maric", "saqua"]);
    expect(filtrarAudiencia(CLIENTES, "social").map((c) => c.id)).toEqual(["dumar"]);
    expect(filtrarAudiencia(CLIENTES, "todos")).toHaveLength(3);
  });

  it("audiência desconhecida é recusada — erro de digitação não vira 'todos'", () => {
    expect(lerAudiencia("trafeg")).toBeNull();
    expect(lerAudiencia(null)).toBe("todos");
    expect(lerAudiencia("TRAFEGO")).toBe("trafego");
  });

  it("a chave do registro não tem data — a mesma chave é o mesmo recado em qualquer dia", () => {
    expect(chaveDoRegistro("fim-de-mes-2026-10")).toBe("broadcast:fim-de-mes-2026-10");
  });

  it("um cadastro do grupo recebeu → o grupo inteiro recebeu; incerto também conta", () => {
    const jids = new Map([["maric", "bazar@g.us"], ["saqua", "bazar@g.us"], ["dumar", "dumar@g.us"]]);
    const atendidos = gruposJaAtendidos([
      { client_id: "saqua", status: "sent" },
      { client_id: "dumar", status: "failed", error: "INCERTO — o WhatsApp não respondeu" },
    ], jids);
    expect([...atendidos].sort()).toEqual(["bazar@g.us", "dumar@g.us"]);
    expect(gruposJaAtendidos([{ client_id: "dumar", status: "failed", error: "HTTP 400" }], jids).size).toBe(0);
  });

  it("grupo compartilhado vira UM destino, com os nomes juntos", () => {
    const g = agruparPorGrupo(CLIENTES);
    expect(g.map((x) => x.jid)).toEqual(["bazar@g.us", "dumar@g.us"]);
    expect(juntarNomes(g[0].clientes.map((c) => c.name))).toBe("Bazar Ribeiro Maricá e Bazar Ribeiro Saquarema");
    expect(juntarNomes(["A", "B", "C"])).toBe("A, B e C");
    expect(juntarNomes(["A", "A"])).toBe("A");
  });
});

describe("rota", () => {
  it("audiencia=trafego não chega ao Dumar", async () => {
    await disparar("audiencia=trafego&chave=t1");
    expect(enviosAoCliente()).toEqual(["bazar@g.us"]);
  });

  it("audiência inválida → 400, nada sai", async () => {
    const r = await disparar("audiencia=trafeg&chave=t2");
    expect(r.status).toBe(400);
    expect(csSendGroupText).not.toHaveBeenCalled();
  });

  it("segunda rodada com a mesma chave não repete — nem pelo cadastro 'skipped' do grupo dividido", async () => {
    csSendGroupText.mockImplementation(async (jid: string) =>
      jid === "dumar@g.us" ? { ok: false, error: "HTTP 400" } : { ok: true });
    sendGroupText.mockResolvedValue({ ok: false, error: "HTTP 400" }); // gestor também fora do grupo
    await disparar("chave=t3");
    expect(enviosAoCliente()).toEqual(["bazar@g.us", "dumar@g.us"]);

    csSendGroupText.mockReset().mockResolvedValue({ ok: true });
    const r2 = await disparar("chave=t3");
    expect(enviosAoCliente()).toEqual(["dumar@g.us"]);              // só quem falhou
    expect(r2.body).toMatchObject({ enviados: 1, jaTinham: 1 });
  });

  it("timeout do agente NÃO cai pro número do gestor, e o grupo não recebe de novo", async () => {
    csSendGroupText.mockImplementation(async (_jid: string, _t: string, _q: unknown, meta: { destino?: string }) =>
      meta?.destino === "cliente" ? { ok: false, incerto: true, error: "o WhatsApp não respondeu em 10 s — pode ter saído" } : { ok: true });
    const r = await disparar("audiencia=social&chave=t4");
    expect(sendGroupText).not.toHaveBeenCalled();
    expect((r.body.incertos as unknown[]).length).toBe(1);

    csSendGroupText.mockReset().mockResolvedValue({ ok: true });
    await disparar("audiencia=social&chave=t4");
    expect(enviosAoCliente()).toEqual([]);
  });

  it("registro que falha depois do envio vai pro time", async () => {
    insertFalha = true;
    const r = await disparar("audiencia=social&chave=t5");
    expect(r.body.semRegistro).toEqual(["Dumar"]);
    const aviso = csSendGroupText.mock.calls.map((c) => String(c[1])).find((t) => t.includes("não consegui registrar"));
    expect(aviso).toBeTruthy();
  });
});
