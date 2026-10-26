// @vitest-environment node
// tests/contrato-assinado-d4sign.test.ts — "✅ Cliente X assinou o contrato" no grupo de cadastro
// (lib/contracts/assinatura.ts). A D4Sign é simulada por um fetch falso (documento, cofre, erro, rede caída)
// e o banco é em memória. Dados INVENTADOS.
//
// O que isto protege: mandar duas vezes (webhook repetido, dois ao mesmo tempo, webhook + consulta),
// acreditar no evento sem reler a D4Sign, leitura que falha virar "assinado" ou "não assinado", anunciar
// o histórico do cofre na primeira consulta, travar para sempre um envio que falhou, mandar para grupo de
// cliente, ligar ao cadastro errado, e o resumo da manhã repetir o mesmo nome todo dia.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";

type Linha = Record<string, unknown>;
type Erro = { message: string; code?: string };
const db: Record<string, Linha[]> = {};
/** Faz a próxima operação nesta tabela falhar (leitura ou escrita). */
const falhaNaTabela: Record<string, Erro | undefined> = {};

/** Os defaults das colunas, como o Postgres põe na linha nova (migration 20261026150000). */
const PADROES: Record<string, Linha> = { d4sign_documentos: { pdf_tentativas: 0, signatarios: [] }, d4sign_config: { historico: [] } };

class Consulta {
  private filtros: ((r: Linha) => boolean)[] = [];
  private op: "select" | "insert" | "update" | "upsert" = "select";
  private dados: Linha | null = null;
  private chave = "id";
  private max: number | null = null;
  constructor(private tabela: string) { db[tabela] ??= []; }
  select() { return this; }
  eq(c: string, v: unknown) { this.filtros.push((r) => r[c] === v); return this; }
  is(c: string, v: unknown) { this.filtros.push((r) => (r[c] ?? null) === v); return this; }
  gte(c: string, v: unknown) { this.filtros.push((r) => r[c] != null && String(r[c]) >= String(v)); return this; }
  in(c: string, vs: unknown[]) { this.filtros.push((r) => vs.includes(r[c])); return this; }
  or(expr: string) {
    const partes = expr.split(",").map((p) => {
      const [col, op, ...resto] = p.split(".");
      const val = resto.join(".");
      return (r: Linha) => op === "is" ? (r[col] ?? null) === null
        : op === "eq" ? r[col] === val
        : op === "lt" ? r[col] != null && String(r[col]) < val : false;
    });
    this.filtros.push((r) => partes.some((f) => f(r)));
    return this;
  }
  order() { return this; }
  limit(n: number) { this.max = n; return this; }
  update(d: Linha) { this.op = "update"; this.dados = d; return this; }
  insert(d: Linha) { this.op = "insert"; this.dados = d; return this; }
  upsert(d: Linha, o?: { onConflict?: string }) { this.op = "upsert"; this.dados = d; this.chave = o?.onConflict ?? "id"; return this; }
  maybeSingle() { return this.exec().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })); }
  then<T>(ok: (r: { data: Linha[] | null; error: Erro | null }) => T, erro?: (e: unknown) => T) {
    return this.exec().then(ok, erro);
  }
  private async exec(): Promise<{ data: Linha[] | null; error: Erro | null }> {
    await Promise.resolve(); // uma volta no event loop: duas chamadas "ao mesmo tempo" se cruzam
    const falha = falhaNaTabela[this.tabela];
    if (falha) return { data: null, error: falha };
    const t = db[this.tabela];
    if (this.op === "insert") {
      const linha = this.tabela === "d4sign_chamadas" ? { em: new Date().toISOString(), ...this.dados } : { ...this.dados };
      t.push(linha); return { data: [{ ...linha }], error: null };
    }
    if (this.op === "upsert") {
      const ja = t.find((r) => r[this.chave] === this.dados![this.chave]);
      if (ja) Object.assign(ja, this.dados); else t.push({ ...(PADROES[this.tabela] ?? {}), ...this.dados });
      return { data: null, error: null };
    }
    let alvo = t.filter((r) => this.filtros.every((f) => f(r)));
    if (this.op === "update") { alvo.forEach((r) => Object.assign(r, this.dados)); return { data: alvo.map((r) => ({ ...r })), error: null }; }
    if (this.max != null) alvo = alvo.slice(0, this.max);
    return { data: alvo.map((r) => ({ ...r })), error: null };
  }
}

/** Storage simulado (bucket legal-docs). */
const arquivos = new Map<string, Buffer>();
let falhaNoStorage: string | null = null;
const storage = {
  from: () => ({
    upload: async (caminho: string, dados: Buffer) => {
      if (falhaNoStorage) return { data: null, error: { message: falhaNoStorage } };
      if (arquivos.has(caminho)) return { data: null, error: { message: "The resource already exists" } };
      arquivos.set(caminho, dados); return { data: { path: caminho }, error: null };
    },
    remove: async (caminhos: string[]) => { caminhos.forEach((c) => arquivos.delete(c)); return { data: null, error: null }; },
  }),
};

const envio = vi.hoisted(() => ({ fn: vi.fn() }));
const usuario = vi.hoisted(() => ({ atual: null as null | { id: string; email: string; isAdmin: boolean } }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: (t: string) => new Consulta(t), storage } }));
vi.mock("@/lib/cs/notify", () => ({ csSendGroupText: envio.fn }));
vi.mock("@/lib/api/cron-guard", () => ({ requireCron: () => null, isCronRequest: () => true }));
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => usuario.atual }));

// ── A D4Sign de mentira ──────────────────────────────────────────────────────────────────────────
const TOKEN = "token-de-teste";
const CRYPT = "crypt-de-teste";
const SEGREDO_MAC = "segredo-mac-de-teste";
const COFRE = "0b0b0b0b-0000-4000-8000-000000000001";
const OUTRO_COFRE = "0b0b0b0b-0000-4000-8000-000000000002";

const d4 = {
  docs: new Map<string, Linha>(),
  /** Como a D4Sign vai falhar na próxima chamada (e nas seguintes, até voltar a null). */
  falhar: null as null | "500" | "rede" | "timeout" | "html",
  chamadas: [] as string[],
  /** Como o arquivo do PDF vem: pdf de verdade, html no lugar, ou fora do ar. */
  pdf: "ok" as "ok" | "html" | "fora",
};
const PDF_FALSO = Buffer.from("%PDF-1.4\n% contrato assinado de mentira\n%%EOF\n", "latin1");
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
async function fetchFalso(entrada: RequestInfo | URL): Promise<Response> {
  const url = new URL(String(entrada));
  d4.chamadas.push(url.pathname);
  if (d4.falhar === "rede") throw new TypeError("fetch failed");
  if (d4.falhar === "timeout") { const e = new Error("The operation was aborted due to timeout"); e.name = "TimeoutError"; throw e; }
  if (d4.falhar === "500") return json({ message: "Erro interno" }, 500);
  if (d4.falhar === "html") return new Response("<html>502 Bad Gateway</html>", { status: 200 });
  if (url.pathname.startsWith("/api/") && (url.searchParams.get("tokenAPI") !== TOKEN || url.searchParams.get("cryptKey") !== CRYPT)) return json({ message: "Token inválido" }, 401);
  let m = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/list$/);
  if (m) {
    const d = d4.docs.get(m[1]);
    return d ? json([d]) : json({ message: "Documento não encontrado" }, 404);
  }
  if (url.pathname === "/api/v1/webhooks/v2/") return json({ message: "URL cadastrada/atualizada com sucesso!" });
  m = url.pathname.match(/^\/arquivos\/([^/]+)\.pdf$/);
  if (m) {
    if (d4.pdf === "fora") return new Response("indisponível", { status: 503 });
    if (d4.pdf === "html") return new Response("<html>login</html>", { status: 200 });
    return new Response(PDF_FALSO, { status: 200, headers: { "content-type": "application/pdf" } });
  }
  m = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/download$/);
  if (m) return d4.docs.has(m[1]) ? json({ url: `https://d4sign.exemplo/arquivos/${m[1]}.pdf`, name: "contrato.pdf" }) : json({ message: "não encontrado" }, 404);
  m = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/safe$/);
  if (m) {
    const doCofre = [...d4.docs.values()].filter((d) => d.uuidSafe === m![1]).map(({ list: _l, ...resto }) => resto);
    return json([{ total_documents: String(doCofre.length), total_pages: "1", current_page: url.searchParams.get("pg") ?? "1" }, ...doCofre]);
  }
  return json({ message: "rota desconhecida" }, 404);
}

const DOC_ZE = "d0c00000-0000-4000-8000-0000000000a1";
const DOC_BRUNO = "d0c00000-0000-4000-8000-0000000000b2";
const DOC_ANTIGO = "d0c00000-0000-4000-8000-0000000000c3";
const DOC_SEM_CADASTRO = "d0c00000-0000-4000-8000-0000000000d4";

/** Documento como a D4Sign devolve em /documents/{uuid}/list. Datas no horário de Brasília. */
function docD4(uuid: string, p: { nome?: string; status?: string; emailCliente?: string; enviadoEm?: string; assinadoEm?: string; cofre?: string } = {}): Linha {
  const status = p.status ?? "4";
  const fechou = status === "4";
  const enviado = p.enviadoEm ?? "2026-10-21 10:00:00";
  const assinado = p.assinadoEm ?? "2026-10-26 14:02:27";
  return {
    uuidDoc: uuid, nameDoc: p.nome ?? "Padaria do Zé - Contrato - Social Media.docx", type: "application/pdf",
    size: "118990", pages: "9", uuidSafe: p.cofre ?? COFRE, safeName: "Contratos Lone Midia",
    statusId: status, statusName: fechou ? "Finalizado" : "Aguardando Assinaturas", statusComment: "", whoCanceled: "",
    list: [
      // A Lone assina quando manda; o documento fecha quando o cliente assina.
      { key_signer: "s1", email: "roberto@lone.exemplo", user_name: "Roberto", signed: "1", date: enviado,
        sign_info: { date_signed: enviado, date_signed_atom: `${enviado.replace(" ", "T")}-03:00` } },
      { key_signer: "s2", email: p.emailCliente ?? "dono@padariadoze.exemplo", user_name: "José", signed: fechou ? "1" : "0", date: enviado,
        sign_info: fechou ? { date_signed: assinado, date_signed_atom: `${assinado.replace(" ", "T")}-03:00` } : {} },
    ],
  };
}

const { POST: webhook } = await import("@/app/api/integracoes/d4sign/route");
const { POST: consulta } = await import("@/app/api/system/contratos-d4sign/route");
const A = await import("@/lib/contracts/assinatura");
const D = await import("@/lib/contracts/d4sign");
const { montarManha } = await import("@/lib/cs/manha");
const CFG = await import("@/lib/contracts/d4sign-config");
const { GET: configGet, POST: configPost } = await import("@/app/api/contracts/d4sign/config/route");
const { GET: docsGet } = await import("@/app/api/contracts/d4sign/route");

const GRUPO_CADASTRO = "120363000000000001@g.us";
const GRUPO_DO_ZE = "120363999999999999@g.us";
const ENV_ORIGINAL = { ...process.env };
const AGORA = new Date("2026-10-26T17:30:00Z"); // segunda, 14h30 em Brasília

const mac = (uuid: string) => `sha256=${createHmac("sha256", SEGREDO_MAC).update(uuid).digest("hex")}`;

function evento(uuid: string, o: { tipo?: string; hmac?: string | null; dry?: boolean; formato?: "form" | "urlencoded" | "json" } = {}) {
  const campos = { uuid, type_post: o.tipo ?? "1", message: "Finished document", event_datetime: "2026-10-26T14:02:30-03:00" };
  const headers = new Headers();
  if (o.hmac !== null) headers.set("Content-Hmac", o.hmac ?? mac(uuid));
  let body: BodyInit;
  if (o.formato === "json") { body = JSON.stringify(campos); headers.set("content-type", "application/json"); }
  else if (o.formato === "urlencoded") { body = new URLSearchParams(campos).toString(); headers.set("content-type", "application/x-www-form-urlencoded"); }
  else { const fd = new FormData(); for (const [k, v] of Object.entries(campos)) fd.set(k, v); body = fd; }
  return new NextRequest(`https://painel.lonemidia.com/api/integracoes/d4sign${o.dry ? "?dry=1" : ""}`, { method: "POST", body, headers });
}
const rodarConsulta = (q = "") => consulta(new NextRequest(`https://painel.lonemidia.com/api/system/contratos-d4sign${q}`, { method: "POST" }));

const doc = (uuid: string) => db.d4sign_documentos.find((d) => d.document_uuid === uuid);
const mensagens = () => envio.fn.mock.calls.map((c) => ({ grupo: c[0] as string, texto: c[1] as string }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  for (const k of Object.keys(db)) delete db[k];
  for (const k of Object.keys(falhaNaTabela)) delete falhaNaTabela[k];
  db.clients = [
    { id: "cli-ze", name: "Padaria do Zé", nome_fantasia: null, email: "Dono@PadariaDoZe.exemplo", email_corporativo: null, churned_at: null, whatsapp_group_jid: GRUPO_DO_ZE, contrato_assinado_em: null },
    { id: "cli-bruno", name: "Bruno das Tintas", nome_fantasia: "Bruno Tintas", email: "contato@bruno.exemplo", email_corporativo: null, churned_at: null, whatsapp_group_jid: "120363888@g.us", contrato_assinado_em: null },
    { id: "cli-veneza", name: "Veneza", nome_fantasia: null, email: null, email_corporativo: null, churned_at: null, whatsapp_group_jid: null, contrato_assinado_em: null },
    { id: "cli-veneza-ni", name: "Veneza Nova Iguaçu", nome_fantasia: null, email: null, email_corporativo: null, churned_at: null, whatsapp_group_jid: null, contrato_assinado_em: null },
  ];
  db.contracts = [
    { id: "ct-ze-v1", client_id: "cli-ze", created_at: "2025-10-01T12:00:00Z", signed_at: "2025-10-03T12:00:00Z", status: "expired", d4sign_document_uuid: null, d4sign_assinado_em: null },
    { id: "ct-ze-v2", client_id: "cli-ze", created_at: "2026-10-20T12:00:00Z", signed_at: null, status: "draft", d4sign_document_uuid: null, d4sign_assinado_em: null },
  ];
  db.d4sign_documentos = [];
  d4.docs.clear();
  d4.falhar = null;
  d4.pdf = "ok";
  d4.chamadas.length = 0;
  arquivos.clear();
  falhaNoStorage = null;
  usuario.atual = null;
  CFG.esquecerConfigD4Sign();
  d4.docs.set(DOC_ZE, docD4(DOC_ZE));
  vi.stubGlobal("fetch", fetchFalso);
  Object.assign(process.env, {
    D4SIGN_API_TOKEN: TOKEN, D4SIGN_CRYPT_KEY: CRYPT, D4SIGN_HMAC_SECRET: SEGREDO_MAC, D4SIGN_SAFE_UUID: COFRE,
    D4SIGN_API_URL: "https://d4sign.exemplo/api/v1", CS_CADASTRO_GROUP_JID: GRUPO_CADASTRO,
    D4SIGN_EMAIL_ROBERTO: "roberto@lone.exemplo",
    VAULT_KEY: Buffer.alloc(32, 7).toString("base64"),
  });
  envio.fn.mockReset();
  envio.fn.mockResolvedValue({ ok: true, id: "msg1" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  process.env = { ...ENV_ORIGINAL };
});

// ── Puras ────────────────────────────────────────────────────────────────────────────────────────

describe("o nome, a data e a mensagem", () => {
  it("o nome do cliente sai do nome do arquivo que o Lone OS gera", () => {
    expect(A.nomeDoDocumento("Padaria do Zé V2 - Contrato - Social Media.docx")).toBe("Padaria do Zé");
    expect(A.nomeDoDocumento("Bruno Tintas - Contrato - Tráfego Pago.pdf")).toBe("Bruno Tintas");
    expect(A.nomeDoDocumento("Contrato - Óticas Raki.pdf")).toBe("Óticas Raki");
  });

  it("distrato e aditivo não viram 'assinou o contrato'", () => {
    expect(A.tipoDoDocumento("Distrato - Padaria do Zé.pdf")).toBe("documento");
    expect(A.tipoDoDocumento("Padaria do Zé - Contrato - Social Media.docx")).toBe("contrato");
  });

  it("datas da D4Sign: ISO com fuso, 'aaaa-mm-dd hh:mm:ss' e 'dd/mm/aaaa' (Brasília); o resto é null", () => {
    expect(D.lerDataD4Sign("2026-10-26T14:02:27-03:00")).toBe("2026-10-26T17:02:27.000Z");
    expect(D.lerDataD4Sign("2026-10-26T14:02:27-0300")).toBe("2026-10-26T17:02:27.000Z");
    expect(D.lerDataD4Sign("2026-10-26 14:02:27")).toBe("2026-10-26T17:02:27.000Z");
    expect(D.lerDataD4Sign("26/10/2026 14:02")).toBe("2026-10-26T17:02:00.000Z");
    expect(D.lerDataD4Sign("ontem")).toBeNull();
    expect(D.lerDataD4Sign(undefined)).toBeNull();
  });

  it("a mensagem: nome em negrito, 'assinou o contrato' e a data — curta", () => {
    const m = A.mensagemAssinatura({ nome: "Padaria do Zé", assinadoEm: "2026-10-26T17:02:27Z", tipo: "contrato", nomeDocumento: "x", ligado: true });
    expect(m).toBe("✅ *Padaria do Zé* assinou o contrato em 26/10.");
  });

  it("sem cadastro ligado, a mensagem diz que a data não foi para a ficha", () => {
    const m = A.mensagemAssinatura({ nome: "Loja Nova", assinadoEm: null, tipo: "contrato", nomeDocumento: "x", ligado: false });
    expect(m.split("\n")).toHaveLength(2);
    expect(m).toMatch(/Não achei o cadastro no Lone OS/);
  });

  it("Content-Hmac: sha256 do UUID com a Secret Key MAC; qualquer diferença recusa", () => {
    expect(D.hmacConfere(DOC_ZE, mac(DOC_ZE), SEGREDO_MAC)).toBe(true);
    expect(D.hmacConfere(DOC_ZE, mac(DOC_BRUNO), SEGREDO_MAC)).toBe(false);
    expect(D.hmacConfere(DOC_ZE, null, SEGREDO_MAC)).toBe(false);
    expect(D.hmacConfere(DOC_ZE, "sha256=abc", SEGREDO_MAC)).toBe(false);
  });
});

describe("ligar ao cadastro (só par único)", () => {
  const clientes = () => db.clients as unknown as Parameters<typeof A.ligarAoCadastro>[1];
  const sig = (email: string | null) => [{ email, nome: null, assinou: true, assinadoEm: null, incluidoEm: null, chave: null }];

  it("pelo e-mail de quem assinou (sem diferenciar maiúscula)", () => {
    expect(A.ligarAoCadastro({ nome: "qualquer.pdf", signatarios: sig("dono@padariadoze.exemplo") }, clientes()))
      .toMatchObject({ clientId: "cli-ze", vinculo: "email" });
  });
  it("pelo nome do arquivo quando o e-mail não bate", () => {
    expect(A.ligarAoCadastro({ nome: "Bruno Tintas - Contrato - Tráfego Pago.docx", signatarios: sig("outro@x.exemplo") }, clientes()))
      .toMatchObject({ clientId: "cli-bruno", vinculo: "nome" });
  });
  it("'Veneza Nova Iguaçu' não cai na Veneza (o nome mais longo contém o outro)", () => {
    expect(A.ligarAoCadastro({ nome: "Contrato Veneza Nova Iguacu assinado.pdf", signatarios: sig(null) }, clientes()).clientId).toBe("cli-veneza-ni");
  });
  it("nenhum par: não chuta", () => {
    expect(A.ligarAoCadastro({ nome: "Loja Nova - Contrato - Social Media.docx", signatarios: sig("x@y.exemplo") }, clientes()))
      .toMatchObject({ clientId: null, vinculo: null });
  });
  it("e-mail de dois cadastros sem desempate pelo nome: não chuta", () => {
    const dois = [...clientes(), { id: "cli-ze-2", name: "Zé Filial", email: "dono@padariadoze.exemplo" }];
    expect(A.ligarAoCadastro({ nome: "documento.pdf", signatarios: sig("dono@padariadoze.exemplo") }, dois).clientId).toBeNull();
  });
});

// ── Webhook ──────────────────────────────────────────────────────────────────────────────────────

describe("webhook: assinou → uma mensagem no grupo de cadastro", () => {
  it("relê a D4Sign, manda '✅ *Padaria do Zé* assinou o contrato em 26/10.', grava a data e fecha o contrato com o PDF", async () => {
    const res = await webhook(evento(DOC_ZE));
    const corpo = await res.json();
    expect(res.status).toBe(200);
    expect(corpo).toMatchObject({ ok: true, acao: "avisado", nome: "Padaria do Zé", clientId: "cli-ze", contractId: "ct-ze-v2", vinculo: "email" });
    expect(d4.chamadas).toEqual([`/api/v1/documents/${DOC_ZE}/list`, `/api/v1/documents/${DOC_ZE}/download`, `/arquivos/${DOC_ZE}.pdf`]);
    expect(db.d4sign_chamadas.map((c) => c.origem)).toEqual(["webhook", "pdf"]);
    expect(mensagens()).toEqual([{ grupo: GRUPO_CADASTRO, texto: "✅ *Padaria do Zé* assinou o contrato em 26/10." }]);
    expect(envio.fn.mock.calls[0][3]).toMatchObject({ destino: "interno", idem: `contrato-assinado:${DOC_ZE}`, clientId: "cli-ze" });

    const ct = db.contracts.find((c) => c.id === "ct-ze-v2")!;
    expect(ct).toMatchObject({ d4sign_document_uuid: DOC_ZE, d4sign_assinado_em: "2026-10-26T17:02:27.000Z" });
    // A mesma regra do Upload assinado: PDF no lugar de sempre + signed_at + ativo.
    expect(ct).toMatchObject({ status: "active", signed_at: "2026-10-26T17:02:27.000Z", signed_uploaded_by: "D4Sign (automático)", signature_method: "d4sign_auto" });
    expect(String(ct.signed_pdf_path)).toMatch(/^legal:\/\/contracts-signed\/cli-ze\/ct-ze-v2-v\d+-signed-d4sign-\d+\.pdf$/);
    expect([...arquivos.values()][0].equals(PDF_FALSO)).toBe(true);
    expect(corpo.pdf).toMatchObject({ ok: true, anexado: true, contratoFechado: true });
    expect(db.contract_audit_log).toEqual([expect.objectContaining({ contract_id: "ct-ze-v2", action: "signed_d4sign" })]);
    expect(db.timeline_entries[0]).toMatchObject({ client_id: "cli-ze", actor: "D4Sign (automático)" });
    expect(db.contracts.find((c) => c.id === "ct-ze-v1")!.d4sign_document_uuid).toBeNull();
    expect(db.clients.find((c) => c.id === "cli-ze")!.contrato_assinado_em).toBe("2026-10-26T17:02:27.000Z");
    expect(doc(DOC_ZE)).toMatchObject({ status: "assinado", origem: "webhook", aviso_enviado_em: AGORA.toISOString(), pdf_tentativas: 1 });
    expect(doc(DOC_ZE)!.signatarios).toEqual([
      expect.objectContaining({ email: "roberto@lone.exemplo", papel: "lone", assinou: true, chave: "s1" }),
      expect.objectContaining({ email: "dono@padariadoze.exemplo", papel: "cliente", assinou: true, chave: "s2" }),
    ]);
  });

  it("aceita o corpo em form-data, urlencoded e JSON", async () => {
    for (const formato of ["urlencoded", "json"] as const) {
      db.d4sign_documentos = [];
      envio.fn.mockClear();
      const r = await webhook(evento(DOC_ZE, { formato }));
      expect((await r.json()).acao, formato).toBe("avisado");
    }
  });

  it("evento REPETIDO: a segunda entrega responde 200 e não manda de novo", async () => {
    await webhook(evento(DOC_ZE));
    const res = await webhook(evento(DOC_ZE));
    expect(res.status).toBe(200);
    expect((await res.json()).acao).toBe("ja_avisado");
    expect(envio.fn).toHaveBeenCalledTimes(1);
  });

  it("dois eventos AO MESMO TEMPO (retry da D4Sign cruzando): uma mensagem só e um PDF só", async () => {
    const [a, b] = await Promise.all([webhook(evento(DOC_ZE)), webhook(evento(DOC_ZE))]);
    const acoes = [(await a.json()).acao, (await b.json()).acao].sort();
    expect(acoes).toEqual(["avisado", "ja_avisado"]);
    expect(envio.fn).toHaveBeenCalledTimes(1);
    expect(arquivos.size).toBe(1);
    expect(d4.chamadas.filter((c) => c.endsWith("/download"))).toHaveLength(1);
  });

  it("um signatário assinou mas falta o cliente: não avisa, registra como pendente", async () => {
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "3" }));
    const corpo = await (await webhook(evento(DOC_ZE, { tipo: "4" }))).json();
    expect(corpo).toMatchObject({ ok: true, acao: "registrado", status: "pendente" });
    expect(envio.fn).not.toHaveBeenCalled();
    expect(doc(DOC_ZE)).toMatchObject({ status: "pendente", enviado_em: "2026-10-21T13:00:00.000Z" });
    expect(db.contracts.find((c) => c.id === "ct-ze-v2")!.d4sign_assinado_em).toBeNull();
  });

  it("cancelado para reenviar corrigido: o contrato se solta e o documento novo se liga a ele", async () => {
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "3" }));
    await webhook(evento(DOC_ZE, { tipo: "4" }));
    expect(db.contracts.find((c) => c.id === "ct-ze-v2")!.d4sign_document_uuid).toBe(DOC_ZE);
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "6" }));
    await webhook(evento(DOC_ZE, { tipo: "3" }));
    expect(doc(DOC_ZE)!.status).toBe("cancelado");
    expect(db.contracts.find((c) => c.id === "ct-ze-v2")!.d4sign_document_uuid).toBeNull();
    d4.docs.set(DOC_BRUNO, docD4(DOC_BRUNO, { enviadoEm: "2026-10-24 10:00:00" }));
    expect(await (await webhook(evento(DOC_BRUNO))).json()).toMatchObject({ acao: "avisado", contractId: "ct-ze-v2" });
    expect(envio.fn).toHaveBeenCalledTimes(1);
  });

  it("o evento diz 'finalizado' mas a D4Sign diz que não: vale a D4Sign", async () => {
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "3" }));
    await webhook(evento(DOC_ZE, { tipo: "1" }));
    expect(envio.fn).not.toHaveBeenCalled();
  });

  it("assinatura do webhook que não confere: 401, nem lê a D4Sign", async () => {
    const res = await webhook(evento(DOC_ZE, { hmac: mac(DOC_BRUNO) }));
    expect(res.status).toBe(401);
    expect(d4.chamadas).toEqual([]);
    expect(envio.fn).not.toHaveBeenCalled();
    expect((await webhook(evento(DOC_ZE, { hmac: null }))).status).toBe(401);
  });

  it("sem UUID: 400", async () => {
    const res = await webhook(new NextRequest("https://painel.lonemidia.com/api/integracoes/d4sign", { method: "POST", body: "type_post=1" }));
    expect(res.status).toBe(400);
  });

  it("documento de outro cofre (não é contrato): ignora", async () => {
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { cofre: OUTRO_COFRE }));
    const corpo = await (await webhook(evento(DOC_ZE))).json();
    expect(corpo).toMatchObject({ ok: true, acao: "ignorado" });
    expect(envio.fn).not.toHaveBeenCalled();
  });

  it("sem cadastro ligado: avisa com o nome do arquivo e não grava em ficha nenhuma", async () => {
    d4.docs.set(DOC_SEM_CADASTRO, docD4(DOC_SEM_CADASTRO, { nome: "Loja Nova - Contrato - Social Media.docx", emailCliente: "dono@lojanova.exemplo" }));
    const corpo = await (await webhook(evento(DOC_SEM_CADASTRO))).json();
    expect(corpo).toMatchObject({ acao: "avisado", clientId: null, contractId: null });
    expect(mensagens()[0].texto).toBe("✅ *Loja Nova* assinou o contrato em 26/10.\n_Não achei o cadastro no Lone OS: a data não foi gravada na ficha._");
    expect(db.clients.every((c) => c.contrato_assinado_em === null)).toBe(true);
  });

  it("assinado há 10 dias (não é novidade): registra em silêncio e não cai no rascunho mais novo", async () => {
    d4.docs.set(DOC_ANTIGO, docD4(DOC_ANTIGO, { assinadoEm: "2026-10-16 09:00:00", enviadoEm: "2026-10-15 09:00:00" }));
    const corpo = await (await webhook(evento(DOC_ANTIGO))).json();
    expect(corpo).toMatchObject({ ok: true, acao: "registrado", clientId: "cli-ze", contractId: null });
    expect(db.contracts.find((c) => c.id === "ct-ze-v2")!.d4sign_document_uuid).toBeNull();
    expect(corpo.motivo).toMatch(/16\/10, há mais de 4 dias/);
    expect(envio.fn).not.toHaveBeenCalled();
    expect(doc(DOC_ANTIGO)!.aviso_motivo).toMatch(/não é novidade/);
  });

  it("o grupo configurado é o de um cliente: não manda", async () => {
    process.env.CS_CADASTRO_GROUP_JID = GRUPO_DO_ZE;
    const corpo = await (await webhook(evento(DOC_ZE))).json();
    expect(corpo).toMatchObject({ ok: false, acao: "erro" });
    expect(corpo.motivo).toMatch(/é de um cliente/);
    expect(envio.fn).not.toHaveBeenCalled();
  });
});

describe("webhook: falha de leitura nunca vira resposta", () => {
  for (const tipo of ["500", "rede", "timeout", "html"] as const) {
    it(`D4Sign ${tipo}: 503 (a D4Sign repete), não grava assinatura, não manda`, async () => {
      d4.falhar = tipo;
      const res = await webhook(evento(DOC_ZE));
      expect(res.status).toBe(503);
      const corpo = await res.json();
      expect(corpo).toMatchObject({ ok: false, tentarDeNovo: true, acao: "erro" });
      expect(corpo.motivo).not.toContain(TOKEN);
      expect(envio.fn).not.toHaveBeenCalled();
      expect(doc(DOC_ZE)).toBeUndefined();
      expect(db.contracts.find((c) => c.id === "ct-ze-v2")!.d4sign_assinado_em).toBeNull();
    });
  }

  it("a D4Sign volta: o retry do webhook avisa normalmente", async () => {
    d4.falhar = "500";
    expect((await webhook(evento(DOC_ZE))).status).toBe(503);
    d4.falhar = null;
    expect((await (await webhook(evento(DOC_ZE))).json()).acao).toBe("avisado");
    expect(envio.fn).toHaveBeenCalledTimes(1);
  });

  it("o banco não lê o registro: 503, não manda", async () => {
    falhaNaTabela.d4sign_documentos = { message: "connection reset" };
    const res = await webhook(evento(DOC_ZE));
    expect(res.status).toBe(503);
    expect(envio.fn).not.toHaveBeenCalled();
  });

  it("migration não aplicada: 503 com o nome da migration, não manda", async () => {
    falhaNaTabela.d4sign_documentos = { message: 'relation "public.d4sign_documentos" does not exist', code: "42P01" };
    const corpo = await (await webhook(evento(DOC_ZE))).json();
    expect(corpo.motivo).toMatch(/20261026150000_contrato_assinado_d4sign/);
    expect(envio.fn).not.toHaveBeenCalled();
  });

  it("integração desligada (sem a chave): 503, sem ler nada", async () => {
    delete process.env.D4SIGN_API_TOKEN;
    expect((await webhook(evento(DOC_ZE))).status).toBe(503);
    expect(d4.chamadas).toEqual([]);
  });
});

describe("webhook: o envio pelo WhatsApp", () => {
  it("falhou: solta a trava, responde 503, e o próximo evento manda", async () => {
    envio.fn.mockResolvedValueOnce({ ok: false, error: "HTTP 500" });
    const res = await webhook(evento(DOC_ZE));
    expect(res.status).toBe(503);
    expect(doc(DOC_ZE)).toMatchObject({ aviso_reservado_em: null });
    expect(doc(DOC_ZE)!.aviso_motivo).toMatch(/envio falhou/);
    expect((await (await webhook(evento(DOC_ZE))).json()).acao).toBe("avisado");
    expect(envio.fn).toHaveBeenCalledTimes(2);
  });

  it("incerto (pode ter saído): mantém a trava, não repete", async () => {
    envio.fn.mockResolvedValueOnce({ ok: false, error: "o WhatsApp não respondeu a tempo (pode ter saído)", incerto: true });
    const res = await webhook(evento(DOC_ZE));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(false);
    expect(doc(DOC_ZE)!.aviso_reservado_em).toBeTruthy();
    await webhook(evento(DOC_ZE));
    expect(envio.fn).toHaveBeenCalledTimes(1);
  });
});

describe("webhook: ensaio (?dry=1)", () => {
  it("mostra a mensagem que sairia, sem gravar e sem mandar", async () => {
    const corpo = await (await webhook(evento(DOC_ZE, { dry: true, hmac: null }))).json();
    expect(corpo).toMatchObject({ dry: true, acao: "avisaria", mensagem: "✅ *Padaria do Zé* assinou o contrato em 26/10." });
    expect(envio.fn).not.toHaveBeenCalled();
    expect(db.d4sign_documentos).toEqual([]);
    expect(db.contracts.find((c) => c.id === "ct-ze-v2")!.d4sign_assinado_em).toBeNull();
  });
});

// ── Consulta de hora em hora ─────────────────────────────────────────────────────────────────────

describe("consulta do cofre", () => {
  beforeEach(() => {
    d4.docs.clear();
    d4.docs.set(DOC_ANTIGO, docD4(DOC_ANTIGO, { nome: "Bruno Tintas - Contrato - Tráfego Pago.docx", emailCliente: "contato@bruno.exemplo", enviadoEm: "2026-09-01 10:00:00", assinadoEm: "2026-09-02 11:00:00" }));
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "3", enviadoEm: "2026-10-21 10:00:00" }));
    d4.docs.set(DOC_SEM_CADASTRO, docD4(DOC_SEM_CADASTRO, { nome: "Loja Nova - Contrato - Social Media.docx", emailCliente: "dono@lojanova.exemplo", assinadoEm: "2026-10-25 16:40:00" }));
  });

  it("primeira consulta: o já assinado entra em silêncio e sem chamada; só o pendente novo é relido", async () => {
    const corpo = await (await rodarConsulta()).json();
    expect(corpo).toMatchObject({ ok: true, noCofre: 3, lidos: 1, sobraram: 0 });
    expect(d4.chamadas).toEqual([`/api/v1/documents/${COFRE}/safe`, `/api/v1/documents/${DOC_ZE}/list`]);
    expect(envio.fn).not.toHaveBeenCalled();
    expect(doc(DOC_ANTIGO)).toMatchObject({ status: "assinado", client_id: "cli-bruno" });
    expect(doc(DOC_SEM_CADASTRO)).toMatchObject({ status: "assinado" });
    expect(doc(DOC_ANTIGO)!.aviso_reservado_em ?? null).toBeNull();
    expect(doc(DOC_ZE)).toMatchObject({ status: "pendente", client_id: "cli-ze" });
    expect(arquivos.size).toBe(0);
  });

  it("segunda consulta: só relê o que mudou; o pendente que fechou vira aviso e PDF, nada se repete", async () => {
    await rodarConsulta();
    envio.fn.mockClear();
    d4.chamadas.length = 0;

    const nada = await (await rodarConsulta()).json();
    expect(nada.lidos).toBe(0);
    expect(d4.chamadas).toEqual([`/api/v1/documents/${COFRE}/safe`]);

    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "4", assinadoEm: "2026-10-26 13:10:00" }));
    const corpo = await (await rodarConsulta()).json();
    expect(corpo.lidos).toBe(1);
    expect(mensagens().map((m) => m.texto)).toEqual(["✅ *Padaria do Zé* assinou o contrato em 26/10."]);
    expect(doc(DOC_ZE)).toMatchObject({ status: "assinado", origem: "consulta" });
    expect(db.contracts.find((c) => c.id === "ct-ze-v2")).toMatchObject({ status: "active" });
  });

  it("webhook e consulta no mesmo documento: uma mensagem só", async () => {
    d4.docs.set(DOC_ZE, docD4(DOC_ZE));
    await webhook(evento(DOC_ZE));
    await rodarConsulta();
    await rodarConsulta();
    expect(mensagens().filter((m) => m.texto.includes("Padaria do Zé"))).toHaveLength(1);
    expect(arquivos.size).toBe(1);
  });

  it("a listagem do cofre falha: ok:false com o motivo, nada gravado, nada enviado", async () => {
    d4.falhar = "500";
    const corpo = await (await rodarConsulta()).json();
    expect(corpo.ok).toBe(false);
    expect(corpo.erros[0]).toMatch(/D4Sign respondeu 500/);
    expect(db.d4sign_documentos).toEqual([]);
    expect(envio.fn).not.toHaveBeenCalled();
  });

  it("a leitura de UM documento falha: não vira resposta, e é tentado na próxima", async () => {
    await rodarConsulta();
    envio.fn.mockClear();
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "4" }));
    const original = d4.docs.get(DOC_ZE)!;
    d4.docs.delete(DOC_ZE); // some da leitura individual, mas continua na listagem do cofre
    const listar = fetchFalso;
    vi.stubGlobal("fetch", async (e: RequestInfo | URL) => {
      if (String(e).includes("/safe")) { d4.docs.set(DOC_ZE, original); const r = await listar(e); d4.docs.delete(DOC_ZE); return r; }
      return listar(e);
    });
    const corpo = await (await rodarConsulta()).json();
    expect(corpo.ok).toBe(false);
    expect(corpo.erros[0]).toMatch(/404/);
    expect(doc(DOC_ZE)!.status).toBe("pendente");
    expect(envio.fn).not.toHaveBeenCalled();

    vi.stubGlobal("fetch", fetchFalso);
    d4.docs.set(DOC_ZE, original);
    await rodarConsulta();
    expect(mensagens().map((m) => m.texto)).toEqual(["✅ *Padaria do Zé* assinou o contrato em 26/10."]);
  });

  it("ensaio: devolve a mensagem que sairia e o PDF que baixaria, sem gravar nem mandar", async () => {
    await rodarConsulta();
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "4" }));
    const corpo = await (await rodarConsulta("?dry=1")).json();
    expect(corpo.dry).toBe(true);
    expect(corpo.mensagens).toEqual(["✅ *Padaria do Zé* assinou o contrato em 26/10."]);
    expect(corpo.resultados.find((r: { uuid: string }) => r.uuid === DOC_ZE).pdf).toMatchObject({ anexado: false, motivo: "anexaria o PDF assinado da D4Sign" });
    expect(doc(DOC_ZE)!.status).toBe("pendente");
    expect(envio.fn).not.toHaveBeenCalled();
    expect(arquivos.size).toBe(0);
  });

  it("teto por vez: o resto fica para a próxima rodada", async () => {
    d4.docs.set(DOC_BRUNO, docD4(DOC_BRUNO, { status: "3", nome: "Bruno Tintas - Contrato - Tráfego Pago.docx", emailCliente: "contato@bruno.exemplo" }));
    const r = await A.consultarCofre({ limite: 1 });
    expect(r).toMatchObject({ lidos: 1, sobraram: 1 });
  });

  it("sem a chave ou sem o cofre: 'desligado', não é falha", async () => {
    delete process.env.D4SIGN_SAFE_UUID;
    expect(await (await rodarConsulta()).json()).toMatchObject({ ok: true, desligado: expect.stringMatching(/cofre/) });
    delete process.env.D4SIGN_API_TOKEN;
    CFG.esquecerConfigD4Sign();
    expect(await (await rodarConsulta()).json()).toMatchObject({ ok: true, desligado: expect.stringMatching(/D4Sign não configurada/) });
    expect(d4.chamadas).toEqual([]);
  });

  it("?webhook=cadastrar com ?dry=1 só mostra o que cadastraria (cofre + URL deste painel)", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://painel.lonemidia.com";
    const corpo = await (await rodarConsulta("?webhook=cadastrar&dry=1")).json();
    expect(corpo.cadastraria).toEqual({ type: "cofre", uuid: COFRE, url: "https://painel.lonemidia.com/api/integracoes/d4sign" });
    expect(d4.chamadas).toEqual([]);
  });
});

// ── PDF assinado na ficha ────────────────────────────────────────────────────────────────────────

describe("PDF assinado na ficha", () => {
  it("o contrato já tinha PDF subido à mão: não troca; o da D4Sign fica guardado no registro", async () => {
    Object.assign(db.contracts.find((c) => c.id === "ct-ze-v2")!, { d4sign_document_uuid: DOC_ZE, signed_pdf_path: "legal://contracts-signed/cli-ze/manual.pdf" });
    const corpo = await (await webhook(evento(DOC_ZE))).json();
    expect(corpo.pdf).toMatchObject({ ok: true, anexado: true, contratoFechado: false });
    expect(corpo.pdf.motivo).toMatch(/já tinha PDF assinado/);
    expect(db.contracts.find((c) => c.id === "ct-ze-v2")!.signed_pdf_path).toBe("legal://contracts-signed/cli-ze/manual.pdf");
    expect(doc(DOC_ZE)!.pdf_path).toMatch(/^legal:\/\/contracts-signed\/cli-ze\//);
  });

  it("cliente sem contrato registrado no Lone OS: o PDF fica no cadastro e aparece na aba Contratos", async () => {
    db.contracts = [];
    const corpo = await (await webhook(evento(DOC_ZE))).json();
    expect(corpo.pdf).toMatchObject({ ok: true, anexado: true, contratoFechado: false });
    expect(doc(DOC_ZE)!.pdf_path).toMatch(new RegExp(`^legal://contracts-signed/cli-ze/d4sign-${DOC_ZE}-signed-\\d+\\.pdf$`));
    expect(doc(DOC_ZE)!.pdf_sha256).toMatch(/^[0-9a-f]{64}$/);

    usuario.atual = { id: "u1", email: "roberto@lone.exemplo", isAdmin: true };
    const tela = await (await docsGet(new NextRequest("https://painel.lonemidia.com/api/contracts/d4sign?clientId=cli-ze"))).json();
    expect(tela.documentos).toEqual([expect.objectContaining({ documento: DOC_ZE, situacao: "assinado", pdf: doc(DOC_ZE)!.pdf_path })]);
    expect(JSON.stringify(tela)).not.toContain("\"chave\"");
  });

  it("o PDF não veio (não é PDF): o aviso sai, o erro fica registrado e a consulta baixa depois", async () => {
    d4.pdf = "html";
    const corpo = await (await webhook(evento(DOC_ZE))).json();
    expect(corpo.acao).toBe("avisado");
    expect(corpo.pdf).toMatchObject({ ok: false, anexado: false });
    expect(doc(DOC_ZE)).toMatchObject({ pdf_tentativas: 1, pdf_erro: expect.stringMatching(/não é um PDF/) });
    expect(db.contracts.find((c) => c.id === "ct-ze-v2")!.signed_pdf_path ?? null).toBeNull();

    d4.pdf = "ok";
    const consulta1 = await (await rodarConsulta()).json();
    expect(consulta1.pdfs).toEqual([expect.objectContaining({ uuid: DOC_ZE, anexado: true, contratoFechado: true })]);
    expect(db.contracts.find((c) => c.id === "ct-ze-v2")!.status).toBe("active");
    expect(envio.fn).toHaveBeenCalledTimes(1);
  });

  it("o storage recusa: o contrato não fecha e o erro fica registrado", async () => {
    falhaNoStorage = "bucket indisponível";
    const corpo = await (await webhook(evento(DOC_ZE))).json();
    expect(corpo.pdf).toMatchObject({ ok: false, anexado: false });
    expect(doc(DOC_ZE)!.pdf_erro).toMatch(/bucket indisponível/);
    expect(db.contracts.find((c) => c.id === "ct-ze-v2")!.status).toBe("draft");
  });

  it("assinatura de mais de 30 dias: não baixa (é histórico)", async () => {
    d4.docs.set(DOC_ANTIGO, docD4(DOC_ANTIGO, { enviadoEm: "2026-09-01 10:00:00", assinadoEm: "2026-09-02 11:00:00" }));
    await webhook(evento(DOC_ANTIGO));
    expect(d4.chamadas.some((c) => c.endsWith("/download"))).toBe(false);
  });
});

// ── Cota da D4Sign ───────────────────────────────────────────────────────────────────────────────

describe("cota: 10 chamadas por hora", () => {
  const usadas = (n: number) => { db.d4sign_chamadas = Array.from({ length: n }, (_, i) => ({ id: i, em: AGORA.toISOString(), caminho: "/x", origem: "webhook" })); };

  it("a régua: rotina para 4 antes do fim; o resto usa até o limite", async () => {
    const C = await import("@/lib/contracts/d4sign-cota");
    expect(C.cabemAinda(5, 10, "consulta")).toBe(1);
    expect(C.cabemAinda(6, 10, "consulta")).toBe(0);
    expect(C.cabemAinda(9, 10, "webhook")).toBe(1);
    expect(C.limiteDaHora({ D4SIGN_LIMITE_HORA: "60" })).toBe(60);
    expect(C.limiteDaHora({})).toBe(10);
  });

  it("10 chamadas na última hora: o webhook nem chama a D4Sign — 503, e a D4Sign repete depois", async () => {
    usadas(10);
    const res = await webhook(evento(DOC_ZE));
    expect(res.status).toBe(503);
    expect((await res.json()).motivo).toMatch(/limite de chamadas/);
    expect(d4.chamadas).toEqual([]);
    expect(doc(DOC_ZE)).toBeUndefined();
  });

  it("6 usadas: a consulta fica para depois (não é erro) e o webhook ainda passa", async () => {
    usadas(6);
    const corpo = await (await rodarConsulta()).json();
    expect(corpo).toMatchObject({ ok: true, adiado: expect.stringMatching(/deixa as últimas/) });
    expect(d4.chamadas).toEqual([]);
    expect((await (await webhook(evento(DOC_ZE))).json()).acao).toBe("avisado");
  });
});

// ── Chaves no painel ─────────────────────────────────────────────────────────────────────────────

describe("chaves da D4Sign no painel", () => {
  const admin = () => { usuario.atual = { id: "u1", email: "roberto@lone.exemplo", isAdmin: true }; };
  const post = (corpo: unknown) => configPost(new NextRequest("https://painel.lonemidia.com/api/contracts/d4sign/config", { method: "POST", body: JSON.stringify(corpo) }));
  const get = () => configGet(new NextRequest("https://painel.lonemidia.com/api/contracts/d4sign/config"));

  it("o painel vale antes do .env; o campo vazio no painel cai no .env", () => {
    const env = { D4SIGN_API_TOKEN: "do-env", D4SIGN_SAFE_UUID: COFRE };
    expect(CFG.mesclarConfig({ token: "do-painel" }, env)).toMatchObject({ token: "do-painel", cofre: COFRE });
    expect(CFG.mesclarConfig(null, env)).toMatchObject({ token: "do-env" });
    expect(CFG.mesclarConfig({ token: "  " }, {})).toBeNull();
  });

  it("só admin vê ou troca", async () => {
    expect((await get()).status).toBe(403);
    expect((await post({ acao: "salvar", novos: { token: "x".repeat(20) } })).status).toBe(403);
  });

  it("salva cifrado com a VAULT_KEY e a tela nunca recebe a chave de volta", async () => {
    admin();
    const res = await post({ acao: "salvar", novos: { token: "TOKEN-DO-PAINEL-123456" } });
    expect(res.status).toBe(200);
    const linha = db.d4sign_config[0];
    expect(String(linha.token)).toMatch(/^v1:/);
    expect(JSON.stringify(linha)).not.toContain("TOKEN-DO-PAINEL-123456");
    const tela = await (await get()).json();
    expect(JSON.stringify(tela)).not.toContain("TOKEN-DO-PAINEL-123456");
    expect(tela.campos.token).toEqual({ configurado: true, origem: "painel" });
    expect(tela.campos.cryptKey).toEqual({ configurado: true, origem: "servidor" });
    expect(tela.historico[0]).toMatchObject({ quem: "roberto@lone.exemplo", acao: "trocou", campos: ["Token da API (tokenAPI)"] });
  });

  it("a chave do painel é a que vale nas chamadas (o .env sem token não faz falta)", async () => {
    admin();
    delete process.env.D4SIGN_API_TOKEN;
    await post({ acao: "salvar", novos: { token: TOKEN } });
    expect((await (await webhook(evento(DOC_ZE))).json()).acao).toBe("avisado");
  });

  it("valida antes de gravar: cofre que não é UUID, chave com espaço", async () => {
    admin();
    const r = await post({ acao: "salvar", novos: { cofre: "cofre-dos-contratos", token: "abc def ghi jkl" } });
    expect(r.status).toBe(400);
    const corpo = await r.json();
    expect(corpo.error).toMatch(/UUID do cofre/);
    expect(corpo.error).toMatch(/espaço/);
    expect(db.d4sign_config ?? []).toEqual([]);
  });

  it("Testar lê o cofre e guarda o resultado; apagar do painel volta ao .env", async () => {
    admin();
    await post({ acao: "salvar", novos: { cofre: COFRE } });
    const t = await (await post({ acao: "testar" })).json();
    expect(t).toMatchObject({ ok: true, resultado: expect.stringMatching(/Funcionou/) });
    expect(db.d4sign_config[0]).toMatchObject({ teste_ok: true });
    await post({ acao: "salvar", apagar: ["cofre"] });
    const tela = await (await get()).json();
    expect(tela.campos.cofre).toEqual({ configurado: true, origem: "servidor" });
    expect(tela.historico.map((h: { acao: string }) => h.acao)).toEqual(["apagou", "testou", "trocou"]);
  });

  it("'Ligar o aviso da D4Sign' cadastra o webhook do cofre para este painel; sem o segredo, nem tenta", async () => {
    admin();
    process.env.NEXT_PUBLIC_APP_URL = "https://painel.lonemidia.com";
    const r = await (await post({ acao: "webhook" })).json();
    expect(r).toMatchObject({ ok: true, resultado: expect.stringMatching(/painel\.lonemidia\.com\/api\/integracoes\/d4sign/) });
    expect(d4.chamadas).toEqual(["/api/v1/webhooks/v2/"]);
    delete process.env.D4SIGN_HMAC_SECRET;
    d4.chamadas.length = 0;
    expect(await (await post({ acao: "webhook" })).json()).toMatchObject({ ok: false, resultado: expect.stringMatching(/segredo do webhook/) });
    expect(d4.chamadas).toEqual([]);
  });

  it("webhook sem o segredo (Secret Key MAC) fica fechado: cada evento gastaria uma chamada da hora", async () => {
    delete process.env.D4SIGN_HMAC_SECRET;
    const res = await webhook(evento(DOC_ZE));
    expect(res.status).toBe(503);
    expect(d4.chamadas).toEqual([]);
  });
});

// ── Resumo da manhã ──────────────────────────────────────────────────────────────────────────────

describe("linha do resumo da manhã: contrato sem assinatura", () => {
  const pendente = (uuid: string, enviado: string, extra: Linha = {}) => ({
    document_uuid: uuid, nome: "Bruno Tintas - Contrato - Tráfego Pago.docx", status: "pendente",
    client_id: null, contract_id: null, enviado_em: enviado, visto_em: enviado, cobrado_em: null, ...extra,
  });

  it("3 dias ou mais: uma linha, com o nome do cadastro e os dias; menos que isso não entra", async () => {
    db.d4sign_documentos = [
      pendente(DOC_ZE, "2026-10-21T13:00:00Z", { client_id: "cli-ze" }),
      pendente(DOC_BRUNO, "2026-10-25T13:00:00Z"),
    ];
    const c = await A.coletarSemAssinatura(AGORA, { aplicar: true });
    expect(c).toEqual({ texto: "✍️ *Contrato sem assinatura na D4Sign:* Padaria do Zé (5 dias).", itens: [{ uuid: DOC_ZE, nome: "Padaria do Zé", dias: 5 }] });
    expect(doc(DOC_ZE)!.cobrado_em).toBe(AGORA.toISOString());
    expect(doc(DOC_BRUNO)!.cobrado_em).toBeNull();
  });

  it("não repete todo dia: volta só uma semana depois", async () => {
    db.d4sign_documentos = [pendente(DOC_ZE, "2026-10-21T13:00:00Z")];
    const hoje = await A.coletarSemAssinatura(AGORA, { aplicar: true });
    expect("texto" in hoje ? hoje.texto : "").toMatch(/Bruno Tintas \(5 dias\)/);
    const amanha = await A.coletarSemAssinatura(new Date(AGORA.getTime() + 86_400_000), { aplicar: true });
    expect(amanha).toEqual({ texto: "", itens: [] });
    const semana = await A.coletarSemAssinatura(new Date(AGORA.getTime() + 7 * 86_400_000 - 3600_000), { aplicar: true });
    expect("texto" in semana ? semana.texto : "").toMatch(/Bruno Tintas \(12 dias\)/);
  });

  it("ensaio não marca a cobrança", async () => {
    db.d4sign_documentos = [pendente(DOC_ZE, "2026-10-21T13:00:00Z")];
    await A.coletarSemAssinatura(AGORA, { aplicar: false });
    expect(doc(DOC_ZE)!.cobrado_em).toBeNull();
  });

  it("contrato que já fechou pelo PDF na ficha não é cobrado", async () => {
    db.contracts.find((c) => c.id === "ct-ze-v2")!.signed_at = "2026-10-25T12:00:00Z";
    db.d4sign_documentos = [pendente(DOC_ZE, "2026-10-21T13:00:00Z", { client_id: "cli-ze", contract_id: "ct-ze-v2" })];
    expect(await A.coletarSemAssinatura(AGORA, { aplicar: true })).toEqual({ texto: "", itens: [] });
  });

  it("migration não aplicada: seção pulada com o motivo (não derruba a manhã); erro de banco é erro", async () => {
    falhaNaTabela.d4sign_documentos = { message: 'relation "public.d4sign_documentos" does not exist', code: "42P01" };
    expect(await A.coletarSemAssinatura(AGORA, { aplicar: true })).toMatchObject({ pulado: expect.stringMatching(/migration/) });
    falhaNaTabela.d4sign_documentos = { message: "connection reset" };
    expect(await A.coletarSemAssinatura(AGORA, { aplicar: true })).toEqual({ erro: "connection reset" });
  });

  it("mais de 5: os 5 mais antigos e 'e mais N'", () => {
    const itens = Array.from({ length: 7 }, (_, i) => ({ nome: `C${i}`, dias: 3 + i }));
    expect(A.linhaSemAssinatura(itens)).toBe("✍️ *Contrato sem assinatura na D4Sign:* C6 (9 dias), C5 (8 dias), C4 (7 dias), C3 (6 dias), C2 (5 dias) e mais 2.");
  });

  it("entra na manhã depois do setup, como seção própria", () => {
    const m = montarManha([{ chave: "contratos", texto: "✍️ X" }, { chave: "setup", texto: "S" }])!;
    expect(m.secoes).toEqual(["setup", "contratos"]);
    expect(m.texto.endsWith("✍️ X")).toBe(true);
  });
});
