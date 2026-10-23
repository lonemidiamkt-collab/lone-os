// tests/notificacoes-marcar-lidas.test.ts — "Marcar todas como lidas" do sino (auditoria 21/10/2026, 4.1).
//
// O QUE ACONTECIA: o botão gravava read = true em TODA linha não lida da tabela de avisos. O Roberto
// limpava o sino dele e sumia o aviso de tarefa do Pedro; sem desfazer; e a falha de rede era engolida
// (a tela dizia "lidas" e elas voltavam na leitura seguinte). Aqui: só os ids da tela, só os desta
// pessoa (ou do time todo), Desfazer volta exatamente o que mudou, e falha aparece como falha.
// Dados INVENTADOS.
import { describe, it, expect, vi, beforeEach } from "vitest";

type Linha = { id: string; target_user: string | null; read: boolean };
let tabela: Linha[] = [];
let falharUpdate = false;

/** Banco em memória: só o que marcarAvisosLidosDb usa (select…in e update…in). */
function consulta() {
  let op: "select" | "update" = "select";
  let dados: Partial<Linha> = {};
  let ids: string[] = [];
  const q = {
    select: () => q,
    update: (d: Partial<Linha>) => { op = "update"; dados = d; return q; },
    in: (_c: string, v: string[]) => { ids = v; return q; },
    then: <T,>(ok: (r: { data: Linha[] | null; error: { message: string } | null }) => T) => {
      if (op === "update") {
        if (falharUpdate) return Promise.resolve(ok({ data: null, error: { message: "conexão recusada" } }));
        tabela.filter((l) => ids.includes(l.id)).forEach((l) => Object.assign(l, dados));
        return Promise.resolve(ok({ data: null, error: null }));
      }
      return Promise.resolve(ok({ data: tabela.filter((l) => ids.includes(l.id)).map((l) => ({ ...l })), error: null }));
    },
  };
  return q;
}
const fake = { from: () => consulta(), channel: () => ({}), removeChannel: () => {} };
vi.mock("@/lib/supabase/client", () => ({ supabase: fake, REALTIME_ENABLED: false }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: fake }));

const respostas: { ok: boolean; erro: string | null; data?: unknown }[] = [];
const chamadas: unknown[] = [];
vi.mock("@/lib/api/chamar", () => ({
  chamar: async (_url: string, corpo: unknown) => {
    chamadas.push(corpo);
    const r = respostas.shift() ?? { ok: true, erro: null };
    return { ...r, data: r.ok ? (r.data ?? { ok: true }) : null, status: r.ok ? 200 : 500 };
  },
}));

const { avisosDaPessoa, idsNaoLidos, marcarNaLista, textoMarcadas } = await import("@/lib/notificacoes/lidas");
const { marcarAvisosLidosDb } = await import("@/lib/supabase/queries");
const { useNotificationsStore } = await import("@/stores/useNotificationsStore");

const GLOBAL = "00000000-0000-4000-8000-000000000001";
const DO_ROBERTO = "00000000-0000-4000-8000-000000000002";
const DO_PEDRO = "00000000-0000-4000-8000-000000000003";

beforeEach(() => {
  tabela = [
    { id: GLOBAL, target_user: null, read: false },
    { id: DO_ROBERTO, target_user: "Roberto Lino", read: false },
    { id: DO_PEDRO, target_user: "Pedro", read: false },
  ];
  falharUpdate = false;
  respostas.length = 0;
  chamadas.length = 0;
});

describe("regra: quem pode marcar o quê", () => {
  it("só os avisos da pessoa e os do time todo — nunca o dirigido a outra pessoa", () => {
    expect(avisosDaPessoa(tabela, "Roberto Lino")).toEqual([GLOBAL, DO_ROBERTO]);
    expect(avisosDaPessoa(tabela, "Pedro")).toEqual([GLOBAL, DO_PEDRO]);
    // E-mail fora do mapa de nomes: só os do time.
    expect(avisosDaPessoa(tabela, null)).toEqual([GLOBAL]);
  });
  it("os não lidos da tela, sem repetir; marcar na lista mexe só nos pedidos", () => {
    const lista = [{ id: "a", read: false }, { id: "b", read: true }, { id: "a", read: false }, { id: "c", read: false }];
    expect(idsNaoLidos(lista)).toEqual(["a", "c"]);
    expect(marcarNaLista(lista, ["c"], true).map((n) => n.read)).toEqual([false, true, false, true]);
    expect(textoMarcadas(1)).toBe("1 aviso marcado como lido.");
    expect(textoMarcadas(12)).toBe("12 avisos marcados como lidos.");
  });
});

describe("gravação (marcarAvisosLidosDb)", () => {
  it("o clique do Roberto não marca o aviso do Pedro, mesmo que o id venha no pedido", async () => {
    const r = await marcarAvisosLidosDb([GLOBAL, DO_ROBERTO, DO_PEDRO], "Roberto Lino", true);
    expect(r).toEqual({ error: null, marcados: [GLOBAL, DO_ROBERTO] });
    expect(tabela.find((l) => l.id === DO_PEDRO)!.read).toBe(false);
    expect(tabela.find((l) => l.id === DO_ROBERTO)!.read).toBe(true);
  });
  it("Desfazer volta para não lido só o que foi pedido", async () => {
    await marcarAvisosLidosDb([GLOBAL, DO_ROBERTO], "Roberto Lino", true);
    await marcarAvisosLidosDb([DO_ROBERTO], "Roberto Lino", false);
    expect(tabela.map((l) => l.read)).toEqual([true, false, false]);
  });
  it("falha do banco volta como erro, não como sucesso", async () => {
    falharUpdate = true;
    const r = await marcarAvisosLidosDb([GLOBAL], "Roberto Lino", true);
    expect(r.error).toMatch(/conexão/);
    expect(r.marcados).toEqual([]);
  });
});

describe("sino (store): marcar as da tela e desfazer", () => {
  const aviso = (id: string, read = false) => ({ id, type: "system" as const, title: id, body: "", read, createdAt: "2026-10-21T12:00:00Z" });

  it("marca só os ids da tela e manda só eles ao servidor", async () => {
    useNotificationsStore.setState({ notifications: [aviso(GLOBAL), aviso(DO_ROBERTO), aviso("temp-notif-1")] });
    const r = await useNotificationsStore.getState().markAllRead([GLOBAL, "temp-notif-1"]);
    expect(r).toEqual({ ok: true, erro: null, marcadas: [GLOBAL, "temp-notif-1"] });
    expect(chamadas).toEqual([{ action: "markAllRead", ids: [GLOBAL] }]); // o temporário não existe no banco
    expect(useNotificationsStore.getState().notifications.map((n) => n.read)).toEqual([true, false, true]);
  });

  it("servidor recusou: volta para não lidas e devolve a frase do erro", async () => {
    useNotificationsStore.setState({ notifications: [aviso(GLOBAL), aviso(DO_ROBERTO)] });
    respostas.push({ ok: false, erro: "Sem conexão com o servidor. Tenta de novo?" });
    const r = await useNotificationsStore.getState().markAllRead([GLOBAL, DO_ROBERTO]);
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/Sem conexão/);
    expect(useNotificationsStore.getState().notifications.every((n) => !n.read)).toBe(true);
  });

  it("o que o servidor recusou (aviso de outra pessoa) volta a não lido na tela e fica fora do Desfazer", async () => {
    useNotificationsStore.setState({ notifications: [aviso(GLOBAL), aviso(DO_PEDRO)] });
    respostas.push({ ok: true, erro: null, data: { ok: true, marcados: [GLOBAL] } });
    const r = await useNotificationsStore.getState().markAllRead([GLOBAL, DO_PEDRO]);
    expect(r.marcadas).toEqual([GLOBAL]);
    expect(useNotificationsStore.getState().notifications.map((n) => n.read)).toEqual([true, false]);
  });

  it("Desfazer: volta as marcadas para não lidas; se falhar, ficam lidas e diz", async () => {
    useNotificationsStore.setState({ notifications: [aviso(GLOBAL), aviso(DO_ROBERTO, true)] });
    const m = await useNotificationsStore.getState().markAllRead([GLOBAL, DO_ROBERTO]);
    expect(m.marcadas).toEqual([GLOBAL]); // o que já estava lido não entra no Desfazer
    const d = await useNotificationsStore.getState().desmarcarLidas(m.marcadas);
    expect(d.ok).toBe(true);
    expect(chamadas.at(-1)).toEqual({ action: "markUnread", ids: [GLOBAL] });
    expect(useNotificationsStore.getState().notifications.map((n) => n.read)).toEqual([false, true]);

    await useNotificationsStore.getState().markAllRead([GLOBAL]);
    respostas.push({ ok: false, erro: "Não consegui desfazer: os avisos continuam como lidos. Tente de novo." });
    const falhou = await useNotificationsStore.getState().desmarcarLidas([GLOBAL]);
    expect(falhou.ok).toBe(false);
    expect(useNotificationsStore.getState().notifications[0].read).toBe(true);
  });
});
