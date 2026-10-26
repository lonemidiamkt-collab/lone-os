// lib/contracts/d4sign.ts — a conversa com a D4Sign: ler um documento (com os signatários), listar o cofre
// dos contratos, conferir a assinatura do webhook e cadastrar o webhook do cofre (só quando alguém pede).
//
// As credenciais são do Roberto e moram SÓ no .env da VPS (/opt/loneos/.env), nunca no repositório, que é
// público. Vazias = integração desligada (o webhook responde 503 e a consulta de hora em hora pula):
//   D4SIGN_API_TOKEN, D4SIGN_CRYPT_KEY  "tokenAPI" e "cryptKey" (Opções da conta › Dev (API))
//   D4SIGN_HMAC_SECRET                  "Gerar Secret Key MAC" na mesma área: confere que o webhook veio da D4Sign
//   D4SIGN_SAFE_UUID                    o cofre dos contratos; a consulta e o webhook só olham ele
//   D4SIGN_API_URL                      opcional; padrão https://secure.d4sign.com.br/api/v1 (sandbox para teste)
//
// Documentação seguida (docapi.d4sign.com.br, out/2026): "WebHook (POSTBack)", "Segurança de Webhook",
// "Cadastrar ou atualizar uma URL de Webhook 2.0", "Endpoints Documentos" e "Endpoints Signatários".
// O que a documentação não mostra com exemplo (a paginação do cofre, o formato das datas) é lido com folga:
// campo que não veio vira null, nunca "assinado".

import { createHmac, timingSafeEqual } from "node:crypto";

export interface ConfigD4Sign {
  url: string;
  token: string;
  cryptKey: string;
  hmac: string | null;
  cofre: string | null;
}

const URL_PADRAO = "https://secure.d4sign.com.br/api/v1";

/** null = desligada (falta token ou cryptKey). */
export function configD4Sign(env: Record<string, string | undefined> = process.env): ConfigD4Sign | null {
  const token = env.D4SIGN_API_TOKEN?.trim();
  const cryptKey = env.D4SIGN_CRYPT_KEY?.trim();
  if (!token || !cryptKey) return null;
  return {
    url: (env.D4SIGN_API_URL?.trim() || URL_PADRAO).replace(/\/+$/, ""),
    token, cryptKey,
    hmac: env.D4SIGN_HMAC_SECRET?.trim() || null,
    cofre: env.D4SIGN_SAFE_UUID?.trim() || null,
  };
}

// ── Fases da D4Sign ──────────────────────────────────────────────────────────────────────────────
// 1 Processando · 2 Aguardando Signatários · 3 Aguardando Assinaturas · 4 Finalizado · 5 Arquivado
// 6 Cancelado · 7 Editando. "Pendente" é só a 3: na 2 o documento subiu mas ninguém foi chamado a assinar.

export type StatusDoc = "pendente" | "assinado" | "cancelado" | "outro";

export interface Signatario {
  email: string | null;
  nome: string | null;
  assinou: boolean;
  assinadoEm: string | null;
  /** Quando foi incluído no documento — é quando o documento saiu para assinatura. */
  incluidoEm: string | null;
}

export interface DocumentoD4Sign {
  uuid: string;
  nome: string;
  cofre: string | null;
  statusId: string;
  signatarios: Signatario[];
}

/** O que a listagem do cofre traz de cada documento (sem signatários). */
export interface ResumoD4Sign {
  uuid: string;
  nome: string;
  statusId: string;
}

/**
 * A fase de verdade. Arquivado (5) só conta como assinado se a leitura trouxe os signatários e todos
 * assinaram; sem a lista não se afirma nada.
 */
export function statusEfetivo(doc: Pick<DocumentoD4Sign, "statusId" | "signatarios">): StatusDoc {
  switch (String(doc.statusId)) {
    case "4": return "assinado";
    case "3": return "pendente";
    case "6": return "cancelado";
    case "5": return doc.signatarios.length > 0 && doc.signatarios.every((s) => s.assinou) ? "assinado" : "outro";
    default: return "outro";
  }
}

/**
 * Data da D4Sign → ISO. Aceita ISO com fuso ("2026-10-26T14:02:27-03:00", o date_signed_atom),
 * "2026-10-26 14:02:27" e "26/10/2026 14:02:27" (horário de Brasília). Qualquer outra coisa → null.
 */
export function lerDataD4Sign(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  let iso: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) iso = /([+-]\d{2}:?\d{2}|Z)$/.test(s) ? s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2") : `${s}-03:00`;
  else {
    const a = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    const b = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (a) iso = `${a[1]}-${a[2]}-${a[3]}T${a[4]}:${a[5]}:${a[6] ?? "00"}-03:00`;
    else if (b) iso = `${b[3]}-${b[2]}-${b[1]}T${b[4] ?? "12"}:${b[5] ?? "00"}:${b[6] ?? "00"}-03:00`;
  }
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

function lerSignatario(s: Record<string, unknown>): Signatario {
  const info = (s.sign_info && typeof s.sign_info === "object" ? s.sign_info : {}) as Record<string, unknown>;
  const assinadoEm = lerDataD4Sign(info.date_signed_atom) ?? lerDataD4Sign(info.date_signed);
  return {
    email: texto(s.email)?.toLowerCase() ?? null,
    nome: texto(s.user_name),
    assinou: String(s.signed ?? "") === "1",
    assinadoEm,
    incluidoEm: lerDataD4Sign(s.date),
  };
}

/** O corpo de GET /documents/{uuid}/list (vem em lista com um item, ou o próprio objeto). */
export function lerDocumento(corpo: unknown): DocumentoD4Sign | null {
  const bruto = Array.isArray(corpo) ? corpo.find((x) => x && typeof x === "object" && "uuidDoc" in x) : corpo;
  if (!bruto || typeof bruto !== "object") return null;
  const d = bruto as Record<string, unknown>;
  const uuid = texto(d.uuidDoc);
  const statusId = texto(d.statusId);
  if (!uuid || !statusId) return null;
  const lista = Array.isArray(d.list) ? d.list : [];
  return {
    uuid,
    nome: texto(d.nameDoc) ?? "",
    cofre: texto(d.uuidSafe),
    statusId,
    signatarios: lista.filter((s) => s && typeof s === "object").map((s) => lerSignatario(s as Record<string, unknown>)),
  };
}

/** Uma página da listagem do cofre: os documentos e, se vier, o total de páginas. */
export function lerPaginaDoCofre(corpo: unknown): { docs: ResumoD4Sign[]; paginas: number | null } | null {
  if (!Array.isArray(corpo)) return null;
  const docs: ResumoD4Sign[] = [];
  let paginas: number | null = null;
  for (const x of corpo) {
    if (!x || typeof x !== "object") continue;
    const d = x as Record<string, unknown>;
    const uuid = texto(d.uuidDoc);
    if (uuid) {
      docs.push({ uuid, nome: texto(d.nameDoc) ?? "", statusId: texto(d.statusId) ?? "" });
      continue;
    }
    const total = Number(d.total_pages ?? d.total_paginas);
    if (Number.isFinite(total) && total > 0) paginas = Math.floor(total);
  }
  return { docs, paginas };
}

export type Leitura<T> = { ok: true; dados: T } | { ok: false; erro: string };

const PRAZO_MS = 20_000;

async function pedir(cfg: ConfigD4Sign, caminho: string, init?: { metodo?: "GET" | "POST"; corpo?: unknown; extra?: Record<string, string> }): Promise<Leitura<unknown>> {
  const q = new URLSearchParams({ tokenAPI: cfg.token, cryptKey: cfg.cryptKey, ...(init?.extra ?? {}) });
  const url = `${cfg.url}${caminho}${caminho.includes("?") ? "&" : "?"}${q.toString()}`;
  try {
    const r = await fetch(url, {
      method: init?.metodo ?? "GET",
      headers: { Accept: "application/json", ...(init?.corpo ? { "Content-Type": "application/json" } : {}) },
      body: init?.corpo ? JSON.stringify(init.corpo) : undefined,
      signal: AbortSignal.timeout(PRAZO_MS),
      cache: "no-store",
    });
    const bruto = await r.text();
    let corpo: unknown = null;
    try { corpo = bruto ? JSON.parse(bruto) : null; } catch { /* corpo não-JSON: tratado abaixo */ }
    // A credencial nunca vai para a mensagem de erro: só o caminho e o que a D4Sign respondeu.
    const msg = corpo && typeof corpo === "object" && !Array.isArray(corpo) ? texto((corpo as Record<string, unknown>).message) : null;
    if (!r.ok) return { ok: false, erro: `D4Sign respondeu ${r.status} em ${caminho}${msg ? `: ${msg}` : ""}` };
    if (corpo === null) return { ok: false, erro: `D4Sign devolveu uma resposta que não é JSON em ${caminho}` };
    return { ok: true, dados: corpo };
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    return { ok: false, erro: nome === "TimeoutError" || nome === "AbortError"
      ? `D4Sign não respondeu em ${PRAZO_MS / 1000}s (${caminho})`
      : `não consegui falar com a D4Sign (${caminho}): ${e instanceof Error ? e.message : "erro de rede"}` };
  }
}

/** GET /documents/{uuid}/list — o documento, a fase e os signatários (e-mail, assinou, quando). */
export async function buscarDocumento(cfg: ConfigD4Sign, uuid: string): Promise<Leitura<DocumentoD4Sign>> {
  const r = await pedir(cfg, `/documents/${encodeURIComponent(uuid)}/list`);
  if (!r.ok) return r;
  const doc = lerDocumento(r.dados);
  if (!doc) return { ok: false, erro: `a D4Sign não devolveu o documento ${uuid}` };
  return { ok: true, dados: doc };
}

/** GET /documents/{cofre}/safe, página a página (500 por página; teto de 20 páginas). */
export async function listarCofre(cfg: ConfigD4Sign, cofre: string): Promise<Leitura<ResumoD4Sign[]>> {
  const todos: ResumoD4Sign[] = [];
  for (let pg = 1; pg <= 20; pg++) {
    const r = await pedir(cfg, `/documents/${encodeURIComponent(cofre)}/safe`, { extra: { pg: String(pg) } });
    if (!r.ok) return r;
    const pagina = lerPaginaDoCofre(r.dados);
    if (!pagina) return { ok: false, erro: "a listagem do cofre veio num formato que não reconheço" };
    todos.push(...pagina.docs);
    if (!pagina.paginas || pg >= pagina.paginas || pagina.docs.length === 0) break;
  }
  return { ok: true, dados: todos };
}

/** GET /webhooks/v2/ — a URL de webhook cadastrada no cofre (só leitura). */
export async function verWebhookDoCofre(cfg: ConfigD4Sign, cofre: string): Promise<Leitura<unknown>> {
  return pedir(cfg, "/webhooks/v2/", { extra: { type: "cofre", uuid: cofre } });
}

/** POST /webhooks/v2/ — cadastra/atualiza a URL do webhook do cofre. Só roda quando alguém pede. */
export async function cadastrarWebhookDoCofre(cfg: ConfigD4Sign, cofre: string, url: string): Promise<Leitura<unknown>> {
  return pedir(cfg, "/webhooks/v2/", { metodo: "POST", corpo: { type: "cofre", uuid: cofre, url } });
}

// ── Webhook ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Confere o cabeçalho Content-Hmac: "sha256=" + HMAC-SHA256 do UUID do documento com a Secret Key MAC
 * da conta. Comparação em tempo constante.
 */
export function hmacConfere(uuid: string, cabecalho: string | null, segredo: string): boolean {
  if (!cabecalho) return false;
  const recebido = cabecalho.trim().replace(/^sha256=/i, "").toLowerCase();
  const esperado = createHmac("sha256", segredo).update(uuid).digest("hex");
  if (recebido.length !== esperado.length) return false;
  return timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
}

/** 1 Finalizado · 2 E-mail não entregue · 3 Cancelado · 4 Um signatário assinou. */
export interface EventoD4Sign {
  uuid: string;
  tipo: string | null;
  quando: string | null;
}

/**
 * O corpo do webhook. A D4Sign manda em form-data; aceita também urlencoded e JSON, que custam nada e
 * evitam que uma mudança de formato do lado deles vire "evento sem documento".
 */
export async function lerEventoWebhook(req: Request): Promise<EventoD4Sign | null> {
  const tipoConteudo = req.headers.get("content-type") || "";
  const bruto = await req.text();
  let campos: Record<string, unknown> = {};
  try {
    if (tipoConteudo.includes("application/json") || /^\s*\{/.test(bruto)) {
      campos = JSON.parse(bruto) as Record<string, unknown>;
    } else if (tipoConteudo.includes("multipart/form-data")) {
      const fd = await new Response(bruto, { headers: { "content-type": tipoConteudo } }).formData();
      fd.forEach((v, k) => { if (typeof v === "string") campos[k] = v; });
    } else {
      new URLSearchParams(bruto).forEach((v, k) => { campos[k] = v; });
    }
  } catch {
    return null;
  }
  const uuid = texto(campos.uuid);
  if (!uuid) return null;
  return { uuid, tipo: texto(campos.type_post), quando: lerDataD4Sign(campos.event_datetime) };
}
