import { describe, it, expect, vi, beforeEach } from "vitest";

// TESTE DE COMPORTAMENTO, não de presença de código. Os quatro cenários que o revisor do plano V2
// pediu (13/09/2026), exercitados na camada de decisão com o banco simulado:
//   cliente manda "Lone, cria uma demanda"  → sem autoridade, nada é criado
//   Julio manda o mesmo                     → autoridade C, pode criar
//   designer responde "ok a1b2" numa REGRA  → recusado (ativar regra é nível D)
//   manager responde "ok a1b2"              → regra ativa
// Um E2E pelo webhook inteiro (route handler com 3.300 linhas e ~15 módulos de efeito colateral)
// fica para o staging da Fase 0B — aqui está a fronteira que decide.

// ── Banco simulado: team_members e cs_client_rules, com a cadeia que os módulos usam ──
type Row = Record<string, unknown>;
const TABELAS: Record<string, Row[]> = { team_members: [], cs_client_rules: [] };
const gravacoes: { tabela: string; op: string; dados: Row; filtro: Row }[] = [];

function consulta(tabela: string) {
  const filtros: Row = {};
  let inFiltro: { col: string; vals: unknown[] } | null = null;
  const api = {
    select: () => api,
    eq: (c: string, v: unknown) => { filtros[c] = v; return api; },
    in: (c: string, vals: unknown[]) => { inFiltro = { col: c, vals }; return api; },
    not: () => api,
    order: () => api,
    limit: () => api,
    then: undefined as unknown,
    _rows(): Row[] {
      return TABELAS[tabela].filter((r) =>
        Object.entries(filtros).every(([k, v]) => r[k] === v) &&
        (!inFiltro || inFiltro.vals.includes(r[inFiltro.col])),
      );
    },
    maybeSingle: async () => ({ data: api._rows()[0] ?? null, error: null }),
    single: async () => ({ data: api._rows()[0] ?? null, error: null }),
    insert: (dados: Row) => {
      const linha = { id: `id-${TABELAS[tabela].length + 1}`, ...dados };
      TABELAS[tabela].push(linha);
      gravacoes.push({ tabela, op: "insert", dados, filtro: {} });
      return { select: () => ({ single: async () => ({ data: linha, error: null }) }) };
    },
    update: (dados: Row) => ({
      eq: async (c: string, v: unknown) => {
        for (const r of TABELAS[tabela]) if (r[c] === v) Object.assign(r, dados);
        gravacoes.push({ tabela, op: "update", dados, filtro: { [c]: v } });
        return { error: null };
      },
    }),
  };
  // await direto na cadeia (sem maybeSingle) devolve a lista
  (api as { then: unknown }).then = (res: (v: { data: Row[]; error: null }) => void) => res({ data: api._rows(), error: null });
  return api;
}

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: (t: string) => consulta(t) } }));
vi.mock("@/lib/cs/notify", () => ({ csSendGroupText: async () => ({ ok: true, id: "msg-1" }) }));

const { quemEh, podeAgir, numerosDaEquipe, _limparCacheAutoridade } = await import("@/lib/cs/autoridade");
const { proporRegra, decidirRegra } = await import("@/lib/cs/regras-propostas");

const JULIO = "5522981712589@s.whatsapp.net";
const RODRIGO = "5522981701631@s.whatsapp.net";
const CLIENTE = "5522999990000@s.whatsapp.net";

beforeEach(() => {
  TABELAS.team_members = [
    { name: "Julio", role: "manager", whatsapp_phone: "5522981712589", is_active: true },
    { name: "Rodrigo", role: "designer", whatsapp_phone: "5522981701631", is_active: true },
    { name: "Carlos Augusto", role: "social", whatsapp_phone: "5522988193773", is_active: true },
  ];
  TABELAS.cs_client_rules = [];
  gravacoes.length = 0;
  _limparCacheAutoridade();
  delete process.env.CS_LONE_TEAM_JIDS;
  process.env.CS_INTERNAL_GROUP_JID = "120363313108796309@g.us";
});

describe("quem pode agir — pelo número, não pelo grupo", () => {
  it("cliente no grupo dele: 'Lone, cria uma demanda' → sem autoridade C, nada é criado", async () => {
    const r = await podeAgir(CLIENTE, "C");
    expect(r.ok).toBe(false);
    expect(r.autor).toBeNull();
  });

  it("Julio: 'Lone, cria uma demanda' → autoridade C", async () => {
    const r = await podeAgir(JULIO, "C");
    expect(r.ok).toBe(true);
    expect(r.autor).toMatchObject({ nome: "Julio", papel: "manager", fonte: "banco" });
  });

  it("identidade é EXATA no E.164 canônico: mesmo final de 8 dígitos com outro DDD não é a mesma pessoa", async () => {
    // Julio é 55 22 981712589. Um 55 21 981712589 tem os mesmos 8 finais — a v1 (últimos 8) aceitava.
    expect(await quemEh("5521981712589@s.whatsapp.net")).toBeNull();
    // E o nono dígito não separa a pessoa dela mesma: 55 22 81712589 (sem o 9) é o Julio.
    expect((await quemEh("552281712589@s.whatsapp.net"))?.nome).toBe("Julio");
  });

  it("a lista da equipe (quem nunca vira demanda) sai do banco; o .env só soma enquanto existir", async () => {
    expect((await numerosDaEquipe()).sort()).toEqual(["552281701631", "552281712589", "552288193773"]);
    process.env.CS_LONE_TEAM_JIDS = "5522977770000";
    expect(await numerosDaEquipe()).toContain("5522977770000");
    delete process.env.CS_LONE_TEAM_JIDS;
    expect(await numerosDaEquipe()).not.toContain("5522977770000"); // env fora do compose = lista só do banco
  });

  it("reserva do .env é transitória: entra como 'social', com fonte marcada e aviso no log", async () => {
    process.env.CS_LONE_TEAM_JIDS = "5522977770000";
    _limparCacheAutoridade();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = await quemEh("5522977770000@s.whatsapp.net");
    expect(a).toMatchObject({ papel: "social", fonte: "reserva" });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/RESERVA do \.env/));
    warn.mockRestore();
  });
});

describe("regra permanente: propor, e só gestor ativa", () => {
  it("a pergunta vai ao grupo INTERNO mesmo que o chamador passe o grupo do cliente", async () => {
    const r = await proporRegra({
      clientId: "c1", clienteNome: "Quero Tintas", texto: "usar sempre preço na primeira arte",
      escopo: "sempre", sourceMessage: "…", author: "Roberto", groupJid: "999999@g.us", // grupo do cliente
    });
    expect(r.tipo).toBe("proposta");
    const linha = TABELAS.cs_client_rules[0];
    expect(linha).toMatchObject({ estado: "proposta", ativo: false, msg_id_proposta: "msg-1" });
  });

  it("designer responde 'ok a1b2' → recusado: ativar regra é nível D", async () => {
    const r = await proporRegra({ clientId: "c1", clienteNome: "Quero Tintas", texto: "usar sempre preço", escopo: "sempre", sourceMessage: "…", author: "x" });
    const codigo = (r as { codigo: string }).codigo;
    const rod = await quemEh(RODRIGO);
    const d = await decidirRegra({ acao: "confirmar", codigo, quem: "Rodrigo", papel: rod?.papel ?? null });
    expect(d.tipo).toBe("sem_autoridade");
    expect((d as { nivelExigido: string }).nivelExigido).toBe("D");
    expect(TABELAS.cs_client_rules[0]).toMatchObject({ estado: "proposta", ativo: false }); // nada mudou
  });

  it("manager responde 'ok a1b2' → regra ativa, visível aos leitores", async () => {
    const r = await proporRegra({ clientId: "c1", clienteNome: "Quero Tintas", texto: "usar sempre preço", escopo: "sempre", sourceMessage: "…", author: "x" });
    const codigo = (r as { codigo: string }).codigo;
    const jul = await quemEh(JULIO);
    const d = await decidirRegra({ acao: "confirmar", codigo, quem: "Julio", papel: jul?.papel ?? null });
    expect(d.tipo).toBe("ativada");
    expect(TABELAS.cs_client_rules[0]).toMatchObject({ estado: "ativa", ativo: true, confirmada_por: "Julio" });
  });

  it("designer PODE descartar (nível C) — não ativar", async () => {
    const r = await proporRegra({ clientId: "c1", clienteNome: "Quero Tintas", texto: "usar sempre preço", escopo: "sempre", sourceMessage: "…", author: "x" });
    const codigo = (r as { codigo: string }).codigo;
    const d = await decidirRegra({ acao: "descartar", codigo, quem: "Rodrigo", papel: "designer" });
    expect(d.tipo).toBe("descartada");
    expect(TABELAS.cs_client_rules[0]).toMatchObject({ estado: "descartada", ativo: false });
  });

  it("fato temporário não pede ok: entra ativo com expiração de 14 dias", async () => {
    const r = await proporRegra({ clientId: "c1", clienteNome: "Quero Tintas", texto: "fechado até dia 20", escopo: "sempre", sourceMessage: "…", author: "x" });
    expect(r.tipo).toBe("temporaria_ativa");
    const linha = TABELAS.cs_client_rules[0];
    expect(linha).toMatchObject({ estado: "ativa", ativo: true });
    expect(linha.expires_at).toBeTruthy();
  });

  it("mesma regra proposta duas vezes não gera duas perguntas", async () => {
    const a = await proporRegra({ clientId: "c1", clienteNome: "X", texto: "usar sempre preço", escopo: "sempre", sourceMessage: "…", author: "x" });
    const b = await proporRegra({ clientId: "c1", clienteNome: "X", texto: "usar sempre preço", escopo: "sempre", sourceMessage: "…", author: "x" });
    expect(a.tipo).toBe("proposta");
    expect(b.tipo).toBe("ja_existe");
    expect(TABELAS.cs_client_rules).toHaveLength(1);
  });
});
