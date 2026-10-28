// lib/contracts/d4sign.ts — a conversa com a D4Sign (API v1 + webhook 2.0): ler um documento com os
// signatários, listar os cofres da conta e os documentos esperando assinatura, conferir a assinatura do
// webhook e cadastrar o webhook de cada cofre.
//
// As credenciais são do Roberto: entram pelo painel (Configurações › Jurídico, cifradas — lib/contracts/
// d4sign-config.ts) ou, de reserva, no .env da VPS. Nunca no repositório, que é público. Sem token =
// integração desligada (o webhook responde 503 e as rotinas pulam). Variáveis de reserva:
//   D4SIGN_API_TOKEN     "tokenAPI" (Opções da conta › Dev (API))
//   D4SIGN_CRYPT_KEY     "cryptKey" — só vai na chamada se existir (a D4Sign só exige quando está habilitada)
//   D4SIGN_HMAC_SECRET   "Gerar Secret Key MAC" na mesma área: confere que o webhook veio da D4Sign
//   D4SIGN_SAFE_UUID     os cofres dos contratos (UUIDs separados por vírgula); consulta e webhook só olham eles.
//                        Na conta da Lone os contratos ficam em ~10 cofres (um por pacote, renovação…).
//   D4SIGN_EMAILS_LONE   e-mails com que os sócios assinam na D4Sign, separados por vírgula ("quem é da Lone")
//   D4SIGN_API_URL       opcional; padrão https://secure.d4sign.com.br/api/v1 (sandbox para teste)
//   D4SIGN_LIMITE_HORA   opcional; padrão 10 chamadas por hora (lib/contracts/d4sign-cota.ts)
//
// Documentação seguida (docapi.d4sign.com.br, lida em 26/10/2026): "Introdução a API", "Endpoints
// Cofres" (GET /safes), "Endpoints Documentos" (GET /documents/{fase}/status), "Endpoints Signatários",
// "WebHook (POSTBack)", "Segurança de Webhook" e a referência de webhooks 2.0. O que a documentação não
// mostra com exemplo é lido com folga: campo que não veio vira null, nunca "assinado".

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { reservarChamada, limiteDaHora, type OrigemChamada } from "./d4sign-cota";

export interface ConfigD4Sign {
  url: string;
  token: string;
  cryptKey: string | null;
  hmac: string | null;
  /** Os cofres dos contratos (UUIDs, minúsculos). Vazio = nenhum escolhido: consulta e webhook ficam parados. */
  cofres: string[];
  /** E-mails de quem assina pela Lone (minúsculos). */
  emailsLone: string[];
  limiteHora: number;
}

const URL_PADRAO = "https://secure.d4sign.com.br/api/v1";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** "UUID1, UUID2" → ["uuid1", "uuid2"]; o que não for UUID fica de fora. */
export function listaDeUuids(v: string | null | undefined): string[] {
  return [...new Set((v ?? "").split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => UUID.test(e)))];
}

/** "a@x.com, B@y.com" → ["a@x.com", "b@y.com"]; o que não for e-mail fica de fora. */
export function listaDeEmails(v: string | null | undefined): string[] {
  return [...new Set((v ?? "").split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];
}

/** null = desligada (falta o token). */
export function configD4Sign(env: Record<string, string | undefined> = process.env): ConfigD4Sign | null {
  const token = env.D4SIGN_API_TOKEN?.trim();
  if (!token) return null;
  return {
    url: (env.D4SIGN_API_URL?.trim() || URL_PADRAO).replace(/\/+$/, ""),
    token,
    cryptKey: env.D4SIGN_CRYPT_KEY?.trim() || null,
    hmac: env.D4SIGN_HMAC_SECRET?.trim() || null,
    cofres: listaDeUuids(env.D4SIGN_SAFE_UUID),
    emailsLone: listaDeEmails(env.D4SIGN_EMAILS_LONE),
    limiteHora: limiteDaHora(env),
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
  /** key_signer da D4Sign (o reenvio do link precisa dele). */
  chave: string | null;
}

export interface DocumentoD4Sign {
  uuid: string;
  nome: string;
  cofre: string | null;
  statusId: string;
  signatarios: Signatario[];
}

/** O que uma listagem traz de cada documento (sem signatários). */
export interface ResumoD4Sign {
  uuid: string;
  nome: string;
  statusId: string;
  /** uuidSafe do documento, minúsculo (null se a listagem não trouxe). */
  cofre: string | null;
}

/** Um cofre da conta (GET /safes). */
export interface CofreD4Sign { uuid: string; nome: string }

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
    chave: texto(s.key_signer),
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
    cofre: texto(d.uuidSafe)?.toLowerCase() ?? null,
    statusId,
    signatarios: lista.filter((s) => s && typeof s === "object").map((s) => lerSignatario(s as Record<string, unknown>)),
  };
}

/** Uma página de listagem de documentos: os documentos e, se vier, o total de páginas. */
export function lerPaginaDeDocumentos(corpo: unknown): { docs: ResumoD4Sign[]; paginas: number | null } | null {
  if (!Array.isArray(corpo)) return null;
  const docs: ResumoD4Sign[] = [];
  let paginas: number | null = null;
  for (const x of corpo) {
    if (!x || typeof x !== "object") continue;
    const d = x as Record<string, unknown>;
    const uuid = texto(d.uuidDoc);
    if (uuid) {
      docs.push({ uuid, nome: texto(d.nameDoc) ?? "", statusId: texto(d.statusId) ?? "", cofre: texto(d.uuidSafe)?.toLowerCase() ?? null });
      continue;
    }
    const total = Number(d.total_pages ?? d.total_paginas);
    if (Number.isFinite(total) && total > 0) paginas = Math.floor(total);
  }
  return { docs, paginas };
}

/**
 * O corpo de GET /safes: lista de { "uuid-safe", "name-safe" } (a documentação usa hífen; aceita também
 * uuid_safe/uuidSafe/uuid e name_safe/nameSafe/name). null = formato que não reconheço.
 */
export function lerCofres(corpo: unknown): CofreD4Sign[] | null {
  const lista = Array.isArray(corpo) ? corpo : corpo && typeof corpo === "object" && Array.isArray((corpo as Record<string, unknown>).safes)
    ? (corpo as Record<string, unknown>).safes as unknown[] : null;
  if (!lista) return null;
  const cofres: CofreD4Sign[] = [];
  for (const x of lista) {
    if (!x || typeof x !== "object") continue;
    const d = x as Record<string, unknown>;
    const uuid = texto(d["uuid-safe"] ?? d.uuid_safe ?? d.uuidSafe ?? d.uuid)?.toLowerCase();
    if (!uuid || !UUID.test(uuid)) continue;
    cofres.push({ uuid, nome: texto(d["name-safe"] ?? d.name_safe ?? d.nameSafe ?? d.name) ?? uuid });
  }
  return cofres;
}

/** `limite`: a chamada não saiu porque a cota da hora acabou (lib/contracts/d4sign-cota.ts). */
export type Leitura<T> = { ok: true; dados: T } | { ok: false; erro: string; limite?: boolean };

const PRAZO_MS = 20_000;

async function pedir(cfg: ConfigD4Sign, caminho: string, init: {
  origem: OrigemChamada;
  metodo?: "GET" | "POST";
  corpo?: unknown;
  extra?: Record<string, string>;
}): Promise<Leitura<unknown>> {
  const cota = await reservarChamada(caminho, init.origem, cfg.limiteHora);
  if (!cota.ok) return { ok: false, erro: cota.erro, limite: true };
  const q = new URLSearchParams({ tokenAPI: cfg.token, ...(cfg.cryptKey ? { cryptKey: cfg.cryptKey } : {}), ...(init.extra ?? {}) });
  const url = `${cfg.url}${caminho}${caminho.includes("?") ? "&" : "?"}${q.toString()}`;
  try {
    const r = await fetch(url, {
      method: init.metodo ?? "GET",
      headers: { Accept: "application/json", ...(init.corpo ? { "Content-Type": "application/json" } : {}) },
      body: init.corpo ? JSON.stringify(init.corpo) : undefined,
      signal: AbortSignal.timeout(PRAZO_MS),
      cache: "no-store",
    });
    const bruto = await r.text();
    let corpo: unknown = null;
    try { corpo = bruto ? JSON.parse(bruto) : null; } catch { /* corpo não-JSON: tratado abaixo */ }
    // A credencial nunca vai para a mensagem de erro: só o caminho e o que a D4Sign respondeu.
    const msg = corpo && typeof corpo === "object" && !Array.isArray(corpo) ? texto((corpo as Record<string, unknown>).message) : null;
    if (r.status === 429) return { ok: false, erro: `a D4Sign recusou por limite de chamadas (${caminho})`, limite: true };
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

// ── Leitura ──────────────────────────────────────────────────────────────────────────────────────

/** GET /documents/{uuid}/list — o documento, a fase e os signatários (e-mail, assinou, quando, chave). */
export async function buscarDocumento(cfg: ConfigD4Sign, uuid: string, origem: OrigemChamada = "manual"): Promise<Leitura<DocumentoD4Sign>> {
  const r = await pedir(cfg, `/documents/${encodeURIComponent(uuid)}/list`, { origem });
  if (!r.ok) return r;
  const doc = lerDocumento(r.dados);
  if (!doc) return { ok: false, erro: `a D4Sign não devolveu o documento ${uuid}` };
  return { ok: true, dados: doc };
}

/** GET /safes — todos os cofres da conta (para escolher, no painel, quais são de contrato). */
export async function listarCofresDaConta(cfg: ConfigD4Sign): Promise<Leitura<CofreD4Sign[]>> {
  const r = await pedir(cfg, "/safes", { origem: "manual" });
  if (!r.ok) return r;
  const cofres = lerCofres(r.dados);
  return cofres ? { ok: true, dados: cofres } : { ok: false, erro: "a lista de cofres veio num formato que não reconheço" };
}

/**
 * GET /documents/3/status — os documentos da conta INTEIRA esperando assinatura (fase 3), página a página
 * (500 por página; teto de 3 páginas). `completa` = leu todas as páginas: só então "sumiu da lista" quer
 * dizer "mudou de fase". Uma chamada por página, não uma por cofre.
 */
export async function listarPendentesDaConta(cfg: ConfigD4Sign, origem: OrigemChamada = "consulta"):
  Promise<Leitura<{ docs: ResumoD4Sign[]; completa: boolean }>> {
  const docs: ResumoD4Sign[] = [];
  const TETO = 3;
  for (let pg = 1; pg <= TETO; pg++) {
    const r = await pedir(cfg, "/documents/3/status", { origem, extra: { pg: String(pg) } });
    if (!r.ok) return r;
    const pagina = lerPaginaDeDocumentos(Array.isArray(r.dados) ? r.dados : [r.dados]);
    if (!pagina) return { ok: false, erro: "a lista de documentos esperando assinatura veio num formato que não reconheço" };
    docs.push(...pagina.docs);
    if (!pagina.paginas || pg >= pagina.paginas || pagina.docs.length === 0) return { ok: true, dados: { docs, completa: true } };
  }
  return { ok: true, dados: { docs, completa: false } };
}

/**
 * GET /documents/4/status — os documentos FINALIZADOS da conta (todas as assinaturas feitas), uma página
 * (500 por página) por chamada. Base do arquivo de contratos por mês.
 */
export async function listarFinalizadosDaConta(cfg: ConfigD4Sign, pagina: number, origem: OrigemChamada = "arquivo"):
  Promise<Leitura<{ docs: ResumoD4Sign[]; paginas: number | null }>> {
  const r = await pedir(cfg, "/documents/4/status", { origem, extra: { pg: String(pagina) } });
  if (!r.ok) return r;
  const lida = lerPaginaDeDocumentos(Array.isArray(r.dados) ? r.dados : [r.dados]);
  return lida ? { ok: true, dados: lida } : { ok: false, erro: "a lista de documentos finalizados veio num formato que não reconheço" };
}

// ── PDF assinado ─────────────────────────────────────────────────────────────────────────────────

/** O mesmo teto do "Upload assinado". */
export const PDF_MAXIMO = 20 * 1024 * 1024;

/**
 * POST /documents/{uuid}/download (type PDF) → { url, name }, e o arquivo nessa URL (o link não conta no
 * limite: é o armazenamento da D4Sign, não a API). Só aceita PDF de verdade (começa com %PDF-), até 20 MB.
 */
export async function baixarPdfAssinado(cfg: ConfigD4Sign, uuid: string, origem: OrigemChamada):
  Promise<Leitura<{ arquivo: Buffer; nome: string }>> {
  const r = await pedir(cfg, `/documents/${encodeURIComponent(uuid)}/download`, {
    origem, metodo: "POST", corpo: { type: "PDF", language: "pt" },
  });
  if (!r.ok) return r;
  const d = (r.dados && typeof r.dados === "object" ? r.dados : {}) as Record<string, unknown>;
  const link = texto(d.url);
  const nome = texto(d.name) ?? `${uuid}.pdf`;
  if (!link || !/^https:\/\//i.test(link)) return { ok: false, erro: "a D4Sign não devolveu o link do PDF assinado" };
  try {
    const f = await fetch(link, { signal: AbortSignal.timeout(PRAZO_MS * 2), cache: "no-store" });
    if (!f.ok) return { ok: false, erro: `o link do PDF da D4Sign respondeu ${f.status}` };
    const arquivo = Buffer.from(await f.arrayBuffer());
    if (arquivo.length === 0 || arquivo.length > PDF_MAXIMO) return { ok: false, erro: `o PDF da D4Sign veio com ${arquivo.length} bytes` };
    if (arquivo.subarray(0, 5).toString("latin1") !== "%PDF-") return { ok: false, erro: "o arquivo da D4Sign não é um PDF" };
    return { ok: true, dados: { arquivo, nome } };
  } catch (e) {
    return { ok: false, erro: `não consegui baixar o PDF da D4Sign: ${e instanceof Error ? e.message : "erro de rede"}` };
  }
}

// ── Webhook do cofre ─────────────────────────────────────────────────────────────────────────────

/** GET /webhooks/v2/ — a URL de webhook cadastrada no cofre (só leitura). */
export async function verWebhookDoCofre(cfg: ConfigD4Sign, cofre: string): Promise<Leitura<unknown>> {
  return pedir(cfg, "/webhooks/v2/", { origem: "manual", extra: { type: "cofre", uuid: cofre } });
}

/** POST /webhooks/v2/ — cadastra/atualiza a URL do webhook do cofre. Só roda quando alguém pede. */
export async function cadastrarWebhookDoCofre(cfg: ConfigD4Sign, cofre: string, url: string): Promise<Leitura<unknown>> {
  return pedir(cfg, "/webhooks/v2/", { origem: "manual", metodo: "POST", corpo: { type: "cofre", uuid: cofre, url } });
}

/** Como o código do aviso bateu (ou por que não). Só o NOME da variante vai para log; nunca o segredo. */
export interface ConferenciaHmac {
  ok: boolean;
  /** Qual cálculo bateu. A documentação da D4Sign diz "hash SHA256 do UUID junto com a Secret Key MAC" sem dar a
   *  fórmula; o padrão (HMAC-SHA256, hex) é o primeiro, e os outros cobrem as leituras possíveis da frase. */
  variante: "hmac" | "hmac-chave-hex" | "sha256-uuid-chave" | "sha256-chave-uuid" | null;
  /** O que chegou no cabeçalho, para o diagnóstico: "ausente", "formato estranho" ou "sha256=… (64)". */
  recebido: string;
}

/**
 * Confere o cabeçalho Content-Hmac ("sha256=" + 64 hex) contra o UUID do documento e a Secret Key MAC. Toda
 * variante exige o segredo — aceitar mais de uma não abre a porta. Comparação em tempo constante.
 */
export function conferirHmac(uuid: string, cabecalho: string | null, segredo: string): ConferenciaHmac {
  if (!cabecalho) return { ok: false, variante: null, recebido: "ausente" };
  const recebido = cabecalho.trim().replace(/^sha256=/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(recebido)) return { ok: false, variante: null, recebido: `formato estranho (${cabecalho.trim().length} caracteres)` };
  const candidatos: [NonNullable<ConferenciaHmac["variante"]>, string][] = [
    ["hmac", createHmac("sha256", segredo).update(uuid).digest("hex")],
    ...(/^[0-9a-f]+$/i.test(segredo) && segredo.length % 2 === 0
      ? [["hmac-chave-hex", createHmac("sha256", Buffer.from(segredo, "hex")).update(uuid).digest("hex")] as [NonNullable<ConferenciaHmac["variante"]>, string]]
      : []),
    ["sha256-uuid-chave", createHash("sha256").update(uuid + segredo).digest("hex")],
    ["sha256-chave-uuid", createHash("sha256").update(segredo + uuid).digest("hex")],
  ];
  const r = Buffer.from(recebido);
  for (const [variante, esperado] of candidatos) {
    if (timingSafeEqual(r, Buffer.from(esperado))) return { ok: true, variante, recebido: "sha256=… (64)" };
  }
  return { ok: false, variante: null, recebido: "sha256=… (64)" };
}

/** Atalho booleano de conferirHmac. */
export function hmacConfere(uuid: string, cabecalho: string | null, segredo: string): boolean {
  return conferirHmac(uuid, cabecalho, segredo).ok;
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
