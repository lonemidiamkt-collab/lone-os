// lib/prospeccao/google.ts — Google Calendar (evento + Meet) e Google Sheets (espelho do CRM).
// Nasceu no piloto da prospecção; desde out/2026 é a agenda do COMERCIAL (reuniões de venda com Meet).
//
// OAuth2 com a conta Google da Lone (Gmail): o refresh token fica CIFRADO em agency_settings
// (`google_oauth`, mesma chave AES do cofre de acessos). Conta de serviço não serve aqui: uma
// conta pessoal do Google não deixa conta de serviço criar link de Meet.
//
// A credencial do app (Client ID + segredo) vem do ambiente (GOOGLE_CLIENT_ID/SECRET) ou, se faltar,
// da tela do Comercial (`google_client`, cifrada) — assim o Roberto cola o segredo sem mexer no servidor.
// ATENÇÃO: o app no Google Cloud tem de estar PUBLICADO ("Em produção"); em "Teste", o Google faz o
// refresh token expirar em 7 dias e a agenda "desconecta sozinha".
//
// Regra da V2 §9: o link só vai ao prospect DEPOIS que a API devolveu o evento com o Meet.
// Aqui não há "provavelmente criou" — ou temos event_id + meet_url, ou não temos nada.

import { encryptVault, decryptVault } from "@/lib/crypto/vault";
import { lerSetting, gravarSetting } from "./config";
import { lerTesteNoGoogle } from "@/lib/google/credencial";

const CHAVE_OAUTH = "google_oauth";
const CHAVE_CLIENTE = "google_client";
// Só agenda + e-mail (out/2026): o espelho em planilha era do piloto SDR, desligado. Pedir planilha e Drive
// deixava a tela de autorização mais assustadora sem uso nenhum.
const ESCOPOS = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

/** Client ID + segredo do app do Google: do ambiente, ou colados na tela do Comercial (cifrados). */
async function credenciais(): Promise<{ id: string; secret: string } | null> {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) return { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET };
  const raw = await lerSetting(CHAVE_CLIENTE);
  if (!raw) return null;
  try {
    const c = JSON.parse(decryptVault(raw) ?? "") as { id?: string; secret?: string };
    return c.id && c.secret ? { id: c.id, secret: c.secret } : null;
  } catch { return null; }
}

/** Testa o par no Google com um código falso (lib/google/credencial.ts explica a leitura). Nada é gravado. */
export async function conferirNoGoogle(id: string, secret: string): Promise<ReturnType<typeof lerTesteNoGoogle>> {
  try {
    const body = new URLSearchParams({ code: "teste-de-credencial", client_id: id, client_secret: secret, redirect_uri: redirectUri(), grant_type: "authorization_code" });
    const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(10_000) });
    return lerTesteNoGoogle(await res.json().catch(() => null));
  } catch { return "indefinido"; }
}

export async function gravarCredenciais(id: string, secret: string): Promise<void> {
  await gravarSetting(CHAVE_CLIENTE, encryptVault(JSON.stringify({ id: id.trim(), secret: secret.trim() })));
  cacheAccess = null;
}

/** De onde vem a credencial (para a tela dizer). */
export async function origemDasCredenciais(): Promise<"ambiente" | "tela" | null> {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) return "ambiente";
  return (await credenciais()) ? "tela" : null;
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://painel.lonemidia.com").replace(/\/+$/, "");
}

export async function googleConfigurado(): Promise<boolean> {
  return !!(await credenciais());
}

export const redirectUri = () => `${appUrl()}/api/auth/google/callback`;

export async function urlDeAutorizacao(state: string): Promise<string | null> {
  const c = await credenciais();
  if (!c) return null;
  const q = new URLSearchParams({
    client_id: c.id,
    redirect_uri: `${appUrl()}/api/auth/google/callback`,
    response_type: "code",
    scope: ESCOPOS,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

interface Tokens { refresh_token: string; email?: string | null; conectado_em: string }

export async function trocarCodigoPorTokens(code: string): Promise<{ ok: boolean; email?: string | null; error?: string }> {
  const c = await credenciais();
  if (!c) return { ok: false, error: "credencial do Google ausente" };
  const body = new URLSearchParams({
    code, client_id: c.id, client_secret: c.secret,
    redirect_uri: `${appUrl()}/api/auth/google/callback`, grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(15_000) });
  const j = await res.json().catch(() => null) as { refresh_token?: string; access_token?: string; error_description?: string; error?: string } | null;
  if (!res.ok || !j?.refresh_token) return { ok: false, error: j?.error_description || j?.error || `HTTP ${res.status} (sem refresh_token — revogue o acesso em myaccount.google.com e conecte de novo)` };
  let email: string | null = null;
  try {
    const me = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${j.access_token}` }, signal: AbortSignal.timeout(8_000) });
    email = ((await me.json().catch(() => null)) as { email?: string } | null)?.email ?? null;
  } catch { /* e-mail é só informativo */ }
  const t: Tokens = { refresh_token: j.refresh_token, email, conectado_em: new Date().toISOString() };
  await gravarSetting(CHAVE_OAUTH, encryptVault(JSON.stringify(t)));
  return { ok: true, email };
}

export async function desconectarGoogle(): Promise<void> { await gravarSetting(CHAVE_OAUTH, null); }

export async function estadoGoogle(): Promise<{ configurado: boolean; conectado: boolean; email?: string | null; conectado_em?: string | null }> {
  const t = await lerTokens();
  return { configurado: await googleConfigurado(), conectado: !!t, email: t?.email ?? null, conectado_em: t?.conectado_em ?? null };
}

async function lerTokens(): Promise<Tokens | null> {
  const raw = await lerSetting(CHAVE_OAUTH);
  if (!raw) return null;
  try { return JSON.parse(decryptVault(raw) ?? "") as Tokens; } catch { return null; }
}

let cacheAccess: { token: string; expira: number } | null = null;

export async function accessToken(): Promise<string | null> {
  if (cacheAccess && cacheAccess.expira > Date.now() + 30_000) return cacheAccess.token;
  const t = await lerTokens();
  const c = await credenciais();
  if (!t || !c) return null;
  const body = new URLSearchParams({
    refresh_token: t.refresh_token, client_id: c.id, client_secret: c.secret, grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(15_000) });
  const j = await res.json().catch(() => null) as { access_token?: string; expires_in?: number; error?: string } | null;
  if (!res.ok || !j?.access_token) { console.error("[google] refresh falhou:", j?.error ?? res.status); return null; }
  cacheAccess = { token: j.access_token, expira: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

async function gapi<T>(url: string, init: RequestInit = {}): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
  const tok = await accessToken();
  if (!tok) return { ok: false, error: "Google não conectado" };
  try {
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) });
    const txt = await res.text().catch(() => "");
    let j: unknown = null;
    try { j = txt ? JSON.parse(txt) : null; } catch { /* corpo não-JSON */ }
    if (!res.ok) {
      const msg = (j as { error?: { message?: string } } | null)?.error?.message ?? txt.slice(0, 200);
      return { ok: false, error: `Google ${res.status}: ${msg}`, status: res.status };
    }
    return { ok: true, data: j as T, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "erro de conexão" };
  }
}

// ─── Calendar ────────────────────────────────────────────────────────────────

export async function calendarioId(): Promise<string> {
  return (await lerSetting("prospect_calendar_id")) || "primary";
}

/** Faixas ocupadas do calendário entre `de` e `ate` (freebusy). Erro → lista vazia + aviso. */
export async function ocupadosNoCalendario(deIso: string, ateIso: string): Promise<{ ok: boolean; faixas: { inicio: string; fim: string }[]; error?: string }> {
  const cal = await calendarioId();
  const r = await gapi<{ calendars?: Record<string, { busy?: { start: string; end: string }[] }> }>("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST", body: JSON.stringify({ timeMin: deIso, timeMax: ateIso, timeZone: "America/Sao_Paulo", items: [{ id: cal }] }),
  });
  if (!r.ok) return { ok: false, faixas: [], error: r.error };
  const busy = r.data?.calendars?.[cal]?.busy ?? Object.values(r.data?.calendars ?? {})[0]?.busy ?? [];
  return { ok: true, faixas: busy.map((b) => ({ inicio: b.start, fim: b.end })) };
}

export interface EventoParams {
  titulo: string;
  descricao: string;
  inicioIso: string;
  fimIso: string;
  local?: string | null;
  convidados?: string[];
  meet: boolean;
}

export interface EventoCriado { event_id: string; meet_url: string | null; html_link: string | null }

/** Cria o evento. Com `meet: true` pede a conferência e só devolve ok se o link veio. */
export async function criarEvento(e: EventoParams): Promise<{ ok: boolean; evento?: EventoCriado; error?: string }> {
  const cal = await calendarioId();
  const body: Record<string, unknown> = {
    summary: e.titulo, description: e.descricao,
    start: { dateTime: e.inicioIso, timeZone: "America/Sao_Paulo" },
    end: { dateTime: e.fimIso, timeZone: "America/Sao_Paulo" },
    ...(e.local ? { location: e.local } : {}),
    ...(e.convidados?.length ? { attendees: e.convidados.map((email) => ({ email })) } : {}),
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 60 }, { method: "popup", minutes: 1440 }] },
  };
  if (e.meet) {
    body.conferenceData = { createRequest: { requestId: `lone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, conferenceSolutionKey: { type: "hangoutsMeet" } } };
  }
  const q = e.meet ? "?conferenceDataVersion=1&sendUpdates=all" : "?sendUpdates=all";
  const r = await gapi<{ id?: string; hangoutLink?: string; htmlLink?: string; conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] } }>(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events${q}`, { method: "POST", body: JSON.stringify(body) },
  );
  if (!r.ok || !r.data?.id) return { ok: false, error: r.error ?? "evento sem id" };
  const meet = r.data.hangoutLink ?? r.data.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null;
  if (e.meet && !meet) {
    // Evento existe mas sem Meet: não deixamos um evento "meio criado" pra trás.
    await gapi(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(r.data.id)}`, { method: "DELETE" }).catch(() => null);
    return { ok: false, error: "Google criou o evento sem link de Meet — desfeito" };
  }
  return { ok: true, evento: { event_id: r.data.id, meet_url: meet, html_link: r.data.htmlLink ?? null } };
}

/** Muda horário/título/descrição/local de um evento; o Google avisa os convidados. */
export async function atualizarEvento(eventId: string, p: { inicioIso?: string; fimIso?: string; titulo?: string; descricao?: string; local?: string | null }): Promise<{ ok: boolean; error?: string }> {
  const cal = await calendarioId();
  const body: Record<string, unknown> = {
    ...(p.inicioIso ? { start: { dateTime: p.inicioIso, timeZone: "America/Sao_Paulo" } } : {}),
    ...(p.fimIso ? { end: { dateTime: p.fimIso, timeZone: "America/Sao_Paulo" } } : {}),
    ...(p.titulo ? { summary: p.titulo } : {}),
    ...(p.descricao !== undefined ? { description: p.descricao } : {}),
    ...(p.local !== undefined ? { location: p.local ?? "" } : {}),
  };
  const r = await gapi(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: "PATCH", body: JSON.stringify(body) });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export interface EventoDaAgenda { id: string; titulo: string; inicio: string; fim: string; diaInteiro: boolean; link: string | null }

/** Compromissos do Google Agenda entre duas datas (para a Agenda do Comercial mostrar o dia inteiro). */
export async function listarEventos(deIso: string, ateIso: string): Promise<{ ok: boolean; eventos: EventoDaAgenda[]; error?: string }> {
  const cal = await calendarioId();
  const q = new URLSearchParams({ timeMin: deIso, timeMax: ateIso, singleEvents: "true", orderBy: "startTime", maxResults: "250", timeZone: "America/Sao_Paulo" });
  const r = await gapi<{ items?: { id: string; summary?: string; status?: string; htmlLink?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }[] }>(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events?${q.toString()}`,
  );
  if (!r.ok) return { ok: false, eventos: [], error: r.error };
  const eventos = (r.data?.items ?? []).filter((e) => e.status !== "cancelled").map((e) => ({
    id: e.id, titulo: e.summary || "(sem título)", diaInteiro: !e.start?.dateTime,
    inicio: e.start?.dateTime ?? `${e.start?.date}T00:00:00-03:00`, fim: e.end?.dateTime ?? `${e.end?.date}T00:00:00-03:00`, link: e.htmlLink ?? null,
  }));
  return { ok: true, eventos };
}

/**
 * Cancela o evento (sendUpdates=all: o Google avisa os convidados). Evento já apagado (404/410) conta
 * como cancelado. Devolve o motivo da falha — quem cancela uma reunião precisa saber que NÃO cancelou
 * (21/10/2026: a falha era engolida e o lead seguia com convite e Meet valendo).
 */
export async function cancelarEventoComMotivo(eventId: string): Promise<{ ok: boolean; error?: string }> {
  const cal = await calendarioId();
  const r = await gapi(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: "DELETE" });
  if (r.ok || r.status === 404 || r.status === 410) return { ok: true };
  return { ok: false, error: r.error ?? "sem resposta do Google" };
}

export async function cancelarEvento(eventId: string): Promise<boolean> {
  return (await cancelarEventoComMotivo(eventId)).ok;
}

// ─── Sheets ──────────────────────────────────────────────────────────────────

export async function planilhaId(): Promise<string | null> { return lerSetting("prospect_sheet_id"); }

/** Cria a planilha "CRM — Prospecção Lone Mídia" com as 4 abas e guarda o id. */
export async function criarPlanilha(): Promise<{ ok: boolean; id?: string; url?: string; error?: string }> {
  const r = await gapi<{ spreadsheetId?: string; spreadsheetUrl?: string }>("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    body: JSON.stringify({
      properties: { title: "CRM — Prospecção Lone Mídia", locale: "pt_BR", timeZone: "America/Sao_Paulo" },
      sheets: ["Prospects", "Interações", "Reuniões", "Dashboard"].map((title) => ({ properties: { title } })),
    }),
  });
  if (!r.ok || !r.data?.spreadsheetId) return { ok: false, error: r.error ?? "sem id" };
  await gravarSetting("prospect_sheet_id", r.data.spreadsheetId);
  return { ok: true, id: r.data.spreadsheetId, url: r.data.spreadsheetUrl };
}

/** Reescreve uma aba inteira (limpa + escreve). Planilha é espelho: nunca lemos de volta. */
export async function escreverAba(sheetId: string, aba: string, linhas: (string | number | null)[][]): Promise<{ ok: boolean; error?: string }> {
  // Nome de aba com acento/espaço precisa de aspas simples no A1 ("'Interações'!A1").
  const nome = `'${aba.replace(/'/g, "''")}'`;
  const range = encodeURIComponent(`${nome}!A1:ZZ`);
  const clear = await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:clear`, { method: "POST", body: "{}" });
  if (!clear.ok) return { ok: false, error: clear.error };
  const r = await gapi(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(`${nome}!A1`)}?valueInputOption=RAW`, {
    method: "PUT", body: JSON.stringify({ range: `${nome}!A1`, majorDimension: "ROWS", values: linhas.map((l) => l.map((v) => (v === null || v === undefined ? "" : v))) }),
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export const urlDaPlanilha = (id: string) => `https://docs.google.com/spreadsheets/d/${id}`;
