// @vitest-environment node
// tests/cofre-troca-senha.test.ts — trocar a senha no cofre da ficha (auditoria de erro recuperável,
// 21/10/2026, item 3.5).
//
// O que acontecia: a senha anterior se perdia na troca; o espelho para o cofre do social gravava
// `updated_by` com e-mail numa coluna que é FK de team_members (falhava SEMPRE) e o erro só ia pro
// console; quando passava, gravava a senha em texto puro.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";

process.env.VAULT_KEY = randomBytes(32).toString("base64");

type Op = { tabela: string; tipo: "select" | "insert" | "update" | "upsert" | "delete"; dados?: unknown; filtros: [string, unknown][] };
const ops: Op[] = [];
let responder: (op: Op) => { data: unknown; error: { message: string } | null } = () => ({ data: null, error: null });

function consulta(tabela: string) {
  const op: Op = { tabela, tipo: "select", filtros: [] };
  const fim = async () => { ops.push(op); return responder(op); };
  const q = {
    select: () => q,
    insert: (d: unknown) => { op.tipo = "insert"; op.dados = d; return q; },
    update: (d: unknown) => { op.tipo = "update"; op.dados = d; return q; },
    upsert: (d: unknown) => { op.tipo = "upsert"; op.dados = d; return q; },
    delete: () => { op.tipo = "delete"; return q; },
    eq: (c: string, v: unknown) => { op.filtros.push([c, v]); return q; },
    order: () => q,
    limit: () => q,
    maybeSingle: fim,
    single: fim,
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => fim().then(ok, erro),
  };
  return q;
}

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: (t: string) => consulta(t) } }));
vi.mock("@/lib/supabase/auth-server", () => ({
  getServerUser: async () => ({ id: "00000000-0000-0000-0000-0000000000aa", email: "lonemidiamkt@gmail.com", isAdmin: true, aal: "aal2", duasEtapas: true }),
}));

const { POST } = await import("@/app/api/client-vault/route");
const { encryptVault, decryptVault } = await import("@/lib/crypto/vault");
const { planejarTroca, valorParaGuardar, avisoDoEspelho, campoEspelhado } = await import("@/lib/cofre/versoes");

const CLIENTE = "11111111-2222-3333-4444-555555555555";
const post = (body: unknown) => POST(new NextRequest("http://x/api/client-vault", { method: "POST", body: JSON.stringify(body) }));

let senhaAtual: string | null;
let falhaHistorico = false;
let falhaEspelho: string | null = null;
let versoes: Record<string, string> = {};

beforeEach(() => {
  ops.length = 0;
  senhaAtual = encryptVault("antiga-123");
  falhaHistorico = false;
  falhaEspelho = null;
  versoes = {};
  responder = (op) => {
    if (op.tabela === "clients" && op.tipo === "select") return { data: { instagram_password: senhaAtual, google_ads_password: senhaAtual }, error: null };
    if (op.tabela === "clients" && op.tipo === "update") { senhaAtual = (op.dados as Record<string, string | null>).instagram_password ?? null; return { data: null, error: null }; }
    if (op.tabela === "cofre_senhas_anteriores" && op.tipo === "insert") {
      if (falhaHistorico) return { data: null, error: { message: 'relation "cofre_senhas_anteriores" does not exist' } };
      const id = `v${Object.keys(versoes).length + 1}`;
      versoes[id] = (op.dados as { valor_cifrado: string }).valor_cifrado;
      return { data: { id }, error: null };
    }
    if (op.tabela === "cofre_senhas_anteriores" && op.tipo === "select") {
      const id = op.filtros.find(([c]) => c === "id")?.[1] as string;
      return { data: versoes[id] ? { valor_cifrado: versoes[id] } : null, error: null };
    }
    if (op.tabela === "client_access" && op.tipo === "upsert") {
      return { data: null, error: falhaEspelho ? { message: falhaEspelho } : null };
    }
    return { data: null, error: null };
  };
});

describe("trocar a senha guarda a anterior", () => {
  it("guarda a anterior (cifrada) ANTES de gravar a nova, e devolve o id para desfazer", async () => {
    const r = await post({ clientId: CLIENTE, table: "clients", field: "instagram_password", value: "nova-456" });
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j.historicoId).toBe("v1");
    const ordem = ops.map((o) => `${o.tabela}:${o.tipo}`);
    expect(ordem.indexOf("cofre_senhas_anteriores:insert")).toBeLessThan(ordem.indexOf("clients:update"));
    const guardada = ops.find((o) => o.tabela === "cofre_senhas_anteriores")!.dados as Record<string, string>;
    expect(guardada.valor_cifrado.startsWith("v1:")).toBe(true);
    expect(decryptVault(guardada.valor_cifrado)).toBe("antiga-123");
    expect(guardada).toMatchObject({ client_id: CLIENTE, campo: "instagram_password", motivo: "troca", trocado_por_email: "lonemidiamkt@gmail.com" });
    expect(decryptVault(senhaAtual)).toBe("nova-456");
  });

  it("sem conseguir guardar a anterior, NADA é trocado", async () => {
    falhaHistorico = true;
    const r = await post({ clientId: CLIENTE, table: "clients", field: "instagram_password", value: "nova-456" });
    expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/Nada foi trocado/);
    expect(ops.some((o) => o.tabela === "clients" && o.tipo === "update")).toBe(false);
    expect(decryptVault(senhaAtual)).toBe("antiga-123");
  });

  it("Desfazer: restaura a versão guardada — e guarda a que sai, para dar para voltar de novo", async () => {
    const troca = await (await post({ clientId: CLIENTE, table: "clients", field: "instagram_password", value: "errada" })).json();
    const r = await post({ acao: "restaurar", clientId: CLIENTE, table: "clients", field: "instagram_password", versaoId: troca.historicoId });
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(decryptVault(senhaAtual)).toBe("antiga-123");
    expect(decryptVault(versoes[j.historicoId])).toBe("errada");
    const ultimaVersao = ops.filter((o) => o.tabela === "cofre_senhas_anteriores" && o.tipo === "insert").pop()!.dados as Record<string, string>;
    expect(ultimaVersao.motivo).toBe("restauracao");
  });

  it("mesma senha de novo: não cria versão nem regrava (só refaz o espelho)", async () => {
    const r = await post({ clientId: CLIENTE, table: "clients", field: "instagram_password", value: "antiga-123" });
    const j = await r.json();
    expect(j).toMatchObject({ ok: true, semMudanca: true, historicoId: null });
    expect(ops.some((o) => o.tabela === "cofre_senhas_anteriores")).toBe(false);
    expect(ops.some((o) => o.tabela === "clients" && o.tipo === "update")).toBe(false);
    expect(ops.some((o) => o.tabela === "client_access" && o.tipo === "upsert")).toBe(true);
  });
});

describe("espelho no cofre do social", () => {
  it("passa pela mesma função do resto: senha CIFRADA e sem updated_by (a FK que quebrava)", async () => {
    await post({ clientId: CLIENTE, table: "clients", field: "instagram_password", value: "nova-456" });
    const esp = ops.find((o) => o.tabela === "client_access")!.dados as Record<string, unknown>;
    expect(esp).not.toHaveProperty("updated_by");
    expect(esp.instagram_password).not.toBe("nova-456");
    expect(decryptVault(esp.instagram_password as string)).toBe("nova-456");
  });

  it("falha do espelho APARECE na resposta (antes: só console)", async () => {
    falhaEspelho = 'insert or update on table "client_access" violates foreign key constraint';
    const r = await post({ clientId: CLIENTE, table: "clients", field: "instagram_password", value: "nova-456" });
    const j = await r.json();
    expect(r.status).toBe(200); // a senha do cadastro foi trocada…
    expect(j.espelho).toMatchObject({ aplicavel: true, ok: false });
    expect(j.aviso).toMatch(/não chegou ao cofre do social/); // …e a tela fica sabendo que o social não
    expect(JSON.stringify(j)).not.toContain("nova-456");
  });

  it("apagar a senha no cadastro também apaga no cofre do social", async () => {
    await post({ clientId: CLIENTE, table: "clients", field: "instagram_password", value: "" });
    const esp = ops.find((o) => o.tabela === "client_access")!.dados as Record<string, unknown>;
    expect(esp.instagram_password).toBeNull();
    const guardada = ops.find((o) => o.tabela === "cofre_senhas_anteriores")!.dados as Record<string, string>;
    expect(guardada.motivo).toBe("remocao");
  });

  it("Google Ads não é espelhado (é do tráfego) e não gera aviso", async () => {
    const j = await (await post({ clientId: CLIENTE, table: "clients", field: "google_ads_password", value: "g-1" })).json();
    expect(j.espelho).toMatchObject({ aplicavel: false });
    expect(j.aviso).toBeNull();
    expect(ops.some((o) => o.tabela === "client_access")).toBe(false);
  });
});

describe("regras puras", () => {
  it("planejarTroca", () => {
    expect(planejarTroca({ anteriorBruto: null, anteriorClaro: null, novoClaro: "x" })).toEqual({ guardarAnterior: false, mudou: true, motivo: "troca" });
    expect(planejarTroca({ anteriorBruto: "v1:a", anteriorClaro: "x", novoClaro: "x" })).toMatchObject({ mudou: false, guardarAnterior: false });
    expect(planejarTroca({ anteriorBruto: "v1:a", anteriorClaro: undefined, novoClaro: "x" })).toMatchObject({ mudou: true, guardarAnterior: true });
    expect(planejarTroca({ anteriorBruto: "v1:a", anteriorClaro: "x", novoClaro: "  " })).toEqual({ guardarAnterior: true, mudou: true, motivo: "remocao" });
  });

  it("histórico nunca guarda texto puro: senha antiga sem cifra é cifrada antes", () => {
    expect(valorParaGuardar("v1:ja:cifrada:sim", () => "nao-usado")).toBe("v1:ja:cifrada:sim");
    expect(valorParaGuardar("senha-legada", (c) => `cifrado(${c})`)).toBe("cifrado(senha-legada)");
  });

  it("campos espelhados e aviso", () => {
    expect(campoEspelhado("clients", "instagram_password")).toBe("instagram_password");
    expect(campoEspelhado("clients", "google_ads_password")).toBeNull();
    expect(campoEspelhado("client_onboarding_submissions", "instagram_password")).toBeNull();
    expect(avisoDoEspelho("facebook_password", { aplicavel: true, ok: true })).toBeNull();
    expect(avisoDoEspelho("facebook_password", { aplicavel: true, ok: false, erro: "x" })).toMatch(/^Meta\/Facebook: salva no cadastro/);
  });
});
