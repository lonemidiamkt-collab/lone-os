// @vitest-environment node
// tests/cofre-senhas-anteriores.test.ts — 25/10/2026, onda 5 da auditoria de erro recuperável.
// A senha anterior fica guardada a cada troca (onda 2, item 3.5), mas só o "Desfazer" de ~15 s do aviso
// chegava nela. Agora /api/client-vault/anteriores lista as versões por campo (sem a senha), revela uma
// só para admin registrando o acesso, e a restauração é a ação `restaurar` que já existia.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";

process.env.VAULT_KEY = randomBytes(32).toString("base64");

type Op = { tabela: string; tipo: "select" | "insert" | "update" | "upsert" | "delete"; colunas?: string; dados?: unknown; filtros: [string, unknown][] };
const ops: Op[] = [];
let responder: (op: Op) => { data: unknown; error: { code?: string; message: string } | null } = () => ({ data: null, error: null });

function consulta(tabela: string) {
  const op: Op = { tabela, tipo: "select", filtros: [] };
  const fim = async () => { ops.push(op); return responder(op); };
  const q = {
    select: (c?: string) => { if (op.tipo === "select") op.colunas = c; return q; },
    insert: (d: unknown) => { op.tipo = "insert"; op.dados = d; return q; },
    update: (d: unknown) => { op.tipo = "update"; op.dados = d; return q; },
    upsert: (d: unknown) => { op.tipo = "upsert"; op.dados = d; return q; },
    delete: () => { op.tipo = "delete"; return q; },
    eq: (c: string, v: unknown) => { op.filtros.push([c, v]); return q; },
    in: (c: string, v: unknown) => { op.filtros.push([c, v]); return q; },
    order: () => q,
    limit: () => q,
    maybeSingle: fim,
    single: fim,
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => fim().then(ok, erro),
  };
  return q;
}

const usuario = vi.hoisted(() => ({ isAdmin: true }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: (t: string) => consulta(t) } }));
vi.mock("@/lib/supabase/auth-server", () => ({
  getServerUser: async () => ({ id: "00000000-0000-0000-0000-0000000000aa", email: "lonemidiamkt@gmail.com", isAdmin: usuario.isAdmin, aal: "aal2", duasEtapas: true }),
}));

const { GET } = await import("@/app/api/client-vault/anteriores/route");
const { POST } = await import("@/app/api/client-vault/route");
const { encryptVault, decryptVault } = await import("@/lib/crypto/vault");
const { montarVersoes, descreverVersao, confirmacaoRestaurar } = await import("@/lib/cofre/senhas-anteriores");

const CLIENTE = "11111111-2222-3333-4444-555555555555";
const V1 = "aaaaaaaa-0000-0000-0000-000000000001";
const V2 = "aaaaaaaa-0000-0000-0000-000000000002";
const ROBERTO = "00000000-0000-0000-0000-0000000000aa";
const get = (q: string) => GET(new NextRequest(`http://x/api/client-vault/anteriores?${q}`));
const lista = () => get(`clientId=${CLIENTE}&field=instagram_password`);

let senhaAtual: string | null;
let versoes: Record<string, { valor: string; motivo: string; em: string; por: string | null; email: string | null }>;
let falhaLista: { code?: string; message: string } | null;
const espiaLog = vi.spyOn(console, "error");
const espiaWarn = vi.spyOn(console, "warn");
const espiaInfo = vi.spyOn(console, "log");

beforeEach(() => {
  ops.length = 0;
  usuario.isAdmin = true;
  falhaLista = null;
  senhaAtual = encryptVault("atual-999");
  versoes = {
    [V1]: { valor: encryptVault("antiga-111")!, motivo: "troca", em: "2026-10-21T17:30:00Z", por: ROBERTO, email: "lonemidiamkt@gmail.com" },
    [V2]: { valor: encryptVault("mais-antiga-000")!, motivo: "remocao", em: "2026-10-01T12:00:00Z", por: null, email: "julio@lonemidia.com" },
  };
  responder = (op) => {
    if (op.tabela === "cofre_senhas_anteriores" && op.tipo === "select") {
      const id = op.filtros.find(([c]) => c === "id")?.[1] as string | undefined;
      if (id) return { data: versoes[id] ? { valor_cifrado: versoes[id].valor } : null, error: null };
      if (falhaLista) return { data: null, error: falhaLista };
      return {
        data: Object.entries(versoes).map(([vid, v]) => ({ id: vid, motivo: v.motivo, trocado_por_id: v.por, trocado_por_email: v.email, trocado_em: v.em })),
        error: null,
      };
    }
    if (op.tabela === "cofre_senhas_anteriores" && op.tipo === "insert") {
      const id = `aaaaaaaa-0000-0000-0000-00000000000${Object.keys(versoes).length + 1}`;
      versoes[id] = { valor: (op.dados as { valor_cifrado: string }).valor_cifrado, motivo: (op.dados as { motivo: string }).motivo, em: "2026-10-25T12:00:00Z", por: ROBERTO, email: null };
      return { data: { id }, error: null };
    }
    if (op.tabela === "team_members") return { data: [{ auth_id: ROBERTO, name: "Roberto" }], error: null };
    if (op.tabela === "clients" && op.tipo === "select") return { data: { instagram_password: senhaAtual }, error: null };
    if (op.tabela === "clients" && op.tipo === "update") { senhaAtual = (op.dados as Record<string, string | null>).instagram_password ?? null; return { data: null, error: null }; }
    return { data: null, error: null };
  };
});
afterEach(() => { espiaLog.mockClear(); espiaWarn.mockClear(); espiaInfo.mockClear(); });

/** Nenhuma senha (aberta) em log nenhum. */
function semSenhaNoLog() {
  const tudo = [...espiaLog.mock.calls, ...espiaWarn.mock.calls, ...espiaInfo.mock.calls].flat().map(String).join(" ");
  for (const s of ["antiga-111", "mais-antiga-000", "atual-999"]) expect(tudo).not.toContain(s);
}

describe("lista de senhas anteriores", () => {
  it("lista por campo com data e quem trocou — e a senha NÃO vem (nem cifrada)", async () => {
    const r = await lista();
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.disponivel).toBe(true);
    expect(j.versoes).toEqual([
      { id: V1, em: "2026-10-21T17:30:00Z", quem: "Roberto", motivo: "troca" },
      { id: V2, em: "2026-10-01T12:00:00Z", quem: "julio@lonemidia.com", motivo: "remocao" },
    ]);
    expect(JSON.stringify(j)).not.toMatch(/v1:|antiga/);
    const sel = ops.find((o) => o.tabela === "cofre_senhas_anteriores")!;
    expect(sel.colunas).not.toContain("valor_cifrado");
    expect(sel.filtros).toEqual(expect.arrayContaining([["client_id", CLIENTE], ["tabela", "clients"], ["campo", "instagram_password"]]));
    // Listar não é revelar: nada no registro de acessos.
    expect(ops.some((o) => o.tabela === "vault_access_log")).toBe(false);
    semSenhaNoLog();
  });

  it("tabela ainda não criada: diz que o histórico não está ativo (não 'nenhuma senha')", async () => {
    falhaLista = { code: "42P01", message: 'relation "cofre_senhas_anteriores" does not exist' };
    const j = await (await lista()).json();
    expect(j).toEqual({ disponivel: false, versoes: [] });
  });

  it("falha do banco: 503 com frase, não lista vazia", async () => {
    falhaLista = { message: "connection reset" };
    const r = await lista();
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/Não consegui ler as senhas anteriores/);
  });

  it("só admin; campo fora do cofre e id inválido são recusados", async () => {
    usuario.isAdmin = false;
    expect((await lista()).status).toBe(403);
    expect((await get(`clientId=${CLIENTE}&field=instagram_password&versaoId=${V1}`)).status).toBe(403);
    usuario.isAdmin = true;
    expect((await get(`clientId=${CLIENTE}&field=notes`)).status).toBe(400);
    expect((await get(`clientId=abc&field=instagram_password`)).status).toBe(400);
    expect(ops.some((o) => o.tabela === "cofre_senhas_anteriores")).toBe(false);
  });
});

describe("Ver uma senha anterior", () => {
  it("revela só a versão pedida, do cliente e campo pedidos, e registra como o revelar do cofre", async () => {
    const r = await get(`clientId=${CLIENTE}&field=instagram_password&versaoId=${V1}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ value: "antiga-111" });
    const sel = ops.find((o) => o.tabela === "cofre_senhas_anteriores")!;
    expect(sel.filtros).toEqual(expect.arrayContaining([["id", V1], ["client_id", CLIENTE], ["campo", "instagram_password"]]));
    const log = ops.find((o) => o.tabela === "vault_access_log")!.dados as Record<string, unknown>;
    expect(log).toMatchObject({ action: "reveal", resource_type: "credential:instagram_password", client_id: CLIENTE, resource_path: `cofre_senhas_anteriores/${V1}` });
    expect(JSON.stringify(log)).not.toContain("antiga-111");
    semSenhaNoLog();
  });

  it("versão que não existe (ou é de outro cliente): 404, sem registrar acesso", async () => {
    const r = await get(`clientId=${CLIENTE}&field=instagram_password&versaoId=aaaaaaaa-0000-0000-0000-000000000009`);
    expect(r.status).toBe(404);
    expect(ops.some((o) => o.tabela === "vault_access_log")).toBe(false);
  });
});

describe("Restaurar esta (ação `restaurar` de /api/client-vault)", () => {
  it("volta a senha escolhida da lista — e a atual entra na lista, para dar para voltar", async () => {
    const r = await POST(new NextRequest("http://x/api/client-vault", {
      method: "POST", body: JSON.stringify({ acao: "restaurar", clientId: CLIENTE, table: "clients", field: "instagram_password", versaoId: V2 }),
    }));
    expect(r.status).toBe(200);
    expect(decryptVault(senhaAtual)).toBe("mais-antiga-000");
    ops.length = 0;
    const j = await (await lista()).json();
    expect(j.versoes).toHaveLength(3);
    const nova = Object.values(versoes).find((v) => v.motivo === "restauracao")!;
    expect(decryptVault(nova.valor)).toBe("atual-999");
    semSenhaNoLog();
  });
});

describe("textos da tela", () => {
  it("descreve sem a senha; a confirmação diz qual e que a atual não se perde", () => {
    const [v] = montarVersoes([{ id: V1, motivo: "troca", trocado_por_id: ROBERTO, trocado_por_email: "x@y", trocado_em: "2026-10-21T17:30:00Z" }], new Map([[ROBERTO, "Roberto"]]));
    expect(descreverVersao(v)).toBe("Valia até 21/10/2026, 14:30 · trocada por Roberto");
    expect(confirmacaoRestaurar("instagram_password", v)).toMatch(/^Restaurar a senha do Instagram que valia até 21\/10\/2026, 14:30\?/);
    expect(confirmacaoRestaurar("instagram_password", v)).toMatch(/não se perde/);
    const [semNome] = montarVersoes([{ id: V2, motivo: "esquisito", trocado_por_id: null, trocado_por_email: null, trocado_em: "2026-10-01T12:00:00Z" }], new Map());
    expect(semNome).toMatchObject({ quem: "—", motivo: "troca" });
  });
});
