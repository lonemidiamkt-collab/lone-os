// @vitest-environment node
// tests/meta-troca-token.test.ts — 25/10/2026, auditoria 9.5. Dados INVENTADOS.
//
// O QUE ACONTECIA: o login do Facebook voltava e o navegador GRAVAVA o token novo na hora — antes de saber de
// quem era o perfil, que permissões vinham e quantas contas ele alcançava. Perfil errado trocava o token que
// alimenta saldos, alertas, portal e relatórios, e o anterior se perdia. O ?error= do Facebook sumia.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { compararAlcance, escoposFaltando, avisosDaTroca, trocaArriscada, ESCOPOS_LOGIN } from "@/lib/meta/troca-token";
import { erroDoRetorno } from "@/lib/meta/useMetaAds";

const carteira = [{ id: "act_1", nome: "Loja Alfa" }, { id: "act_2", nome: "Loja Beta" }, { id: "3", nome: "Loja Gama" }];

describe("o que muda ao trocar", () => {
  it("de N para M contas, e quais param", () => {
    const a = compararAlcance(carteira, new Set(["act_1"]), new Set(["act_1", "act_2", "act_3"]));
    expect(a).toEqual({ total: 3, novo: 1, atual: 3, perdidas: ["Loja Beta", "Loja Gama"] });
    expect(avisosDaTroca({ perfil: "Fulano", escoposFaltando: [], alcance: a })).toEqual([
      "O token novo alcança 1 de 3 contas da carteira (o atual alcança 3).",
      "Param de atualizar: Loja Beta, Loja Gama.",
    ]);
  });
  it("sem token atual para comparar, perdidas = as que o novo não alcança", () => {
    expect(compararAlcance(carteira, new Set(["act_1", "act_2", "act_3"]), null)).toEqual({ total: 3, novo: 3, atual: null, perdidas: [] });
  });
  it("permissão desmarcada no Facebook aparece, com o que ela segura", () => {
    const faltam = escoposFaltando(ESCOPOS_LOGIN.filter((e) => e !== "ads_read"));
    expect(faltam).toEqual(["ads_read"]);
    const p = { perfil: "x", escoposFaltando: faltam, alcance: compararAlcance(carteira, new Set(["act_1", "act_2", "act_3"]), null) };
    expect(trocaArriscada(p)).toBe(true);
    expect(avisosDaTroca(p).at(-1)).toMatch(/Faltam permissões: ads_read \(saldos, alertas de verba e relatórios\)/);
  });
  it("o erro do Facebook no retorno vira frase", () => {
    expect(erroDoRetorno({ search: "?error=access_denied&error_reason=user_denied&error_description=Permissions+error", hash: "#_=_" }))
      .toMatch(/foi cancelado ou a permissão foi negada\. Nada mudou/);
    expect(erroDoRetorno({ search: "", hash: "#access_token=abc" })).toBeNull();
  });
});

// ─── A rota ───────────────────────────────────────────────────────────────────

const gravadas: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => ({ id: "u1", isAdmin: true }) }));
vi.mock("@/lib/traffic/sync-core", () => ({ getMetaToken: async () => "TOKEN_ATUAL" }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (t: string) => ({
      select: () => Promise.resolve({
        data: t === "ad_accounts" ? [{ meta_account_id: "act_1", account_name: null, clients: { name: "Loja Alfa" } }, { meta_account_id: "act_2", account_name: null, clients: { name: "Loja Beta" } }] : [],
        error: null,
      }),
      upsert: (linhas: Record<string, unknown>[]) => { gravadas.push(...linhas); return Promise.resolve({ error: null }); },
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));
const alcance = vi.hoisted(() => ({ novo: ["act_1", "act_2"], escopos: [] as string[] }));
vi.mock("@/lib/meta/alcance-token", () => ({
  perfilDoToken: async () => ({ ok: true, valor: "Roberto Lino" }),
  escoposConcedidos: async () => ({ ok: true, valor: alcance.escopos }),
  contasDoToken: async (t: string) => ({ ok: true, valor: new Set(t === "TOKEN_ATUAL" ? ["act_1", "act_2"] : alcance.novo) }),
}));

const { POST } = await import("@/app/api/meta/reconectar/route");
const pedir = async (corpo: Record<string, unknown>) => {
  const r = await POST(new NextRequest("http://x/api/meta/reconectar", { method: "POST", body: JSON.stringify(corpo) }));
  return { status: r.status, corpo: await r.json() };
};
let troca: { ok: boolean; json: Record<string, unknown> } = { ok: true, json: { access_token: "LONGO", expires_in: 5184000 } };

beforeEach(() => {
  gravadas.length = 0;
  alcance.novo = ["act_1", "act_2"];
  alcance.escopos = [...ESCOPOS_LOGIN];
  troca = { ok: true, json: { access_token: "LONGO", expires_in: 5184000 } };
  process.env.NEXT_PUBLIC_META_APP_ID = "app";
  process.env.META_APP_SECRET = "segredo";
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: troca.ok, status: troca.ok ? 200 : 400, json: async () => troca.json })));
});

describe("POST /api/meta/reconectar", () => {
  it("o erro original: voltar do login gravava na hora — agora sem confirmar só confere e NÃO grava", async () => {
    const r = await pedir({ token: "CURTO" });
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ gravado: false, arriscada: false, previa: { perfil: "Roberto Lino", alcance: { total: 2, novo: 2, atual: 2 } } });
    expect(gravadas).toEqual([]);
  });

  it("perfil que alcança menos contas: não troca sem a confirmação reforçada", async () => {
    alcance.novo = ["act_1"];
    const r = await pedir({ token: "CURTO", confirmar: true });
    expect(r.status).toBe(409);
    expect(gravadas).toEqual([]);
    const ok = await pedir({ token: "CURTO", confirmar: true, aceitarRisco: true });
    expect(ok.corpo.gravado).toBe(true);
  });

  it("confirmado: estende para 60 dias e grava o LONGO", async () => {
    const r = await pedir({ token: "CURTO", confirmar: true });
    expect(r.corpo).toMatchObject({ ok: true, gravado: true, tipo: "long" });
    expect(gravadas.find((l) => l.key === "meta_token")?.value).toBe("LONGO");
  });

  it("extensão falhou: não troca um token bom por um de ~1h sem perguntar", async () => {
    troca = { ok: false, json: { error: { message: "Invalid client_secret" } } };
    const r = await pedir({ token: "CURTO", confirmar: true });
    expect(r.corpo).toMatchObject({ ok: false, gravado: false, precisaDecidir: "curto" });
    expect(r.corpo.erro).toMatch(/O token atual continua valendo/);
    expect(gravadas).toEqual([]);
    const curto = await pedir({ token: "CURTO", confirmar: true, aceitarCurto: true, expiresIn: 3600 });
    expect(curto.corpo).toMatchObject({ gravado: true, tipo: "short" });
    expect(gravadas.find((l) => l.key === "meta_token")?.value).toBe("CURTO");
  });
});
