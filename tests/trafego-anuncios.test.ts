// tests/trafego-anuncios.test.ts — a aba "Anúncios Meta" lê o que o servidor guardou (Leva 4).
// Regras puras (período, mapeamento, resumo, frescor, limite de atualização, conexão) e o núcleo do
// servidor (lib/trafego/anuncios-server.ts) com Supabase e Meta falsos.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  chavePeriodo, lerPeriodo, diasDoPeriodo, argumentosMeta, rotuloPeriodo,
  mapearObjetivo, mapearCampanhas, resumirCampanhas,
  quandoFoi, rotuloAtualizado, podeSincronizar, precisaAtualizar,
  estadoDoToken, conexaoRecusada, mensagemConexao, ERRO_TOKEN, INTERVALO_MINIMO_MIN, VELHO_APOS_MIN,
} from "@/lib/trafego/anuncios";

const HOJE = "2026-09-24";
const AGORA = Date.parse("2026-09-24T15:00:00.000Z"); // 12:00 em São Paulo
const minAtras = (m: number) => new Date(AGORA - m * 60_000).toISOString();

describe("período", () => {
  it("preset e intervalo viram chave e voltam", () => {
    expect(chavePeriodo({ tipo: "preset", dias: 7 })).toBe("7d");
    expect(lerPeriodo("30d", HOJE)).toEqual({ tipo: "preset", dias: 30 });
    const p = lerPeriodo("2026-09-01_2026-09-15", HOJE);
    expect(p).toEqual({ tipo: "intervalo", de: "2026-09-01", ate: "2026-09-15" });
    expect(chavePeriodo(p!)).toBe("2026-09-01_2026-09-15");
  });

  it("recusa preset fora da lista, data impossível, invertida, no futuro ou longa demais", () => {
    expect(lerPeriodo("8d", HOJE)).toBeNull();
    expect(lerPeriodo("2026-02-30_2026-03-01", HOJE)).toBeNull();
    expect(lerPeriodo("2026-09-15_2026-09-01", HOJE)).toBeNull();
    expect(lerPeriodo("2026-09-20_2026-09-25", HOJE)).toBeNull();
    expect(lerPeriodo("2025-01-01_2026-09-20", HOJE)).toBeNull();
    expect(lerPeriodo("", HOJE)).toBeNull();
    expect(lerPeriodo("7d; drop table", HOJE)).toBeNull();
  });

  it("dias, argumentos da Meta e rótulo", () => {
    const intervalo = lerPeriodo("2026-09-01_2026-09-15", HOJE)!;
    expect(diasDoPeriodo(intervalo)).toBe(15);
    expect(argumentosMeta(intervalo)).toEqual({ dias: 15, de: "2026-09-01", ate: "2026-09-15" });
    expect(argumentosMeta({ tipo: "preset", dias: 14 })).toEqual({ dias: 14 });
    expect(rotuloPeriodo({ tipo: "preset", dias: 7 })).toBe("Últimos 7 dias");
    expect(rotuloPeriodo(intervalo)).toBe("01/09 – 15/09");
  });
});

describe("campanhas", () => {
  const dono = { clientId: "c1", clientName: "Padaria", accountId: "act_1" };

  it("objetivo da Meta (OUTCOME_* e antigo)", () => {
    expect(mapearObjetivo("OUTCOME_LEADS")).toBe("leads");
    expect(mapearObjetivo("OUTCOME_SALES")).toBe("conversions");
    expect(mapearObjetivo("MESSAGES")).toBe("messages");
    expect(mapearObjetivo(undefined)).toBe("engagement");
  });

  it("campanha que falhou FICA na lista, marcada (nunca some nem vira R$0 de verdade)", () => {
    const out = mapearCampanhas([
      { id: "1", name: "Boa", objective: "OUTCOME_LEADS", status: "active", spend: 100, leads: 10, hasData: true, dailyMetrics: [{ date: "2026-09-20", spend: 100, impressions: 1, clicks: 1, conversions: 0 }] },
      { id: "2", name: "Quebrada", error: true, insightsFailed: true, hasData: false },
      { nada: "sem id" },
      null,
    ], dono);
    expect(out.map((c) => c.id)).toEqual(["1", "2"]);
    expect(out[0]).toMatchObject({ clientId: "c1", clientName: "Padaria", accountId: "act_1", objective: "leads", status: "active", insightsFailed: false, hasData: true });
    expect(out[1]).toMatchObject({ insightsFailed: true, hasData: false, spend: 0 });
    expect(mapearCampanhas("lixo", dono)).toEqual([]);
  });

  it("resumo por cliente não soma campanha sem dados", () => {
    const camps = mapearCampanhas([
      { id: "1", status: "active", spend: 100, results: 5, leads: 5, messages: 0, clicks: 10, impressions: 1000, hasData: true },
      { id: "2", status: "paused", spend: 50, results: 2, leads: 0, messages: 2, clicks: 5, impressions: 500, hasData: true },
      { id: "3", status: "active", spend: 999, insightsFailed: true },
    ], dono);
    expect(resumirCampanhas(camps)).toEqual({ spend: 150, results: 7, leads: 5, messages: 2, clicks: 15, impressions: 1500, campanhas: 3, ativas: 2, semDados: 1 });
  });
});

describe("frescor e limite de atualização", () => {
  it("quando foi / atualizado há", () => {
    expect(quandoFoi(null, AGORA)).toBeNull();
    expect(quandoFoi(minAtras(0), AGORA)).toBe("agora");
    expect(quandoFoi(minAtras(12), AGORA)).toBe("há 12 min");
    expect(quandoFoi(minAtras(180), AGORA)).toBe("há 3 h");
    expect(quandoFoi("2026-09-22T11:40:00.000Z", AGORA)).toBe("em 22/09 às 08:40"); // hora de SP
    expect(rotuloAtualizado(minAtras(12), AGORA)).toBe("atualizado há 12 min");
    expect(rotuloAtualizado(null, AGORA)).toBe("ainda não sincronizado");
  });

  it(`uma leitura por cliente+período a cada ${INTERVALO_MINIMO_MIN} min (conta a tentativa, boa ou não)`, () => {
    expect(podeSincronizar(null, AGORA)).toEqual({ pode: true, esperarMin: 0 });
    expect(podeSincronizar(minAtras(2), AGORA)).toEqual({ pode: false, esperarMin: 3 });
    expect(podeSincronizar(minAtras(INTERVALO_MINIMO_MIN), AGORA).pode).toBe(true);
  });

  it(`atualiza sozinho ao abrir quando a leitura tem ${VELHO_APOS_MIN} min ou nunca houve`, () => {
    expect(precisaAtualizar(null, AGORA)).toBe(true);
    expect(precisaAtualizar(minAtras(VELHO_APOS_MIN - 1), AGORA)).toBe(false);
    expect(precisaAtualizar(minAtras(VELHO_APOS_MIN), AGORA)).toBe(true);
  });
});

describe("conexão com a Meta", () => {
  it("estado do token", () => {
    expect(estadoDoToken(null, null, AGORA)).toBe("ausente");
    expect(estadoDoToken("t", AGORA - 1, AGORA)).toBe("expirada");
    expect(estadoDoToken("t", AGORA + 1, AGORA)).toBe("ok");
    expect(estadoDoToken("t", null, AGORA)).toBe("ok");
  });

  it("a tentativa MAIS RECENTE decide se a Meta recusou o token", () => {
    expect(conexaoRecusada([
      { tentativaEm: minAtras(30), erro: null },
      { tentativaEm: minAtras(5), erro: ERRO_TOKEN },
    ])).toBe(true);
    expect(conexaoRecusada([
      { tentativaEm: minAtras(30), erro: ERRO_TOKEN },
      { tentativaEm: minAtras(5), erro: null },
    ])).toBe(false);
    expect(conexaoRecusada([])).toBe(false);
  });

  it("mensagem aponta onde reconectar", () => {
    expect(mensagemConexao("expirada")).toBe("Conexão com a Meta expirou — reconectar em Sistema › Conexão Meta");
    expect(mensagemConexao("ausente")).toContain("Sistema › Conexão Meta");
    expect(mensagemConexao("ok")).toBeNull();
  });
});

// ─── Servidor ───────────────────────────────────────────────────────────────

type Resp = { data: unknown; error: { code?: string; message: string } | null };
const banco = {
  tabelaExiste: true,
  token: "tok" as string | null,
  expira: null as string | null,
  linhas: new Map<string, Record<string, unknown>>(),
  upserts: [] as Record<string, unknown>[],
};
const SEM_TABELA = { code: "PGRST205", message: "Could not find the table 'public.meta_campaign_cache' in the schema cache" };

function consulta(tabela: string) {
  const q: { op?: string; payload?: Record<string, unknown>; filtros: Record<string, unknown> } = { filtros: {} };
  const resolver = (): Resp => {
    if (tabela === "agency_settings") {
      const rows = [
        ...(banco.token ? [{ key: "meta_token", value: banco.token }] : []),
        ...(banco.expira ? [{ key: "meta_token_expires_at", value: banco.expira }] : []),
      ];
      return { data: rows, error: null };
    }
    if (tabela === "clients") return { data: { id: q.filtros.id, meta_ad_account_id: "123" }, error: null };
    if (tabela === "meta_campaign_cache") {
      if (!banco.tabelaExiste) return { data: null, error: SEM_TABELA };
      if (q.op === "upsert") {
        const p = q.payload!;
        const k = `${p.client_id}|${p.period}`;
        const antes = banco.linhas.get(k) ?? { campaigns: [], demographics: null, synced_at: null, attempted_at: null, error: null, meta_ad_account_id: null };
        const depois = { ...antes, ...p };
        banco.linhas.set(k, depois);
        banco.upserts.push(p);
        return { data: depois, error: null };
      }
      const ids = (q.filtros.client_id as string[]) ?? [];
      return { data: ids.map((id) => banco.linhas.get(`${id}|${q.filtros.period}`)).filter(Boolean), error: null };
    }
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (c: string, v: unknown) => { q.filtros[c] = v; return b; },
    in: (c: string, v: unknown) => { q.filtros[c] = v; return b; },
    upsert: (p: Record<string, unknown>) => { q.op = "upsert"; q.payload = p; return b; },
    maybeSingle: () => Promise.resolve(resolver()),
    then: (ok: (r: Resp) => unknown, err?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, err),
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: (t: string) => consulta(t) } }));

const meta = vi.hoisted(() => {
  class TokenExpiredError extends Error {}
  return { TokenExpiredError, campanhas: vi.fn(), demografia: vi.fn() };
});
vi.mock("@/lib/meta/insights-server", () => ({
  TokenExpiredError: meta.TokenExpiredError,
  fetchCampaignInsights: meta.campanhas,
  fetchAccountDemographics: meta.demografia,
}));

import { sincronizarAnuncios, lerCache, lerConexao, emAndamento, MAX_SIMULTANEAS } from "@/lib/trafego/anuncios-server";

const P7 = { tipo: "preset", dias: 7 } as const;

beforeEach(() => {
  delete (globalThis as { __loneAnunciosMeta?: unknown }).__loneAnunciosMeta;
  banco.tabelaExiste = true;
  banco.token = "tok";
  banco.expira = null;
  banco.linhas.clear();
  banco.upserts = [];
  meta.campanhas.mockReset().mockResolvedValue([{ id: "c1", name: "Campanha", status: "active", spend: 10, hasData: true }]);
  meta.demografia.mockReset().mockResolvedValue(null);
});

describe("servidor: leitura e cache", () => {
  it("lê a Meta com a conta em formato act_ e guarda campanhas + hora", async () => {
    const r = await sincronizarAnuncios("cli-1", P7)!;
    expect(r.ok).toBe(true);
    expect(meta.campanhas).toHaveBeenCalledWith("tok", "act_123", 7, undefined, undefined);
    const { linhas, persistente } = await lerCache(["cli-1"], "7d");
    expect(persistente).toBe(true);
    expect(linhas[0]).toMatchObject({ error: null, meta_ad_account_id: "act_123" });
    expect(linhas[0].synced_at).toBeTruthy();
    expect(linhas[0].campaigns).toHaveLength(1);
  });

  it("token recusado pela Meta grava o erro e MANTÉM a última leitura boa", async () => {
    await sincronizarAnuncios("cli-1", P7);
    const antes = (await lerCache(["cli-1"], "7d")).linhas[0];
    meta.campanhas.mockRejectedValueOnce(new meta.TokenExpiredError("190"));
    const r = await sincronizarAnuncios("cli-1", P7)!;
    expect(r).toMatchObject({ ok: false, erro: ERRO_TOKEN, conexao: "expirada" });
    const depois = (await lerCache(["cli-1"], "7d")).linhas[0];
    expect(depois.error).toBe(ERRO_TOKEN);
    expect(depois.campaigns).toEqual(antes.campaigns);
    expect(depois.synced_at).toBe(antes.synced_at);
    expect(banco.upserts.at(-1)).not.toHaveProperty("campaigns");
  });

  it("token vencido pela data: nem chama a Meta", async () => {
    banco.expira = String(Date.now() - 1000);
    expect((await lerConexao()).estado).toBe("expirada");
    const r = await sincronizarAnuncios("cli-1", P7)!;
    expect(r).toMatchObject({ ok: false, conexao: "expirada" });
    expect(meta.campanhas).not.toHaveBeenCalled();
  });

  it("sem a tabela (migração não aplicada) guarda em memória e a aba funciona", async () => {
    banco.tabelaExiste = false;
    const r = await sincronizarAnuncios("cli-1", P7)!;
    expect(r.ok).toBe(true);
    const { linhas, persistente } = await lerCache(["cli-1", "cli-2"], "7d");
    expect(persistente).toBe(false);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].campaigns).toHaveLength(1);
  });

  it("dois pedidos do mesmo cliente+período esperam a MESMA leitura", async () => {
    let soltar!: () => void;
    meta.campanhas.mockImplementationOnce(() => new Promise((ok) => { soltar = () => ok([]); }));
    const a = sincronizarAnuncios("cli-1", P7);
    const b = sincronizarAnuncios("cli-1", P7);
    expect(a).toBe(b);
    expect(emAndamento("cli-1", "7d")).toBe(true);
    await vi.waitFor(() => expect(meta.campanhas).toHaveBeenCalledTimes(1));
    soltar();
    await a;
    expect(emAndamento("cli-1", "7d")).toBe(false);
  });

  it(`no máximo ${MAX_SIMULTANEAS} leituras diferentes ao mesmo tempo`, async () => {
    const soltar: (() => void)[] = [];
    meta.campanhas.mockImplementation(() => new Promise((ok) => { soltar.push(() => ok([])); }));
    const rodando = Array.from({ length: MAX_SIMULTANEAS }, (_, i) => sincronizarAnuncios(`cli-${i}`, P7));
    expect(rodando.every(Boolean)).toBe(true);
    expect(sincronizarAnuncios("cli-extra", P7)).toBeNull();
    await vi.waitFor(() => expect(soltar).toHaveLength(MAX_SIMULTANEAS));
    soltar.forEach((f) => f());
    await Promise.all(rodando);
    expect(sincronizarAnuncios("cli-extra", P7)).not.toBeNull();
  });
});
