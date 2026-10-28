// @vitest-environment node
// tests/contrato-assinado-d4sign.test.ts — quem assinou e quem falta na D4Sign, avisado no grupo de cadastro
// (lib/contracts/assinatura.ts). A D4Sign é simulada por um fetch falso (documento, cofre, erro, rede caída)
// e o banco é em memória. Dados INVENTADOS.
//
// O que isto protege: mandar duas vezes (webhook repetido, dois ao mesmo tempo, webhook + consulta, a manhã
// rodando duas vezes), acreditar no evento sem reler a D4Sign, leitura que falha virar "assinado" ou "não
// assinado", anunciar o histórico do cofre, travar para sempre um envio que falhou, mandar para grupo de
// cliente, ligar ao cadastro errado, dizer que falta quem já assinou, e a chave da D4Sign voltar para a tela.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";

type Linha = Record<string, unknown>;
type Erro = { message: string; code?: string };
const db: Record<string, Linha[]> = {};
/** Faz a próxima operação nesta tabela falhar (leitura ou escrita). */
const falhaNaTabela: Record<string, Erro | undefined> = {};

/** Os defaults das colunas, como o Postgres põe na linha nova (migration 20261026150000). */
const PADROES: Record<string, Linha> = { d4sign_documentos: { signatarios: [], pdf_tentativas: 0 }, d4sign_config: { historico: [] } };

class Consulta {
  private filtros: ((r: Linha) => boolean)[] = [];
  private op: "select" | "insert" | "update" | "upsert" = "select";
  private dados: Linha | null = null;
  private chave = "id";
  private ignorarRepetidos = false;
  private max: number | null = null;
  constructor(private tabela: string) { db[tabela] ??= []; }
  select() { return this; }
  eq(c: string, v: unknown) { this.filtros.push((r) => r[c] === v); return this; }
  is(c: string, v: unknown) { this.filtros.push((r) => (r[c] ?? null) === v); return this; }
  gte(c: string, v: unknown) { this.filtros.push((r) => r[c] != null && String(r[c]) >= String(v)); return this; }
  in(c: string, vs: unknown[]) { this.filtros.push((r) => vs.includes(r[c])); return this; }
  not(c: string, _op: "is", v: unknown) { this.filtros.push((r) => (r[c] ?? null) !== v); return this; }
  or(expr: string) {
    const partes = expr.split(",").map((p) => {
      const [col, op, ...resto] = p.split(".");
      const val = resto.join(".");
      return (r: Linha) => op === "is" ? (r[col] ?? null) === null
        : op === "eq" ? String(r[col]) === val
        : op === "neq" ? r[col] != null && String(r[col]) !== val
        : op === "lt" ? r[col] != null && String(r[col]) < val
        : op === "gte" ? r[col] != null && String(r[col]) >= val : false;
    });
    this.filtros.push((r) => partes.some((f) => f(r)));
    return this;
  }
  order() { return this; }
  limit(n: number) { this.max = n; return this; }
  update(d: Linha) { this.op = "update"; this.dados = d; return this; }
  insert(d: Linha) { this.op = "insert"; this.dados = d; return this; }
  private lote: Linha[] | null = null;
  upsert(d: Linha | Linha[], o?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert"; this.lote = Array.isArray(d) ? d : [d]; this.dados = this.lote[0];
    this.chave = o?.onConflict ?? "id"; this.ignorarRepetidos = !!o?.ignoreDuplicates; return this;
  }
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
      for (const d of this.lote ?? []) {
        const ja = t.find((r) => r[this.chave] === d[this.chave]);
        if (ja) { if (!this.ignorarRepetidos) Object.assign(ja, d); } else t.push({ ...(PADROES[this.tabela] ?? {}), ...d });
      }
      return { data: null, error: null };
    }
    let alvo = t.filter((r) => this.filtros.every((f) => f(r)));
    if (this.op === "update") { alvo.forEach((r) => Object.assign(r, this.dados)); return { data: alvo.map((r) => ({ ...r })), error: null }; }
    if (this.max != null) alvo = alvo.slice(0, this.max);
    return { data: alvo.map((r) => ({ ...r })), error: null };
  }
}

const envio = vi.hoisted(() => ({ fn: vi.fn() }));
const usuario = vi.hoisted(() => ({ atual: null as null | { id: string; email: string; isAdmin: boolean } }));
const diaUtil = vi.hoisted(() => ({ valor: true }));
/** O storage de mentira (legal-docs): caminho → bytes. */
const armazem = vi.hoisted(() => new Map<string, Buffer>());
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: {
  from: (t: string) => new Consulta(t),
  storage: { from: (b: string) => ({
    upload: async (caminho: string, dados: Buffer) => {
      const k = `${b}/${caminho}`;
      if (armazem.has(k)) return { data: null, error: { message: "The resource already exists" } };
      armazem.set(k, Buffer.from(dados)); return { data: { path: caminho }, error: null };
    },
    remove: async (caminhos: string[]) => { caminhos.forEach((c) => armazem.delete(`${b}/${c}`)); return { data: null, error: null }; },
    download: async (caminho: string) => {
      const v = armazem.get(`${b}/${caminho}`);
      return v ? { data: new Blob([new Uint8Array(v)]), error: null } : { data: null, error: { message: "Object not found" } };
    },
  }) },
} }));
vi.mock("@/lib/cs/notify", () => ({ csSendGroupText: envio.fn }));
vi.mock("@/lib/api/cron-guard", () => ({ requireCron: () => null, isCronRequest: () => true }));
vi.mock("@/lib/supabase/auth-server", () => ({ getServerUser: async () => usuario.atual }));
vi.mock("@/lib/cs/vigilancia", async (original) => ({ ...(await original<object>()), isBusinessDay: async () => diaUtil.valor }));

// ── A D4Sign de mentira ──────────────────────────────────────────────────────────────────────────
const TOKEN = "token-de-teste";
const CRYPT = "crypt-de-teste";
const SEGREDO_MAC = "segredo-mac-de-teste";
const COFRE = "0b0b0b0b-0000-4000-8000-000000000001";
const OUTRO_COFRE = "0b0b0b0b-0000-4000-8000-000000000002"; // "Prestadores de serviço": não é de contrato
const COFRE2 = "0b0b0b0b-0000-4000-8000-000000000003";
const COFRE3 = "0b0b0b0b-0000-4000-8000-000000000004";
const COFRES_DA_CONTA = [
  { "uuid-safe": COFRE, "name-safe": "LM - Lone Growth (pacote completo)" },
  { "uuid-safe": COFRE2, "name-safe": "LM - Assessoria Social (Só midia)" },
  { "uuid-safe": COFRE3, "name-safe": "Renovação de contrato" },
  { "uuid-safe": OUTRO_COFRE, "name-safe": "Prestadores de serviço" },
];

const d4 = {
  docs: new Map<string, Linha>(),
  /** Como a D4Sign vai falhar na próxima chamada (e nas seguintes, até voltar a null). */
  falhar: null as null | "500" | "rede" | "timeout" | "html",
  chamadas: [] as string[],
  /** Corpo das chamadas de envio (uploadbinary, createlist, sendtosigner). */
  corpos: [] as { caminho: string; corpo: Record<string, unknown> }[],
  /** Faz SÓ esta etapa do envio falhar (500). */
  falharEnvio: null as null | "uploadbinary" | "createlist" | "sendtosigner",
};
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
const PDF_FALSO = Buffer.from("%PDF-1.4\n% contrato assinado de mentira\n%%EOF");
async function fetchFalso(entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(entrada));
  // O link do PDF assinado é do armazenamento da D4Sign: não é a API e não conta no limite.
  if (url.hostname === "arquivos.d4sign.exemplo") return new Response(new Uint8Array(PDF_FALSO), { status: 200 });
  d4.chamadas.push(url.pathname);
  if (d4.falhar === "rede") throw new TypeError("fetch failed");
  if (d4.falhar === "timeout") { const e = new Error("The operation was aborted due to timeout"); e.name = "TimeoutError"; throw e; }
  if (d4.falhar === "500") return json({ message: "Erro interno" }, 500);
  if (d4.falhar === "html") return new Response("<html>502 Bad Gateway</html>", { status: 200 });
  if (url.searchParams.get("tokenAPI") !== TOKEN || url.searchParams.get("cryptKey") !== CRYPT) return json({ message: "Token inválido" }, 401);
  let m = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/list$/);
  if (m) {
    const d = d4.docs.get(m[1]);
    return d ? json([d]) : json({ message: "Documento não encontrado" }, 404);
  }
  if (url.pathname === "/api/v1/webhooks/v2/") return json({ message: "URL cadastrada/atualizada com sucesso!" });
  if (url.pathname === "/api/v1/safes") return json(COFRES_DA_CONTA);
  if (url.pathname === "/api/v1/documents/4/status") {
    // Os finalizados da CONTA inteira (todos os cofres), sem signatários.
    const fin = [...d4.docs.values()].filter((d) => d.statusId === "4").map(({ list: _l, ...resto }) => resto);
    return json([{ total_documents: String(fin.length), total_pages: "1", current_page: url.searchParams.get("pg") ?? "1" }, ...fin]);
  }
  const mEnvio = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/(uploadbinary|createlist|sendtosigner)$/);
  if (mEnvio) {
    const corpo = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    d4.corpos.push({ caminho: mEnvio[2], corpo });
    if (d4.falharEnvio === mEnvio[2]) return json({ message: "Erro interno" }, 500);
    if (mEnvio[2] === "uploadbinary") {
      const novo = "d0c00000-0000-4000-8000-0000000000e9";
      d4.docs.set(novo, { uuidDoc: novo, nameDoc: String(corpo.name), uuidSafe: mEnvio[1], statusId: "1", list: [] });
      return json({ uuid: novo });
    }
    if (mEnvio[2] === "sendtosigner") { const d = d4.docs.get(mEnvio[1]); if (d) d.statusId = "3"; }
    return json({ message: "success" });
  }
  const mDown = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/download$/);
  if (mDown) {
    const d = d4.docs.get(mDown[1]);
    return d ? json({ url: `https://arquivos.d4sign.exemplo/${mDown[1]}.pdf`, name: d.nameDoc }) : json({ message: "Documento não encontrado" }, 404);
  }
  if (url.pathname === "/api/v1/documents/3/status") {
    // Os pendentes da CONTA inteira (todos os cofres), sem signatários.
    const pend = [...d4.docs.values()].filter((d) => d.statusId === "3").map(({ list: _l, ...resto }) => resto);
    return json([{ total_documents: String(pend.length), total_pages: "1", current_page: url.searchParams.get("pg") ?? "1" }, ...pend]);
  }
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

/**
 * Documento como a D4Sign devolve em /documents/{uuid}/list. Datas no horário de Brasília. Por padrão a Lone
 * assina quando manda (enviadoEm) e o cliente assina quando o documento fecha (status 4).
 */
function docD4(uuid: string, p: {
  nome?: string; status?: string; emailCliente?: string; enviadoEm?: string; assinadoEm?: string; cofre?: string;
  loneAssinou?: boolean; clienteAssinou?: boolean; loneEm?: string;
} = {}): Linha {
  const status = p.status ?? "4";
  const enviado = p.enviadoEm ?? "2026-10-21 10:00:00";
  const assinado = p.assinadoEm ?? "2026-10-26 14:02:27";
  const lone = p.loneAssinou ?? true;
  const cliente = p.clienteAssinou ?? status === "4";
  const loneEm = p.loneEm ?? enviado;
  const info = (quando: string) => ({ date_signed: quando, date_signed_atom: `${quando.replace(" ", "T")}-03:00` });
  return {
    uuidDoc: uuid, nameDoc: p.nome ?? "Padaria do Zé - Contrato - Social Media.docx", type: "application/pdf",
    size: "118990", pages: "9", uuidSafe: p.cofre ?? COFRE, safeName: "Contratos Lone Midia",
    statusId: status, statusName: status === "4" ? "Finalizado" : "Aguardando Assinaturas", statusComment: "", whoCanceled: "",
    list: [
      { key_signer: "s1", email: "roberto@lone.exemplo", user_name: "Roberto", signed: lone ? "1" : "0", date: enviado, sign_info: lone ? info(loneEm) : {} },
      { key_signer: "s2", email: p.emailCliente ?? "dono@padariadoze.exemplo", user_name: "José", signed: cliente ? "1" : "0", date: enviado,
        sign_info: cliente ? info(assinado) : {} },
    ],
  };
}

const { POST: webhook } = await import("@/app/api/integracoes/d4sign/route");
const { POST: consulta } = await import("@/app/api/system/contratos-d4sign/route");
const { POST: pendentesRota } = await import("@/app/api/system/contratos-d4sign-pendentes/route");
const A = await import("@/lib/contracts/assinatura");
const D = await import("@/lib/contracts/d4sign");
const R = await import("@/lib/contracts/d4sign-resumo");
const S = await import("@/lib/contracts/d4sign-signatarios");
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
const rodarManha = (q = "") => pendentesRota(new NextRequest(`https://painel.lonemidia.com/api/system/contratos-d4sign-pendentes${q}`, { method: "POST" }));

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
  db.cs_outbound = [];
  d4.docs.clear();
  d4.falhar = null;
  d4.chamadas.length = 0;
  d4.corpos.length = 0;
  d4.falharEnvio = null;
  armazem.clear();
  usuario.atual = null;
  diaUtil.valor = true;
  CFG.esquecerConfigD4Sign();
  d4.docs.set(DOC_ZE, docD4(DOC_ZE));
  vi.stubGlobal("fetch", fetchFalso);
  Object.assign(process.env, {
    D4SIGN_API_TOKEN: TOKEN, D4SIGN_CRYPT_KEY: CRYPT, D4SIGN_HMAC_SECRET: SEGREDO_MAC, D4SIGN_SAFE_UUID: `${COFRE}, ${COFRE2}`,
    D4SIGN_API_URL: "https://d4sign.exemplo/api/v1", CS_CADASTRO_GROUP_JID: GRUPO_CADASTRO,
    D4SIGN_EMAILS_LONE: "roberto@lone.exemplo",
    VAULT_KEY: Buffer.alloc(32, 7).toString("base64"),
  });
  envio.fn.mockReset();
  // O envio de verdade registra a saída em cs_outbound (lib/cs/notify.ts#registrarSaida).
  envio.fn.mockImplementation(async (jid: string, texto: string, _q: unknown, meta: { idem?: string }) => {
    db.cs_outbound.push({ group_jid: jid, texto, idem_key: meta?.idem ?? null, enviado: true });
    return { ok: true, id: "msg1" };
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  process.env = { ...ENV_ORIGINAL };
});

// ── Puras ────────────────────────────────────────────────────────────────────────────────────────

describe("o nome, a data e as mensagens", () => {
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

  it("todos assinaram: '✅ *Padaria do Zé* assinou o contrato em 26/10.'", () => {
    const m = A.mensagemAssinatura({ nome: "Padaria do Zé", assinadoEm: "2026-10-26T17:02:27Z", tipo: "contrato", nomeDocumento: "x", ligado: true });
    expect(m).toBe("✅ *Padaria do Zé* assinou o contrato em 26/10.");
  });

  it("sem cadastro ligado, a mensagem diz que a data não foi para a ficha", () => {
    const m = A.mensagemAssinatura({ nome: "Loja Nova", assinadoEm: null, tipo: "contrato", nomeDocumento: "x", ligado: false });
    expect(m.split("\n")).toHaveLength(2);
    expect(m).toMatch(/Não achei o cadastro no Lone OS/);
  });

  it("'assinado por X em dd/mm · falta Y' — o mesmo texto na tela e no grupo", () => {
    const s = (nome: string, papel: string, assinou: boolean, assinadoEm: string | null = null) => ({ nome, email: null, papel, assinou, assinadoEm });
    expect(R.resumoAssinaturas([s("Roberto", "lone", true, "2026-10-21T13:00:00Z"), s("José", "cliente", false)]))
      .toBe("assinado por Roberto (Lone) em 21/10 · falta José (cliente)");
    expect(R.resumoAssinaturas([s("Roberto", "lone", false), s("José", "cliente", false), s("Ana", "testemunha", false)]))
      .toBe("ninguém assinou ainda · falta Roberto (Lone), José (cliente) e Ana (testemunha)");
    expect(R.resumoAssinaturas([s("José", "cliente", true, "2026-10-26T17:00:00Z"), s("Lucas", "lone", true, "2026-10-26T18:00:00Z")]))
      .toBe("assinado por José (cliente) em 26/10 e Lucas (Lone) em 26/10 · todos assinaram");
    expect(R.quemAssina({ nome: null, email: "dono@padariadoze.exemplo", papel: "indefinido" })).toBe("dono");
  });

  it("papel: Lone pelo e-mail configurado (e o da CONTRATADA), cliente pelo cadastro; sem os e-mails da Lone, não chuta", () => {
    const p = { emailsLone: ["roberto@lone.exemplo"], emailsCliente: ["dono@padariadoze.exemplo"] };
    expect(S.papelDe("Roberto@Lone.exemplo", p)).toBe("lone");
    expect(S.papelDe("lonemidiamkt@gmail.com", p)).toBe("lone");
    expect(S.papelDe("dono@padariadoze.exemplo", p)).toBe("cliente");
    expect(S.papelDe("socio@padariadoze.exemplo", p)).toBe("cliente");
    expect(S.papelDe("roberto@lone.exemplo", { emailsLone: [], emailsCliente: [] })).toBe("indefinido");
  });

  it("o aviso da manhã: cada contrato com quem falta e há quantos dias, os mais antigos primeiro", () => {
    const falta = (nome: string, papel: "cliente" | "lone") => ({ nome, email: null, papel, assinou: false, assinadoEm: null, chave: null });
    expect(A.mensagemPendentes([
      { uuid: "a", nome: "Padaria do Zé", faltam: [falta("José", "cliente")], dias: 5 },
      { uuid: "b", nome: "Bruno Tintas", faltam: [falta("Bruno", "cliente"), falta("Lucas", "lone")], dias: 12 },
    ])).toBe([
      "⏳ *Ainda não assinaram o contrato*",
      "• *Bruno Tintas* — falta Bruno (cliente) e Lucas (Lone) · enviado há 12 dias",
      "• *Padaria do Zé* — falta José (cliente) · enviado há 5 dias",
    ].join("\n"));
    expect(A.mensagemPendentes([])).toBe("");
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

// ── Webhook: todos assinaram ─────────────────────────────────────────────────────────────────────

describe("webhook: todos assinaram → '✅ assinou o contrato', uma vez", () => {
  it("relê a D4Sign, manda no grupo de cadastro, grava a data e quem assinou — sem fechar o contrato", async () => {
    const res = await webhook(evento(DOC_ZE));
    const corpo = await res.json();
    expect(res.status).toBe(200);
    expect(corpo).toMatchObject({ ok: true, acao: "avisado", nome: "Padaria do Zé", clientId: "cli-ze", contractId: "ct-ze-v2", vinculo: "email" });
    expect(d4.chamadas).toEqual([`/api/v1/documents/${DOC_ZE}/list`]);
    expect(db.d4sign_chamadas.map((c) => c.origem)).toEqual(["webhook"]);
    expect(mensagens()).toEqual([{ grupo: GRUPO_CADASTRO, texto: "✅ *Padaria do Zé* assinou o contrato em 26/10." }]);
    expect(envio.fn.mock.calls[0][3]).toMatchObject({ destino: "interno", idem: `contrato-assinado:${DOC_ZE}`, clientId: "cli-ze" });

    const ct = db.contracts.find((c) => c.id === "ct-ze-v2")!;
    expect(ct).toMatchObject({ d4sign_document_uuid: DOC_ZE, d4sign_assinado_em: "2026-10-26T17:02:27.000Z" });
    expect(ct.signed_at).toBeNull(); // contrato fecha com o PDF na ficha, como sempre
    expect(ct.status).toBe("draft");
    expect(db.contracts.find((c) => c.id === "ct-ze-v1")!.d4sign_document_uuid).toBeNull();
    expect(db.clients.find((c) => c.id === "cli-ze")!.contrato_assinado_em).toBe("2026-10-26T17:02:27.000Z");
    expect(doc(DOC_ZE)).toMatchObject({ status: "assinado", origem: "webhook", aviso_enviado_em: AGORA.toISOString() });
    expect(doc(DOC_ZE)!.signatarios).toEqual([
      expect.objectContaining({ nome: "Roberto", papel: "lone", assinou: true }),
      expect.objectContaining({ nome: "José", papel: "cliente", assinou: true, assinadoEm: "2026-10-26T17:02:27.000Z" }),
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

  it("dois eventos AO MESMO TEMPO (retry da D4Sign cruzando): uma mensagem só", async () => {
    const [a, b] = await Promise.all([webhook(evento(DOC_ZE)), webhook(evento(DOC_ZE))]);
    const acoes = [(await a.json()).acao, (await b.json()).acao].sort();
    expect(acoes).toEqual(["avisado", "ja_avisado"]);
    expect(envio.fn).toHaveBeenCalledTimes(1);
  });

  it("o evento diz 'finalizado' mas a D4Sign diz que não: vale a D4Sign", async () => {
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "3" }));
    await webhook(evento(DOC_ZE, { tipo: "1" }));
    expect(mensagens().some((m) => m.texto.startsWith("✅"))).toBe(false);
    expect(doc(DOC_ZE)!.status).toBe("pendente");
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
  });

  it("código do aviso que não confere (27/10: o segredo do painel não batia): relê na D4Sign mesmo assim e avisa", async () => {
    const res = await webhook(evento(DOC_ZE, { hmac: mac(DOC_BRUNO) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ conferido: false, acao: "avisado" });
    // A data vem da leitura (José assinou às 14h02), nunca do evento sem conferência.
    expect(doc(DOC_ZE)!.assinado_em).toBe("2026-10-26T17:02:27.000Z");
    expect(db.d4sign_chamadas.map((c) => c.origem)).toEqual(["aviso"]);
    expect(mensagens()).toEqual([{ grupo: GRUPO_CADASTRO, texto: "✅ *Padaria do Zé* assinou o contrato em 26/10." }]);
  });

  it("sem conferência: o mesmo documento relido há menos de 1 min não gasta outra chamada", async () => {
    await webhook(evento(DOC_ZE, { hmac: null }));
    d4.chamadas.length = 0;
    expect(await (await webhook(evento(DOC_ZE, { hmac: null }))).json()).toMatchObject({ acao: "relido_ha_pouco" });
    expect(d4.chamadas).toEqual([]);
    expect(envio.fn).toHaveBeenCalledTimes(1);
  });

  it("sem conferência: no máximo 4 releituras por hora — evento falso não gasta a cota de quem espera (503: a D4Sign repete)", async () => {
    db.d4sign_chamadas = Array.from({ length: 4 }, () => ({ em: new Date().toISOString(), caminho: "/x", origem: "aviso" }));
    const res = await webhook(evento(DOC_ZE, { hmac: "sha256=" + "0".repeat(64) }));
    expect(res.status).toBe(503);
    expect(d4.chamadas).toEqual([]);
    expect(envio.fn).not.toHaveBeenCalled();
    // O aviso conferido não tem esse teto.
    expect((await webhook(evento(DOC_ZE))).status).toBe(200);
  });

  it("o painel mostra quando o código não bate, e para de mostrar quando volta a bater ou o segredo é colado de novo", async () => {
    db.d4sign_config = [{ id: 1, historico: [] }];
    await webhook(evento(DOC_ZE, { hmac: mac(DOC_BRUNO) }));
    let s = await CFG.situacaoDaConfig();
    expect(s.ok && s.situacao.aviso).toMatchObject({ segredoErrado: true, recebido: "sha256=… (64)" });
    vi.setSystemTime(new Date(AGORA.getTime() + 120_000));
    await webhook(evento(DOC_BRUNO));
    s = await CFG.situacaoDaConfig();
    expect(s.ok && s.situacao.aviso.segredoErrado).toBe(false);
    // Nem o segredo nem o código vão para o banco.
    expect(JSON.stringify(db.d4sign_config)).not.toContain(SEGREDO_MAC);
    expect(JSON.stringify(db.d4sign_config)).not.toMatch(/[0-9a-f]{64}/);
  });

  it("colar o segredo de novo tira o alerta (o próximo aviso diz se o novo bate)", async () => {
    db.d4sign_config = [{ id: 1, historico: [] }];
    await webhook(evento(DOC_ZE, { hmac: mac(DOC_BRUNO) }));
    expect(CFG.segredoErrado(null, db.d4sign_config[0].hmac_falhou_em as string)).toBe(true);
    expect(await CFG.salvarConfigD4Sign({ novos: { hmac: "segredo-novo-colado-0001" }, apagar: [], quem: "roberto@lone.exemplo" })).toEqual({ ok: true });
    const s = await CFG.situacaoDaConfig();
    expect(s.ok && s.situacao.aviso.segredoErrado).toBe(false);
  });

  it("as leituras possíveis da documentação da D4Sign batem (todas exigem o segredo)", async () => {
    const { createHash } = await import("node:crypto");
    expect(D.conferirHmac(DOC_ZE, mac(DOC_ZE), SEGREDO_MAC)).toMatchObject({ ok: true, variante: "hmac" });
    const h = (s: string) => `sha256=${createHash("sha256").update(s).digest("hex")}`;
    expect(D.conferirHmac(DOC_ZE, h(DOC_ZE + SEGREDO_MAC), SEGREDO_MAC)).toMatchObject({ ok: true, variante: "sha256-uuid-chave" });
    expect(D.conferirHmac(DOC_ZE, h(SEGREDO_MAC + DOC_ZE), SEGREDO_MAC)).toMatchObject({ ok: true, variante: "sha256-chave-uuid" });
    const chaveHex = "ab".repeat(32);
    const comHex = `sha256=${createHmac("sha256", Buffer.from(chaveHex, "hex")).update(DOC_ZE).digest("hex")}`;
    expect(D.conferirHmac(DOC_ZE, comHex, chaveHex)).toMatchObject({ ok: true, variante: "hmac-chave-hex" });
    expect(D.conferirHmac(DOC_ZE, h(DOC_ZE), SEGREDO_MAC)).toMatchObject({ ok: false });
    expect(D.conferirHmac(DOC_ZE, null, SEGREDO_MAC)).toMatchObject({ ok: false, recebido: "ausente" });
    expect(D.conferirHmac(DOC_ZE, "abc", SEGREDO_MAC)).toMatchObject({ ok: false, recebido: expect.stringMatching(/formato estranho/) });
  });

  it("sem o segredo do webhook configurado a porta fica fechada (503): cada evento gastaria uma chamada da hora", async () => {
    delete process.env.D4SIGN_HMAC_SECRET;
    expect((await webhook(evento(DOC_ZE))).status).toBe(503);
    expect(d4.chamadas).toEqual([]);
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
    expect(corpo.motivo).toMatch(/16\/10, há mais de 4 dias/);
    expect(envio.fn).not.toHaveBeenCalled();
  });

  it("o grupo configurado é o de um cliente: não manda", async () => {
    process.env.CS_CADASTRO_GROUP_JID = GRUPO_DO_ZE;
    const corpo = await (await webhook(evento(DOC_ZE))).json();
    expect(corpo).toMatchObject({ ok: false, acao: "erro" });
    expect(corpo.motivo).toMatch(/é de um cliente/);
    expect(envio.fn).not.toHaveBeenCalled();
  });
});

// ── Webhook: uma parte assinou ───────────────────────────────────────────────────────────────────

describe("webhook: uma parte assinou → '✍️ assinado por X · falta Y', uma vez por assinatura", () => {
  it("o cliente assina primeiro: diz quem assinou e quem falta (a Lone)", async () => {
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "3", enviadoEm: "2026-10-26 09:00:00", loneAssinou: false, clienteAssinou: true, assinadoEm: "2026-10-26 13:00:00" }));
    const corpo = await (await webhook(evento(DOC_ZE, { tipo: "4" }))).json();
    expect(corpo).toMatchObject({ ok: true, acao: "parcial", status: "pendente" });
    expect(mensagens()).toEqual([{ grupo: GRUPO_CADASTRO, texto: "✍️ *Padaria do Zé*: assinado por José (cliente) em 26/10 · falta Roberto (Lone)." }]);
    expect(envio.fn.mock.calls[0][3]).toMatchObject({ origem: "contrato-parcial", destino: "interno" });
  });

  it("a Lone assina ao mandar: 'falta José (cliente)'; o mesmo evento de novo não repete; quando o cliente assina, sai o final", async () => {
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "3", enviadoEm: "2026-10-26 09:00:00" }));
    await webhook(evento(DOC_ZE, { tipo: "4" }));
    await webhook(evento(DOC_ZE, { tipo: "4" }));
    expect(mensagens().map((m) => m.texto)).toEqual(["✍️ *Padaria do Zé*: assinado por Roberto (Lone) em 26/10 · falta José (cliente)."]);

    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "4", enviadoEm: "2026-10-26 09:00:00" }));
    await webhook(evento(DOC_ZE, { tipo: "1" }));
    expect(mensagens().map((m) => m.texto)).toEqual([
      "✍️ *Padaria do Zé*: assinado por Roberto (Lone) em 26/10 · falta José (cliente).",
      "✅ *Padaria do Zé* assinou o contrato em 26/10.",
    ]);
  });

  it("dois eventos parciais ao mesmo tempo: uma mensagem só", async () => {
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "3", enviadoEm: "2026-10-26 09:00:00" }));
    await Promise.all([webhook(evento(DOC_ZE, { tipo: "4" })), webhook(evento(DOC_ZE, { tipo: "4" }))]);
    expect(envio.fn).toHaveBeenCalledTimes(1);
  });

  it("assinatura parcial antiga (a Lone assinou há 5 dias): não é novidade, não manda", async () => {
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "3", enviadoEm: "2026-10-21 10:00:00" }));
    const corpo = await (await webhook(evento(DOC_ZE, { tipo: "4" }))).json();
    expect(corpo).toMatchObject({ acao: "registrado", resumo: "assinado por Roberto (Lone) em 21/10 · falta José (cliente)" });
    expect(envio.fn).not.toHaveBeenCalled();
  });

  it("o envio parcial falha: solta a trava e o próximo evento manda", async () => {
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "3", enviadoEm: "2026-10-26 09:00:00" }));
    envio.fn.mockResolvedValueOnce({ ok: false, error: "HTTP 500" });
    expect((await webhook(evento(DOC_ZE, { tipo: "4" }))).status).toBe(503);
    expect(doc(DOC_ZE)!.aviso_parcial ?? null).toBeNull();
    expect((await (await webhook(evento(DOC_ZE, { tipo: "4" }))).json()).acao).toBe("parcial");
  });
});

// ── Webhook: falhas ──────────────────────────────────────────────────────────────────────────────

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
    expect((await webhook(evento(DOC_ZE))).status).toBe(503);
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

  it("WhatsApp falhou: solta a trava, responde 503, e o próximo evento manda", async () => {
    envio.fn.mockResolvedValueOnce({ ok: false, error: "HTTP 500" });
    expect((await webhook(evento(DOC_ZE))).status).toBe(503);
    expect(doc(DOC_ZE)).toMatchObject({ aviso_reservado_em: null });
    expect((await (await webhook(evento(DOC_ZE))).json()).acao).toBe("avisado");
  });

  it("WhatsApp incerto (pode ter saído): mantém a trava, não repete", async () => {
    envio.fn.mockResolvedValueOnce({ ok: false, error: "o WhatsApp não respondeu a tempo (pode ter saído)", incerto: true });
    const res = await webhook(evento(DOC_ZE));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(false);
    await webhook(evento(DOC_ZE));
    expect(envio.fn).toHaveBeenCalledTimes(1);
  });

  it("ensaio (?dry=1): mostra a mensagem que sairia, sem gravar e sem mandar", async () => {
    const corpo = await (await webhook(evento(DOC_ZE, { dry: true, hmac: null }))).json();
    expect(corpo).toMatchObject({ dry: true, acao: "avisaria", mensagem: "✅ *Padaria do Zé* assinou o contrato em 26/10." });
    expect(envio.fn).not.toHaveBeenCalled();
    expect(db.d4sign_documentos).toEqual([]);
  });
});

// ── Consulta a cada 3 horas ──────────────────────────────────────────────────────────────────────

describe("consulta: os pendentes da conta, filtrados pelos cofres escolhidos", () => {
  beforeEach(() => {
    d4.docs.clear();
    d4.docs.set(DOC_ANTIGO, docD4(DOC_ANTIGO, { nome: "Bruno Tintas - Contrato - Tráfego Pago.docx", emailCliente: "contato@bruno.exemplo", enviadoEm: "2026-09-01 10:00:00", assinadoEm: "2026-09-02 11:00:00" }));
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "3", enviadoEm: "2026-10-21 10:00:00" }));
    // Pendente num cofre que NÃO é de contrato (Prestadores de serviço): não gasta chamada.
    d4.docs.set(DOC_SEM_CADASTRO, docD4(DOC_SEM_CADASTRO, { status: "3", cofre: OUTRO_COFRE, nome: "Freelancer - Contrato de prestação.docx", emailCliente: "free@x.exemplo" }));
  });

  it("primeira consulta: 1 chamada para a lista da conta; relê só o pendente novo de um cofre escolhido", async () => {
    const corpo = await (await rodarConsulta()).json();
    expect(corpo).toMatchObject({ ok: true, pendentes: 1, lidos: 1, sobraram: 0 });
    expect(d4.chamadas).toEqual(["/api/v1/documents/3/status", `/api/v1/documents/${DOC_ZE}/list`]);
    expect(envio.fn).not.toHaveBeenCalled();
    expect(doc(DOC_ZE)).toMatchObject({ status: "pendente", client_id: "cli-ze" });
    expect(doc(DOC_SEM_CADASTRO)).toBeUndefined();
    expect(doc(DOC_ANTIGO)).toBeUndefined(); // assinado não está na lista de pendentes: nem é visto
  });

  it("pendente de outro cofre escolhido também conta (os contratos ficam em vários cofres)", async () => {
    d4.docs.set(DOC_BRUNO, docD4(DOC_BRUNO, { status: "3", cofre: COFRE2, nome: "Bruno Tintas - Contrato - Social Media.docx", emailCliente: "contato@bruno.exemplo" }));
    const corpo = await (await rodarConsulta()).json();
    expect(corpo).toMatchObject({ pendentes: 2, lidos: 2 });
    expect(doc(DOC_BRUNO)).toMatchObject({ status: "pendente", client_id: "cli-bruno" });
  });

  it("segunda consulta: a lista e o rodízio dos pendentes; o pendente que saiu da lista é relido e vira aviso; nada se repete", async () => {
    await rodarConsulta();
    d4.chamadas.length = 0;
    const nada = await (await rodarConsulta()).json();
    // Rodízio: o pendente conhecido é relido (pode ter ganhado assinatura); sem novidade, nada sai.
    expect(nada.lidos).toBe(1);
    expect(d4.chamadas).toEqual(["/api/v1/documents/3/status", `/api/v1/documents/${DOC_ZE}/list`]);
    expect(envio.fn).not.toHaveBeenCalled();

    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "4", assinadoEm: "2026-10-26 13:10:00" }));
    const corpo = await (await rodarConsulta()).json();
    expect(corpo.lidos).toBe(1);
    expect(mensagens().map((m) => m.texto)).toEqual(["✅ *Padaria do Zé* assinou o contrato em 26/10."]);
    expect(doc(DOC_ZE)).toMatchObject({ status: "assinado", origem: "consulta" });
    await rodarConsulta();
    expect(envio.fn).toHaveBeenCalledTimes(1);
  });

  it("webhook e consulta no mesmo documento: uma mensagem só", async () => {
    d4.docs.set(DOC_ZE, docD4(DOC_ZE));
    await webhook(evento(DOC_ZE));
    await rodarConsulta();
    await rodarConsulta();
    expect(mensagens().filter((m) => m.texto.includes("Padaria do Zé"))).toHaveLength(1);
  });

  it("a lista da conta falha: ok:false com o motivo, nada gravado, nada enviado", async () => {
    d4.falhar = "500";
    const corpo = await (await rodarConsulta()).json();
    expect(corpo.ok).toBe(false);
    expect(corpo.erros[0]).toMatch(/D4Sign respondeu 500/);
    expect(db.d4sign_documentos).toEqual([]);
    expect(envio.fn).not.toHaveBeenCalled();
  });

  it("a leitura de UM documento falha: não vira resposta, e é tentada na próxima", async () => {
    await rodarConsulta();
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "4" }));
    const original = d4.docs.get(DOC_ZE)!;
    d4.docs.delete(DOC_ZE); // some da leitura individual (e da lista de pendentes: mudou de fase)
    const corpo = await (await rodarConsulta()).json();
    expect(corpo.ok).toBe(false);
    expect(corpo.erros[0]).toMatch(/404/);
    expect(doc(DOC_ZE)!.status).toBe("pendente");
    expect(envio.fn).not.toHaveBeenCalled();

    d4.docs.set(DOC_ZE, original);
    await rodarConsulta();
    expect(mensagens().map((m) => m.texto)).toEqual(["✅ *Padaria do Zé* assinou o contrato em 26/10."]);
  });

  it("rodízio (28/10): o cliente assinou e o webhook não chegou — a consulta relê o pendente e manda o '✍️'", async () => {
    await rodarConsulta(); // conhece o DOC_ZE pendente: falta a Lone e o José
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "3", enviadoEm: "2026-10-21 10:00:00", loneAssinou: false, clienteAssinou: true, assinadoEm: "2026-10-26 11:00:00" }));
    vi.setSystemTime(new Date(AGORA.getTime() + 3600_000));
    await rodarConsulta();
    expect(mensagens()).toEqual([{ grupo: GRUPO_CADASTRO, texto: "✍️ *Padaria do Zé*: assinado por José (cliente) em 26/10 · falta Roberto (Lone)." }]);
    vi.setSystemTime(new Date(AGORA.getTime() + 7200_000));
    await rodarConsulta();
    expect(envio.fn).toHaveBeenCalledTimes(1); // uma vez por assinatura
  });

  it("rodízio: relê o lido há mais tempo primeiro, e deixa de fora o parado há mais de 6 meses", () => {
    const agora = new Date("2026-10-28T12:00:00Z");
    const l = (id: string, lido: string, enviado: string) => ({ document_uuid: id, atualizado_em: lido, enviado_em: enviado, visto_em: null });
    const fila = A.filaDoRodizio([
      l("recente-lido-agora", "2026-10-28T11:00:00Z", "2026-10-21T12:00:00Z"),
      l("recente-lido-ontem", "2026-10-27T11:00:00Z", "2026-10-21T12:00:00Z"),
      l("de-2024", "2026-10-20T11:00:00Z", "2024-10-10T12:00:00Z"),
      l("fora-da-lista", "2026-10-01T11:00:00Z", "2026-10-21T12:00:00Z"),
    ], new Set(["recente-lido-agora", "recente-lido-ontem", "de-2024"]), agora);
    expect(fila.map((x) => x.document_uuid)).toEqual(["recente-lido-ontem", "recente-lido-agora"]);
  });

  it("pendente conhecido de cofre não escolhido que continua na lista: não é relido a cada rodada", async () => {
    db.d4sign_documentos = [{ document_uuid: DOC_SEM_CADASTRO, status: "pendente", signatarios: [] }];
    await rodarConsulta();
    expect(d4.chamadas).not.toContain(`/api/v1/documents/${DOC_SEM_CADASTRO}/list`);
  });

  it("ensaio: devolve a mensagem que sairia, sem gravar nem mandar", async () => {
    await rodarConsulta();
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "4" }));
    const corpo = await (await rodarConsulta("?dry=1")).json();
    expect(corpo.dry).toBe(true);
    expect(corpo.mensagens).toEqual(["✅ *Padaria do Zé* assinou o contrato em 26/10."]);
    expect(doc(DOC_ZE)!.status).toBe("pendente");
    expect(envio.fn).not.toHaveBeenCalled();
  });

  it("teto por vez: o resto fica para a próxima rodada", async () => {
    d4.docs.set(DOC_BRUNO, docD4(DOC_BRUNO, { status: "3", cofre: COFRE2, nome: "Bruno Tintas - Contrato - Tráfego Pago.docx", emailCliente: "contato@bruno.exemplo" }));
    const r = await A.consultarCofre({ limite: 1 });
    expect(r).toMatchObject({ lidos: 1, sobraram: 1 });
  });

  it("sem cofre escolhido ou sem a chave: 'desligado', não é falha, e não gasta chamada", async () => {
    delete process.env.D4SIGN_SAFE_UUID;
    expect(await (await rodarConsulta()).json()).toMatchObject({ ok: true, desligado: expect.stringMatching(/nenhum cofre/) });
    delete process.env.D4SIGN_API_TOKEN;
    CFG.esquecerConfigD4Sign();
    expect(await (await rodarConsulta()).json()).toMatchObject({ ok: true, desligado: expect.stringMatching(/D4Sign não configurada/) });
    expect(d4.chamadas).toEqual([]);
  });

  it("webhook de documento num cofre escolhido além do primeiro: processa normal", async () => {
    d4.docs.set(DOC_BRUNO, docD4(DOC_BRUNO, { cofre: COFRE2 }));
    expect((await (await webhook(evento(DOC_BRUNO))).json()).acao).toBe("avisado");
  });

  it("rota: ?webhook=cadastrar&dry=1 só diz em quantos cofres ligaria; ?webhook=ver olha cada cofre escolhido", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://painel.lonemidia.com";
    const dry = await (await rodarConsulta("?webhook=cadastrar&dry=1")).json();
    expect(dry).toMatchObject({ ok: true, dry: true, resultado: "Ligaria o aviso em 2 cofre(s), apontando para https://painel.lonemidia.com/api/integracoes/d4sign." });
    expect(d4.chamadas).toEqual([]);
    const ver = await (await rodarConsulta("?webhook=ver")).json();
    expect(ver.cofres.map((c: { cofre: string }) => c.cofre)).toEqual([COFRE, COFRE2]);
  });
});

// ── "Ainda não assinaram" — dia útil de manhã, no grupo de cadastro ──────────────────────────────

describe("manhã: '⏳ Ainda não assinaram o contrato' no grupo de cadastro", () => {
  const pendente = (uuid: string, enviado: string, extra: Linha = {}) => ({
    document_uuid: uuid, nome: "Bruno Tintas - Contrato - Tráfego Pago.docx", status: "pendente",
    client_id: null, contract_id: null, enviado_em: enviado, visto_em: enviado,
    signatarios: [
      { nome: "Roberto", email: "roberto@lone.exemplo", papel: "lone", assinou: true, assinadoEm: enviado, chave: "s1" },
      { nome: "Bruno", email: "contato@bruno.exemplo", papel: "cliente", assinou: false, assinadoEm: null, chave: "s2" },
    ],
    ...extra,
  });

  it("um aviso com cada contrato enviado há 3 dias ou mais: quem falta e há quantos dias", async () => {
    db.d4sign_documentos = [
      pendente(DOC_BRUNO, "2026-10-14T13:00:00Z", { client_id: "cli-bruno" }),
      pendente(DOC_ZE, "2026-10-21T13:00:00Z", { client_id: "cli-ze", nome: "Padaria do Zé - Contrato - Social Media.docx" }),
      pendente(DOC_SEM_CADASTRO, "2026-10-25T13:00:00Z", { nome: "Loja Nova - Contrato.docx" }), // 1 dia: fora
    ];
    process.env.D4SIGN_API_TOKEN = ""; // sem chave: usa o que já sabe, sem reler
    CFG.esquecerConfigD4Sign();
    const corpo = await (await rodarManha()).json();
    expect(corpo).toMatchObject({ ok: true, enviado: true, relidos: 0 });
    expect(mensagens()).toEqual([{ grupo: GRUPO_CADASTRO, texto: [
      "⏳ *Entrada de clientes — o que está parado*",
      "",
      "*Contrato esperando assinatura*",
      "• *Bruno Tintas* — falta Bruno (cliente) · enviado há 12 dias",
      "• *Padaria do Zé* — falta Bruno (cliente) · enviado há 5 dias",
    ].join("\n") }]);
    expect(envio.fn.mock.calls[0][3]).toMatchObject({ origem: "contratos-pendentes", destino: "interno", idem: "contratos-pendentes:2026-10-26" });
  });

  it("uma por dia: a segunda rodada do mesmo dia não manda de novo", async () => {
    db.d4sign_documentos = [pendente(DOC_BRUNO, "2026-10-14T13:00:00Z", { client_id: "cli-bruno" })];
    process.env.D4SIGN_API_TOKEN = "";
    await rodarManha();
    const segunda = await (await rodarManha()).json();
    expect(segunda).toMatchObject({ ok: true, enviado: false, motivo: "o grupo de cadastro já recebeu o aviso de hoje" });
    expect(envio.fn).toHaveBeenCalledTimes(1);
  });

  it("sem pendência há 3 dias ou mais: nada sai", async () => {
    db.d4sign_documentos = [pendente(DOC_ZE, "2026-10-25T13:00:00Z")];
    const corpo = await (await rodarManha()).json();
    expect(corpo).toMatchObject({ ok: true, enviado: false, motivo: expect.stringMatching(/nenhum contrato/) });
    expect(envio.fn).not.toHaveBeenCalled();
  });

  it("relê na D4Sign antes de escrever: quem assinou de madrugada não aparece como faltando (e sai o ✅)", async () => {
    db.d4sign_documentos = [pendente(DOC_ZE, "2026-10-21T13:00:00Z", { client_id: "cli-ze", status_id: "3" })];
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "4", assinadoEm: "2026-10-26 06:10:00" }));
    const corpo = await (await rodarManha()).json();
    expect(corpo).toMatchObject({ relidos: 1, enviado: false, motivo: "os pendentes assinaram na releitura" });
    expect(mensagens().map((m) => m.texto)).toEqual(["✅ *Padaria do Zé* assinou o contrato em 26/10."]);
    expect(db.d4sign_chamadas.map((c) => c.origem)).toEqual(["manha"]);
  });

  it("28/10: relê primeiro o lido há mais tempo (não o mais antigo de 2024) — o Matheus não aparece como faltando", async () => {
    db.d4sign_documentos = [
      // Dois contratos de experiência de 2024, esquecidos na D4Sign: viram uma linha só, sem releitura.
      pendente("d0c00000-0000-4000-8000-00000000e001", "2024-10-10T13:00:00Z", { nome: "Rede Sim - Contrato de experiência.pdf", atualizado_em: "2026-10-01T00:00:00Z" }),
      pendente("d0c00000-0000-4000-8000-00000000e002", "2024-11-06T13:00:00Z", { nome: "LC Multimarcas - experiência.pdf", atualizado_em: "2026-10-01T00:00:00Z" }),
      // Lido há 2 dias — o cliente assinou ontem e o webhook não chegou.
      pendente(DOC_ZE, "2026-10-21T13:00:00Z", { client_id: "cli-ze", nome: "Padaria do Zé - Contrato - Social Media.docx", atualizado_em: "2026-10-24T00:00:00Z" }),
      pendente(DOC_BRUNO, "2026-10-14T13:00:00Z", { client_id: "cli-bruno", atualizado_em: "2026-10-26T12:00:00Z" }),
    ];
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "3", enviadoEm: "2026-10-21 10:00:00", loneAssinou: false, clienteAssinou: true, assinadoEm: "2026-10-25 16:00:00" }));
    d4.docs.set(DOC_BRUNO, docD4(DOC_BRUNO, { status: "3", nome: "Bruno Tintas - Contrato - Tráfego Pago.docx", emailCliente: "contato@bruno.exemplo", enviadoEm: "2026-10-14 10:00:00" }));
    const corpo = await (await rodarManha()).json();
    expect(corpo.relidos).toBe(2);
    expect(d4.chamadas).toEqual([`/api/v1/documents/${DOC_ZE}/list`, `/api/v1/documents/${DOC_BRUNO}/list`]);
    const texto = mensagens().at(-1)!.texto;
    expect(texto).toContain("• *Padaria do Zé* — falta Roberto (Lone) · enviado há 5 dias");
    expect(texto).not.toMatch(/Rede Sim|LC Multimarcas/);
    expect(texto).toContain("_E mais 2 parados na D4Sign há mais de 6 meses — vale cancelar lá._");
  });

  it("só contratos parados há mais de 6 meses: nada sai (não repete todo dia)", async () => {
    db.d4sign_documentos = [pendente(DOC_BRUNO, "2024-10-10T13:00:00Z")];
    expect(await (await rodarManha()).json()).toMatchObject({ enviado: false, motivo: expect.stringMatching(/fora os parados/) });
    expect(envio.fn).not.toHaveBeenCalled();
  });

  it("?documento=<uuid> na consulta: relê só aquele e manda o aviso que faltou (uma vez)", async () => {
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "3", enviadoEm: "2026-10-21 10:00:00", loneAssinou: false, clienteAssinou: true, assinadoEm: "2026-10-26 11:00:00" }));
    const r = await (await rodarConsulta(`?documento=${DOC_ZE}`)).json();
    expect(r).toMatchObject({ ok: true, acao: "parcial" });
    expect(mensagens()).toEqual([{ grupo: GRUPO_CADASTRO, texto: "✍️ *Padaria do Zé*: assinado por José (cliente) em 26/10 · falta Roberto (Lone)." }]);
    expect(d4.chamadas).toEqual([`/api/v1/documents/${DOC_ZE}/list`]);
    await rodarConsulta(`?documento=${DOC_ZE}`);
    expect(envio.fn).toHaveBeenCalledTimes(1);
    expect((await rodarConsulta("?documento=nao-e-uuid")).status).toBe(400);
  });

  it("feriado ou fim de semana: não manda", async () => {
    db.d4sign_documentos = [pendente(DOC_BRUNO, "2026-10-14T13:00:00Z")];
    diaUtil.valor = false;
    expect(await (await rodarManha()).json()).toMatchObject({ enviado: false, skip: "fora de dia útil" });
    expect(envio.fn).not.toHaveBeenCalled();
  });

  it("ensaio: o texto exato, sem reler e sem mandar", async () => {
    db.d4sign_documentos = [pendente(DOC_BRUNO, "2026-10-14T13:00:00Z", { client_id: "cli-bruno" })];
    const corpo = await (await rodarManha("?dry=1")).json();
    expect(corpo.texto).toMatch(/^⏳ \*Entrada de clientes — o que está parado\*\n\n\*Contrato esperando assinatura\*\n• \*Bruno Tintas\*/);
    expect(envio.fn).not.toHaveBeenCalled();
    expect(d4.chamadas).toEqual([]);
  });

  it("migration não aplicada: falha aparece como falha (não 'nada pendente')", async () => {
    falhaNaTabela.d4sign_documentos = { message: 'relation "public.d4sign_documentos" does not exist', code: "42P01" };
    expect(await (await rodarManha()).json()).toMatchObject({ ok: false, motivo: expect.stringMatching(/migration/) });
  });
});

// ── Tela ─────────────────────────────────────────────────────────────────────────────────────────

describe("tela: quem assinou e quem falta (Contratos e ficha)", () => {
  it("ficha do cliente: os documentos dele com os signatários; a chave do signatário não sai", async () => {
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "3", enviadoEm: "2026-10-26 09:00:00" }));
    await webhook(evento(DOC_ZE, { tipo: "4" }));
    usuario.atual = { id: "u1", email: "roberto@lone.exemplo", isAdmin: true };
    const tela = await (await docsGet(new NextRequest("https://painel.lonemidia.com/api/contracts/d4sign?clientId=cli-ze"))).json();
    expect(tela.documentos).toEqual([expect.objectContaining({ documento: DOC_ZE, cliente: "Padaria do Zé", situacao: "pendente" })]);
    expect(R.resumoAssinaturas(tela.documentos[0].signatarios)).toBe("assinado por Roberto (Lone) em 26/10 · falta José (cliente)");
    expect(JSON.stringify(tela)).not.toContain("\"chave\"");
  });

  it("tela de Contratos: a carteira (esperando + assinados há até 30 dias), com o nome do cadastro", async () => {
    db.d4sign_documentos = [
      { document_uuid: DOC_ZE, nome: "x.docx", status: "pendente", client_id: "cli-ze", signatarios: [], visto_em: "2026-10-26T10:00:00Z" },
      { document_uuid: DOC_ANTIGO, nome: "Bruno Tintas - Contrato.docx", status: "assinado", assinado_em: "2026-08-01T10:00:00Z", client_id: null, signatarios: [] },
      { document_uuid: DOC_BRUNO, nome: "Bruno Tintas - Contrato.docx", status: "assinado", assinado_em: "2026-10-20T10:00:00Z", client_id: null, signatarios: [] },
    ];
    usuario.atual = { id: "u1", email: "roberto@lone.exemplo", isAdmin: true };
    const tela = await (await docsGet(new NextRequest("https://painel.lonemidia.com/api/contracts/d4sign"))).json();
    expect(tela.documentos.map((d: { documento: string; cliente: string }) => [d.documento, d.cliente])).toEqual([
      [DOC_ZE, "Padaria do Zé"], [DOC_BRUNO, "Bruno Tintas"],
    ]);
  });

  it("só admin", async () => {
    expect((await docsGet(new NextRequest("https://painel.lonemidia.com/api/contracts/d4sign"))).status).toBe(403);
  });
});

// ── Cota da D4Sign ───────────────────────────────────────────────────────────────────────────────

describe("cota: 10 chamadas por hora", () => {
  const usadas = (n: number) => { db.d4sign_chamadas = Array.from({ length: n }, (_, i) => ({ id: i, em: AGORA.toISOString(), caminho: "/x", origem: "webhook" })); };

  it("a régua: rotina para 4 antes do fim; o webhook usa até o limite", async () => {
    const C = await import("@/lib/contracts/d4sign-cota");
    expect(C.cabemAinda(5, 10, "consulta")).toBe(1);
    expect(C.cabemAinda(6, 10, "manha")).toBe(0);
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
    expect(CFG.mesclarConfig({ token: "do-painel" }, env)).toMatchObject({ token: "do-painel", cofres: [COFRE] });
    expect(CFG.mesclarConfig({ cofre: `${COFRE2}, ${COFRE3.toUpperCase()}` }, env)).toMatchObject({ cofres: [COFRE2, COFRE3] });
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

  it("os e-mails de quem assina pela Lone vão pelo painel e decidem quem é 'Lone' na mensagem", async () => {
    admin();
    delete process.env.D4SIGN_EMAILS_LONE;
    await post({ acao: "salvar", novos: { emailsLone: "Roberto@Lone.exemplo, lucas@lone.exemplo" } });
    expect(db.d4sign_config[0].emails_lone).toBe("roberto@lone.exemplo, lucas@lone.exemplo");
    expect((await (await get()).json()).emailsLone).toEqual(["roberto@lone.exemplo", "lucas@lone.exemplo"]);
    d4.docs.set(DOC_ZE, docD4(DOC_ZE, { status: "3", enviadoEm: "2026-10-26 09:00:00" }));
    await webhook(evento(DOC_ZE, { tipo: "4" }));
    expect(mensagens()[0].texto).toMatch(/assinado por Roberto \(Lone\)/);
  });

  it("valida antes de gravar: cofre que não é UUID, chave com espaço, e-mail que não é e-mail", async () => {
    admin();
    const r = await post({ acao: "salvar", novos: { cofre: "cofre-dos-contratos", token: "abc def ghi jkl", emailsLone: "roberto, lucas@lone.exemplo" } });
    expect(r.status).toBe(400);
    const corpo = await r.json();
    expect(corpo.error).toMatch(/"cofre-dos-contratos" precisa ser o UUID de um cofre/);
    expect(corpo.error).toMatch(/espaço/);
    expect(corpo.error).toMatch(/"roberto" não é e-mail/);
    expect(db.d4sign_config ?? []).toEqual([]);
  });

  it("Testar lista os pendentes dos cofres escolhidos e guarda o resultado; apagar os cofres do painel volta ao .env", async () => {
    admin();
    d4.docs.set(DOC_BRUNO, docD4(DOC_BRUNO, { status: "3", cofre: COFRE2 }));
    d4.docs.set(DOC_SEM_CADASTRO, docD4(DOC_SEM_CADASTRO, { status: "3", cofre: OUTRO_COFRE }));
    await post({ acao: "salvar", novos: { cofre: `${COFRE},${COFRE2}` } });
    const t = await (await post({ acao: "testar" })).json();
    expect(t).toMatchObject({ ok: true, resultado: "Funcionou: 1 documento(s) esperando assinatura nos 2 cofre(s) escolhido(s)." });
    expect(db.d4sign_config[0]).toMatchObject({ teste_ok: true, cofre: `${COFRE}, ${COFRE2}` });
    await post({ acao: "salvar", apagar: ["cofre"] });
    const tela = await (await get()).json();
    expect(tela.campos.cofre).toEqual({ configurado: true, origem: "servidor" });
    expect(tela.cofres).toEqual([COFRE, COFRE2]);
    expect(tela.historico.map((h: { acao: string }) => h.acao)).toEqual(["apagou", "testou", "trocou"]);
  });

  it("'Buscar meus cofres': a lista da conta, com os escolhidos marcados", async () => {
    admin();
    const r = await (await post({ acao: "cofres" })).json();
    expect(r.cofres).toEqual([
      { uuid: COFRE2, nome: "LM - Assessoria Social (Só midia)", escolhido: true, avisoLigado: false },
      { uuid: COFRE, nome: "LM - Lone Growth (pacote completo)", escolhido: true, avisoLigado: false },
      { uuid: OUTRO_COFRE, nome: "Prestadores de serviço", escolhido: false, avisoLigado: false },
      { uuid: COFRE3, nome: "Renovação de contrato", escolhido: false, avisoLigado: false },
    ]);
    expect(d4.chamadas).toEqual(["/api/v1/safes"]);
    usuario.atual = null;
    expect((await post({ acao: "cofres" })).status).toBe(403);
  });

  it("valida a lista de cofres: um UUID errado no meio recusa tudo", async () => {
    admin();
    const r = await post({ acao: "salvar", novos: { cofre: `${COFRE}, nao-e-uuid` } });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/"nao-e-uuid" precisa ser o UUID/);
  });

  it("'Ligar o aviso' em vários cofres: para na cota, diz quantos faltam, e o clique seguinte só faz os que faltam", async () => {
    admin();
    process.env.D4SIGN_SAFE_UUID = `${COFRE}, ${COFRE2}, ${COFRE3}`;
    // 8 chamadas já usadas na hora: cabem só 2 (o limite é 10).
    db.d4sign_chamadas = Array.from({ length: 8 }, (_, i) => ({ id: i, em: AGORA.toISOString(), caminho: "/x", origem: "webhook" }));
    const r1 = await (await post({ acao: "webhook" })).json();
    expect(r1).toMatchObject({ ok: false, feitos: [COFRE, COFRE2], faltam: [COFRE3] });
    expect(r1.resultado).toMatch(/Liguei 2 de 3; faltam 1.*uma hora/);
    expect(db.d4sign_config[0].webhook_cofres).toBe(`${COFRE}, ${COFRE2}`);

    db.d4sign_chamadas = [];
    d4.chamadas.length = 0;
    const r2 = await (await post({ acao: "webhook" })).json();
    expect(r2).toMatchObject({ ok: true, faltam: [] });
    expect(d4.chamadas).toEqual(["/api/v1/webhooks/v2/"]); // só o que faltava

    d4.chamadas.length = 0;
    expect(await (await post({ acao: "webhook" })).json()).toMatchObject({ ok: true, resultado: expect.stringMatching(/já está ligado nos 3/) });
    expect(d4.chamadas).toEqual([]);
    expect((await (await get()).json()).cofresComAviso).toEqual([COFRE, COFRE2, COFRE3]);
  });

  it("'Ligar o aviso da D4Sign' cadastra o webhook em cada cofre escolhido, para este painel; sem o segredo, nem tenta", async () => {
    admin();
    process.env.NEXT_PUBLIC_APP_URL = "https://painel.lonemidia.com";
    const r = await (await post({ acao: "webhook" })).json();
    expect(r).toMatchObject({ ok: true, resultado: expect.stringMatching(/painel\.lonemidia\.com\/api\/integracoes\/d4sign/) });
    expect(d4.chamadas).toEqual(["/api/v1/webhooks/v2/", "/api/v1/webhooks/v2/"]);
    delete process.env.D4SIGN_HMAC_SECRET;
    db.d4sign_config[0].webhook_cofres = null;
    d4.chamadas.length = 0;
    expect(await (await post({ acao: "webhook" })).json()).toMatchObject({ ok: false, resultado: expect.stringMatching(/segredo do webhook/) });
    expect(d4.chamadas).toEqual([]);
  });
});

describe("sem cofre escolhido", () => {
  it("o evento é ignorado ANTES de reler: não gasta nenhuma das 10 chamadas da hora", async () => {
    delete process.env.D4SIGN_SAFE_UUID;
    CFG.esquecerConfigD4Sign();
    const res = await webhook(evento(DOC_ZE));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, acao: "ignorado", motivo: expect.stringMatching(/nenhum cofre/) });
    expect(d4.chamadas).toEqual([]);
    expect(envio.fn).not.toHaveBeenCalled();
  });
});

// ── Arquivo por mês (26/10/2026) ─────────────────────────────────────────────────────────────────

const { POST: arquivoRota } = await import("@/app/api/system/contratos-d4sign-arquivo/route");
const { POST: trazerRota } = await import("@/app/api/contracts/arquivo/baixar/route");
const { GET: arquivoGet } = await import("@/app/api/contracts/arquivo/route");
const { GET: zipGet } = await import("@/app/api/contracts/arquivo/zip/route");

describe("arquivo por mês: o PDF assinado vem da D4Sign, em silêncio", () => {
  const rodarArquivo = (q = "") => arquivoRota(new NextRequest(`https://painel.lonemidia.com/api/system/contratos-d4sign-arquivo${q}`, { method: "POST" }));
  const admin = () => { usuario.atual = { id: "u-1", email: "roberto@lone.exemplo", isAdmin: true }; };

  beforeEach(() => {
    // Assinado em setembro, nunca visto pelo Lone OS: é histórico, não novidade.
    d4.docs.set(DOC_ANTIGO, docD4(DOC_ANTIGO, { enviadoEm: "2026-09-08 10:00:00", assinadoEm: "2026-09-10 15:00:00" }));
    d4.docs.set(DOC_SEM_CADASTRO, docD4(DOC_SEM_CADASTRO, { cofre: OUTRO_COFRE, nome: "Prestador - Contrato.pdf" }));
    d4.docs.delete(DOC_ZE);
  });

  it("registra o finalizado do cofre de contrato, liga ao cliente, guarda o PDF e NÃO avisa o grupo", async () => {
    const r = await (await rodarArquivo()).json();
    expect(r).toMatchObject({ ok: true, listou: true, novos: 1, guardados: 1, faltam: 0 });
    expect(envio.fn).not.toHaveBeenCalled();
    const d = doc(DOC_ANTIGO)!;
    expect(d.pdf_path).toMatch(/^legal:\/\/contracts-signed\/cli-ze\/d4sign-/);
    expect(d.assinado_em).toBe("2026-09-10T18:00:00.000Z");
    expect(d.client_id).toBe("cli-ze");
    expect(d.aviso_reservado_em).toBeTruthy(); // a consulta não manda "assinou" depois
    expect(doc(DOC_SEM_CADASTRO)).toBeUndefined(); // cofre que não é de contrato
    expect([...armazem.values()][0].subarray(0, 5).toString()).toBe("%PDF-");
    // Lista + lê quem assinou + baixa: 3 chamadas. O link do arquivo não conta.
    expect(d4.chamadas).toEqual(["/api/v1/documents/4/status", `/api/v1/documents/${DOC_ANTIGO}/list`, `/api/v1/documents/${DOC_ANTIGO}/download`]);
  });

  it("a consulta seguinte não anuncia o que entrou pelo arquivo", async () => {
    await rodarArquivo();
    await rodarConsulta();
    expect(envio.fn).not.toHaveBeenCalled();
  });

  it("lista os finalizados no máximo uma vez a cada 20 h; PDF guardado não baixa de novo", async () => {
    await rodarArquivo();
    d4.chamadas.length = 0;
    const r = await (await rodarArquivo()).json();
    expect(r).toMatchObject({ ok: true, listou: false, guardados: 0, faltam: 0 });
    expect(d4.chamadas).toEqual([]);
  });

  it("pendente que o Lone OS já conhece e fechou: fica para a consulta, que é quem avisa", async () => {
    d4.docs.set(DOC_BRUNO, docD4(DOC_BRUNO, { emailCliente: "contato@bruno.exemplo", nome: "Bruno Tintas - Contrato.pdf" }));
    db.d4sign_documentos.push({ document_uuid: DOC_BRUNO, nome: "Bruno Tintas - Contrato.pdf", status: "pendente", signatarios: [], pdf_tentativas: 0 });
    await rodarArquivo();
    expect(doc(DOC_BRUNO)!.status).toBe("pendente");
    expect(doc(DOC_BRUNO)!.aviso_reservado_em ?? null).toBeNull();
    expect(envio.fn).not.toHaveBeenCalled();
  });

  it("para na reserva da hora: com 6 chamadas feitas, nem lista", async () => {
    db.d4sign_chamadas = Array.from({ length: 6 }, () => ({ em: new Date().toISOString(), caminho: "/x", origem: "consulta" }));
    const r = await (await rodarArquivo()).json();
    expect(r).toMatchObject({ parouNaCota: true, listou: false, guardados: 0 });
    expect(d4.chamadas).toEqual([]);
  });

  it("falha no download conta tentativa e guarda o motivo; limite da hora não gasta tentativa", async () => {
    await rodarArquivo("?dry=1"); // ensaio não grava nada nem fala com a D4Sign
    expect(db.d4sign_documentos).toEqual([]);
    expect(d4.chamadas).toEqual([]);
    d4.docs.set(DOC_ANTIGO, { ...docD4(DOC_ANTIGO, { enviadoEm: "2026-09-08 10:00:00", assinadoEm: "2026-09-10 15:00:00" }) });
    const real = fetchFalso;
    vi.stubGlobal("fetch", async (e: RequestInfo | URL) => (String(e).includes("/download") ? json({ message: "Erro interno" }, 500) : real(e)));
    await rodarArquivo();
    expect(doc(DOC_ANTIGO)).toMatchObject({ pdf_tentativas: 1, pdf_erro: expect.stringMatching(/500/) });
    expect(doc(DOC_ANTIGO)!.pdf_path ?? null).toBeNull();
    // Limite da hora: a vez volta, a tentativa não é gasta.
    db.d4sign_chamadas = Array.from({ length: 10 }, () => ({ em: new Date().toISOString(), caminho: "/x", origem: "webhook" }));
    const { guardarPdfAssinado } = await import("@/lib/contracts/arquivo-d4sign");
    const cfg = await CFG.carregarConfigD4Sign();
    expect(await guardarPdfAssinado(DOC_ANTIGO, cfg!, "manual")).toMatchObject({ ok: true, guardado: false, limite: true });
    expect(doc(DOC_ANTIGO)!.pdf_tentativas).toBe(1);
  });

  it("contrato do Lone OS ligado e sem PDF ganha o assinado; o que já tem PDF não é trocado", async () => {
    db.contracts.push({ id: "ct-ze-antigo", client_id: "cli-ze", created_at: "2026-09-01T12:00:00Z", signed_at: null, signed_pdf_path: null, status: "draft", d4sign_document_uuid: null, d4sign_assinado_em: null });
    await rodarArquivo();
    const c = db.contracts.find((x) => x.id === "ct-ze-antigo")!;
    expect(c).toMatchObject({ signed_pdf_path: doc(DOC_ANTIGO)!.pdf_path, signed_at: "2026-09-10T18:00:00.000Z", signature_method: "d4sign_auto", status: "draft" });
    const antes = db.contracts.find((x) => x.id === "ct-ze-v1")!;
    expect(antes.signed_pdf_path).toBeUndefined();
  });

  it("'Trazer agora' busca o PDF na hora (só admin) e não baixa duas vezes", async () => {
    db.d4sign_documentos.push({ document_uuid: DOC_ANTIGO, nome: "x.pdf", status: "assinado", client_id: "cli-ze", assinado_em: "2026-09-10T18:00:00.000Z", pdf_tentativas: 0, signatarios: [] });
    const pedir = () => trazerRota(new NextRequest("https://painel.lonemidia.com/api/contracts/arquivo/baixar", { method: "POST", body: JSON.stringify({ uuid: DOC_ANTIGO }) }));
    expect((await pedir()).status).toBe(401);
    admin();
    const r = await pedir();
    expect(r.status).toBe(200);
    expect((await r.json()).pdf).toMatch(/^legal:\/\//);
    d4.chamadas.length = 0;
    expect((await pedir()).status).toBe(200); // "já estava guardado"
    expect(d4.chamadas).toEqual([]);
  });

  it("a tela lista por mês e o .zip traz os PDFs com nome legível", async () => {
    await rodarArquivo();
    db.contracts.push({ id: "ct-bruno", client_id: "cli-bruno", version: 2, signed_at: "2026-09-20T13:00:00Z", signed_pdf_path: "legal://contracts-signed/cli-bruno/ct-bruno.pdf", d4sign_document_uuid: null });
    armazem.set("legal-docs/contracts-signed/cli-bruno/ct-bruno.pdf", PDF_FALSO);
    admin();
    const lista = await (await arquivoGet(new NextRequest("https://painel.lonemidia.com/api/contracts/arquivo"))).json();
    expect(lista.meses).toEqual([{ mes: "2026-09", total: 2, comPdf: 2 }]);
    expect(lista.itens.map((i: { cliente: string }) => i.cliente)).toEqual(["Bruno Tintas", "Padaria do Zé"]);
    const zip = await zipGet(new NextRequest("https://painel.lonemidia.com/api/contracts/arquivo/zip?mes=2026-09"));
    expect(zip.status).toBe(200);
    const JSZip = (await import("jszip")).default;
    const z = await JSZip.loadAsync(Buffer.from(await zip.arrayBuffer()));
    expect(Object.keys(z.files).sort()).toEqual([
      "2026-09-10 - Padaria do Ze - Padaria do Ze - Contrato - Social Media.pdf",
      "2026-09-20 - Bruno Tintas - Contrato V2.pdf",
    ]);
  });
});

// ── 28/10/2026: ligação certa, religação e a esteira de entrada ───────────────────────────────────

describe("ligação ao cadastro: teste e a própria Lone nunca recebem documento", () => {
  it("cadastro de teste ou com o nome da Lone não pode receber; loja de nome parecido pode", () => {
    for (const c of [{ name: "test" }, { name: "Teste Loja" }, { name: "🧪 Cliente" }, { name: "Loja (teste)" },
      { name: "test", nome_fantasia: "Lone Midia" }, { name: "LM ASSESSORIA E MARKETING LTDA" }, { name: "Lone Mídia" }]) {
      expect(A.podeReceberDocumento(c), JSON.stringify(c)).toBe(false);
    }
    for (const c of [{ name: "Testa Materiais" }, { name: "Bazar Ribeiro" }, { name: "Lonestar Pneus" }]) {
      expect(A.podeReceberDocumento(c), JSON.stringify(c)).toBe(true);
    }
  });

  it("o caso de 28/10: 'Serviços Lone Midia - Bike Lagos' vai para a Bike Lagos (que saiu), nunca para o 'test' de fantasia 'Lone Midia'", () => {
    const clientes = [
      { id: "cli-teste", name: "test", nome_fantasia: "Lone Midia", email: null, email_corporativo: null, churned_at: null },
      { id: "cli-bike", name: "Bike Lagos", nome_fantasia: null, email: null, email_corporativo: null, churned_at: "2026-05-01T00:00:00Z" },
    ];
    const doc = { nome: "Contrato de prestação de Serviços Lone Midia - Bike Lagos docx  1  pdf", signatarios: [] };
    expect(A.ligarComPreferencia(doc, clientes)).toMatchObject({ clientId: "cli-bike", vinculo: "nome" });
  });

  it("o e-mail de quem assina pela Lone não liga a ninguém (está em todo documento)", () => {
    const clientes = [{ id: "cli-x", name: "Loja X", email: "roberto@lone.exemplo" }];
    const doc = { nome: "documento.pdf", signatarios: [{ email: "roberto@lone.exemplo", nome: "Roberto", assinou: true, assinadoEm: null, incluidoEm: null, chave: null }] };
    expect(A.ligarAoCadastro(doc, clientes, ["roberto@lone.exemplo"]).clientId).toBeNull();
    expect(A.ligarAoCadastro(doc, clientes).clientId).toBe("cli-x"); // sem a lista, o comportamento antigo
  });
});

describe("religar (?religar=1): documento com dono inválido ou sem dono ganha o cadastro certo, sem chamar a D4Sign", () => {
  const religar = (q = "") => consulta(new NextRequest(`https://painel.lonemidia.com/api/system/contratos-d4sign?religar=1${q}`, { method: "POST" }));
  beforeEach(() => {
    db.clients.push(
      { id: "cli-teste", name: "test", nome_fantasia: "Lone Midia", email: null, email_corporativo: null, churned_at: null, contrato_assinado_em: "2026-06-22T15:00:00Z" },
      { id: "cli-bike", name: "Bike Lagos", nome_fantasia: null, email: null, email_corporativo: null, churned_at: "2026-05-01T00:00:00Z", contrato_assinado_em: null },
    );
    db.d4sign_documentos = [
      { document_uuid: DOC_ANTIGO, nome: "Contrato de prestação de Serviços Lone Midia - Bike Lagos docx pdf", status: "assinado", tipo: "contrato",
        client_id: "cli-teste", contract_id: null, vinculo: "nome", assinado_em: "2026-01-21T15:00:00Z", signatarios: [] },
      { document_uuid: DOC_BRUNO, nome: "Bruno Tintas - Contrato.pdf", status: "assinado", tipo: "contrato",
        client_id: null, contract_id: null, vinculo: null, assinado_em: "2026-10-20T15:00:00Z",
        signatarios: [{ nome: "Bruno", email: "contato@bruno.exemplo", papel: "cliente", assinou: true, assinadoEm: "2026-10-20T15:00:00Z" }] },
    ];
  });

  it("ensaio mostra e não grava", async () => {
    const r = await (await religar("&dry=1")).json();
    expect(r.trocas.map((t: { para: string }) => t.para).sort()).toEqual(["cli-bike", "cli-bruno"]);
    expect(doc(DOC_ANTIGO)!.client_id).toBe("cli-teste");
    expect(d4.chamadas).toEqual([]);
  });

  it("religa, refaz a data 'assinado em' dos dois lados e não manda nada", async () => {
    const r = await (await religar()).json();
    expect(r).toMatchObject({ ok: true, datasRefeitas: 3 });
    expect(doc(DOC_ANTIGO)).toMatchObject({ client_id: "cli-bike", vinculo: "nome" });
    expect(doc(DOC_BRUNO)).toMatchObject({ client_id: "cli-bruno", vinculo: "email" });
    expect(db.clients.find((c) => c.id === "cli-teste")!.contrato_assinado_em).toBeNull();
    expect(db.clients.find((c) => c.id === "cli-bike")!.contrato_assinado_em).toBe("2026-01-21T15:00:00Z");
    expect(db.clients.find((c) => c.id === "cli-bruno")!.contrato_assinado_em).toBe("2026-10-20T15:00:00Z");
    expect(d4.chamadas).toEqual([]);
    expect(envio.fn).not.toHaveBeenCalled();
    // Rodar de novo não troca mais nada.
    expect((await (await religar()).json()).trocas).toEqual([]);
  });
});

describe("esteira de entrada (8h30): contrato, cadastro esperando aprovação e link sem preencher", () => {
  const dia = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString();
  beforeEach(() => {
    db.clients.push(
      { id: "cli-boali", name: "Boali Araruama", nome_fantasia: null, draft_status: "awaiting_approval", created_at: dia(14), contrato_assinado_em: dia(0), churned_at: null },
      { id: "cli-gk", name: "GK Pneus", nome_fantasia: null, draft_status: "pending_invite", created_at: dia(12), contrato_assinado_em: null, churned_at: null },
      { id: "cli-festas", name: "Armazém das Festas", nome_fantasia: null, draft_status: "pending_invite", created_at: dia(40), contrato_assinado_em: null, churned_at: null },
      { id: "cli-novo", name: "Loja Recém", nome_fantasia: null, draft_status: "pending_invite", created_at: dia(1), contrato_assinado_em: null, churned_at: null },
      { id: "cli-teste", name: "test", nome_fantasia: "Lone Midia", draft_status: "pending_invite", created_at: dia(10), contrato_assinado_em: null, churned_at: null },
    );
    db.client_onboarding_submissions = [
      { client_id: "cli-boali", status: "submitted", created_at: dia(14), submitted_at: dia(13) },
      { client_id: "cli-gk", status: "pending", created_at: dia(12), submitted_at: null },
    ];
    db.d4sign_documentos = [];
  });

  it("só cadastros parados já viram mensagem; teste fica de fora; link esquecido vira uma linha", async () => {
    const corpo = await (await rodarManha()).json();
    expect(corpo).toMatchObject({ ok: true, enviado: true });
    expect(mensagens().at(-1)!.texto).toBe([
      "⏳ *Entrada de clientes — o que está parado*",
      "",
      "*Cadastro esperando aprovação* _(Clientes › Cadastros Pendentes)_",
      "• *Boali Araruama* — preencheu há 13 dias · contrato já assinado",
      "",
      "*Link de cadastro sem preencher*",
      "• *GK Pneus* — link enviado há 12 dias",
      "_E mais 1 sem resposta há mais de 30 dias._",
    ].join("\n"));
  });

  it("nada parado: nada sai", async () => {
    db.clients = db.clients.filter((c) => !["cli-boali", "cli-gk", "cli-festas"].includes(c.id as string));
    const corpo = await (await rodarManha()).json();
    expect(corpo).toMatchObject({ enviado: false, motivo: expect.stringMatching(/nenhum cadastro parado/) });
    expect(envio.fn).not.toHaveBeenCalled();
  });
});

// ── Enviar para assinatura pelo Lone OS (28/10/2026, leva 3) ──────────────────────────────────────

describe("enviar para assinatura: cliente concordou → D4Sign manda o link para o e-mail dele", () => {
  const E = () => import("@/lib/contracts/enviar-d4sign");
  const CONTRATO = "ct-ze-v3";
  beforeEach(async () => {
    (await E())._esquecerCofres();
    db.contracts.push({ id: CONTRATO, client_id: "cli-ze", version: 3, service_type: "lone_growth", status: "draft",
      pdf_url: "/storage/v1/object/public/contracts/cli-ze/contrato-v3.pdf", signed_at: null, d4sign_document_uuid: null,
      d4sign_assinado_em: null, d4sign_envio_etapa: null, d4sign_envio_por: null, archived_at: null });
    armazem.set("contracts/cli-ze/contrato-v3.pdf", PDF_FALSO);
  });
  const contrato = () => db.contracts.find((c) => c.id === CONTRATO)!;

  it("regras puras: quem pode, o nome do arquivo, o cofre do serviço e onde está o PDF", async () => {
    const { situacaoDoEnvio, nomeDoArquivo, cofreSugerido, caminhoDoPdf } = await E();
    const base = { id: "x", client_id: "c", version: 1, service_type: "lone_growth", pdf_url: "/storage/v1/object/public/contracts/c/a.pdf", signed_at: null, d4sign_document_uuid: null };
    expect(situacaoDoEnvio(base)).toEqual({ ok: true, continuaDe: "subir" });
    expect(situacaoDoEnvio({ ...base, d4sign_document_uuid: "u", d4sign_envio_etapa: "subido" })).toEqual({ ok: true, continuaDe: "signatarios" });
    expect(situacaoDoEnvio({ ...base, d4sign_document_uuid: "u" })).toMatchObject({ ok: false, motivo: expect.stringMatching(/painel/) });
    expect(situacaoDoEnvio({ ...base, signed_at: "2026-10-01" })).toMatchObject({ ok: false });
    expect(situacaoDoEnvio({ ...base, pdf_url: null })).toMatchObject({ ok: false, motivo: expect.stringMatching(/PDF/) });
    expect(nomeDoArquivo("Padaria do Zé", "assessoria_trafego", 2)).toBe("Padaria do Zé - Contrato - Assessoria de Trafego Pago V2.pdf");
    const cofres = [{ uuid: "a", nome: "Renovação de contrato" }, { uuid: "b", nome: "LM - Assessoria Social (Só midia)" }, { uuid: "c", nome: "LM - Lone Growth (pacote completo)" }];
    expect(cofreSugerido(cofres, "lone_growth")).toBe("c");
    expect(cofreSugerido(cofres, "assessoria_social")).toBe("b");
    expect(caminhoDoPdf("/storage/v1/object/public/contracts/cli/x.pdf")).toEqual({ bucket: "contracts", caminho: "cli/x.pdf" });
  });

  it("prévia: e-mail do cadastro, quem assina pela Lone e o cofre sugerido — nada sai", async () => {
    const r = await (await E()).preverEnvio(CONTRATO);
    expect(r).toMatchObject({ ok: true, previa: { cliente: "Padaria do Zé", emailsCliente: ["dono@padariadoze.exemplo"], emailsLone: ["roberto@lone.exemplo"], continuaDe: "subir" } });
    if (r.ok) expect(r.previa.cofres.find((c) => c.sugerido)?.nome).toMatch(/Lone Growth/);
    expect(d4.chamadas).toEqual(["/api/v1/safes"]);
    expect(envio.fn).not.toHaveBeenCalled();
  });

  it("envia: sobe o PDF, cadastra cliente e Lone como parte, manda — e o grupo de cadastro sabe (sem valor)", async () => {
    const r = await (await E()).enviarParaAssinatura({ contractId: CONTRATO, cofre: COFRE, email: "dono@padariadoze.exemplo", quem: "roberto@lone.exemplo" });
    expect(r).toMatchObject({ ok: true, etapa: "enviado", documento: "d0c00000-0000-4000-8000-0000000000e9" });
    expect(d4.corpos.map((c) => c.caminho)).toEqual(["uploadbinary", "createlist", "sendtosigner"]);
    expect(d4.corpos[0].corpo).toMatchObject({ mime_type: "application/pdf", name: "Padaria do Zé - Contrato - Lone Growth (Trafego + Social + Design) V3.pdf" });
    expect(Buffer.from(String(d4.corpos[0].corpo.base64_binary_file), "base64").subarray(0, 5).toString()).toBe("%PDF-");
    expect((d4.corpos[1].corpo.signers as { email: string; act: string }[]).map((x) => [x.email, x.act])).toEqual([["dono@padariadoze.exemplo", "4"], ["roberto@lone.exemplo", "4"]]);
    expect(d4.corpos[2].corpo).toMatchObject({ skip_email: "0", workflow: "0" });
    expect(String(d4.corpos[2].corpo.message)).not.toMatch(/R\$|\d{3,}/);
    expect(contrato()).toMatchObject({ d4sign_envio_etapa: "enviado", d4sign_document_uuid: "d0c00000-0000-4000-8000-0000000000e9", d4sign_envio_erro: null });
    expect(doc("d0c00000-0000-4000-8000-0000000000e9")).toMatchObject({ status: "pendente", client_id: "cli-ze", contract_id: CONTRATO });
    expect(mensagens()).toEqual([{ grupo: GRUPO_CADASTRO, texto: expect.stringMatching(/^📨 Contrato de \*Padaria do Zé\* enviado para assinatura/) }]);
    // De novo: recusa, nada sai.
    d4.corpos.length = 0;
    expect(await (await E()).enviarParaAssinatura({ contractId: CONTRATO, cofre: COFRE, email: "dono@padariadoze.exemplo", quem: "x" }))
      .toMatchObject({ ok: false, erro: expect.stringMatching(/já foi enviado/) });
    expect(d4.corpos).toEqual([]);
  });

  it("falha no meio: o arquivo fica, o erro aparece, e o clique seguinte CONTINUA sem subir de novo", async () => {
    d4.falharEnvio = "createlist";
    const r1 = await (await E()).enviarParaAssinatura({ contractId: CONTRATO, cofre: COFRE, email: "dono@padariadoze.exemplo", quem: "x" });
    expect(r1).toMatchObject({ ok: false, etapa: "subido", erro: expect.stringMatching(/não cadastrei quem assina/) });
    expect(contrato()).toMatchObject({ d4sign_envio_etapa: "subido", d4sign_envio_erro: expect.stringMatching(/não cadastrei/) });
    expect(envio.fn).not.toHaveBeenCalled();
    d4.falharEnvio = null;
    d4.corpos.length = 0;
    const r2 = await (await E()).enviarParaAssinatura({ contractId: CONTRATO, cofre: COFRE, email: "dono@padariadoze.exemplo", quem: "x" });
    expect(r2).toMatchObject({ ok: true, etapa: "enviado" });
    expect(d4.corpos.map((c) => c.caminho)).toEqual(["createlist", "sendtosigner"]);
  });

  it("e-mail fora do cadastro, cofre que não é de contrato e contrato que veio do painel: recusa sem chamar a D4Sign", async () => {
    const { enviarParaAssinatura } = await E();
    expect(await enviarParaAssinatura({ contractId: CONTRATO, cofre: COFRE, email: "outro@x.exemplo", quem: "x" })).toMatchObject({ ok: false, erro: expect.stringMatching(/não é o do cadastro/) });
    expect(await enviarParaAssinatura({ contractId: CONTRATO, cofre: OUTRO_COFRE, email: "dono@padariadoze.exemplo", quem: "x" })).toMatchObject({ ok: false, erro: expect.stringMatching(/cofre/) });
    contrato().d4sign_document_uuid = DOC_ZE;
    expect(await enviarParaAssinatura({ contractId: CONTRATO, cofre: COFRE, email: "dono@padariadoze.exemplo", quem: "x" })).toMatchObject({ ok: false, erro: expect.stringMatching(/painel/) });
    expect(d4.chamadas).toEqual([]);
  });

  it("limite da hora antes de subir: nada fica pela metade e dá para tentar de novo", async () => {
    db.d4sign_chamadas = Array.from({ length: 10 }, () => ({ em: new Date().toISOString(), caminho: "/x", origem: "webhook" }));
    const r = await (await E()).enviarParaAssinatura({ contractId: CONTRATO, cofre: COFRE, email: "dono@padariadoze.exemplo", quem: "x" });
    expect(r).toMatchObject({ ok: false, limite: true, etapa: null });
    expect(contrato()).toMatchObject({ d4sign_envio_etapa: null, d4sign_envio_por: null, d4sign_document_uuid: null });
  });
});

