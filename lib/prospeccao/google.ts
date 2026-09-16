// lib/prospeccao/google.ts — Google Calendar (evento + Meet) e Google Sheets (espelho do CRM).
//
// OAuth2 com a conta do Roberto (Gmail): o refresh token fica CIFRADO em agency_settings
// (`google_oauth`, mesma chave AES do cofre de acessos). Conta de serviço não serve aqui: uma
// conta pessoal do Google não deixa conta de serviço criar link de Meet.
//
// Regra da V2 §9: o link só vai ao prospect DEPOIS que a API devolveu o evento com o Meet.
// Aqui não há "provavelmente criou" — ou temos event_id + meet_url, ou não temos nada.

import { encryptVault, decryptVault } from "@/lib/crypto/vault";
import { lerSetting, gravarSetting } from "./config";

const CHAVE_OAUTH = "google_oauth";
const ESCOPOS = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://painel.lonemidia.com").replace(/\/+$/, "");
}

export function googleConfigurado(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function urlDeAutorizacao(state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
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
  if (!googleConfigurado()) return { ok: false, error: "GOOGLE_CLIENT_ID/SECRET ausentes" };
  const body = new URLSearchParams({
    code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
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
  return { configurado: googleConfigurado(), conectado: !!t, email: t?.email ?? null, conectado_em: t?.conectado_em ?? null };
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
  if (!t || !googleConfigurado()) return null;
  const body = new URLSearchParams({
    refresh_token: t.refresh_token, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, grant_type: "refresh_token",
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

export async function cancelarEvento(eventId: string): Promise<boolean> {
  const cal = await calendarioId();
  const r = await gapi(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: "DELETE" });
  return r.ok || r.status === 404 || r.status === 410;
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
