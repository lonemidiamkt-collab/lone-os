export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

const GRAPH = "https://graph.facebook.com/v21.0";
const FIELDS = "id,name,instagram_business_account%7Bid,username,followers_count%7D";

async function requireAdmin(req: NextRequest) {
  const user = await getServerUser(req);
  return user?.isAdmin ? user : null;
}
async function getMetaToken(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("agency_settings").select("key, value").in("key", ["meta_token", "meta_token_expires_at"]);
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
  const token = map.get("meta_token");
  const exp = map.get("meta_token_expires_at") ? parseInt(map.get("meta_token_expires_at")!, 10) : null;
  if (!token || (exp && exp < Date.now())) return null;
  return token;
}
const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[@\s._-]/g, "");

interface Conta { pageId: string; pageName: string; igId: string; igUsername: string; followers: number | null }
type Page = { id: string; name: string; instagram_business_account?: { id: string; username?: string; name?: string; followers_count?: number } };

async function graphGet(url: string): Promise<{ data?: unknown[]; paging?: { next?: string }; error?: { message?: string; code?: number } }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    return await res.json();
  } catch { return {}; }
}
async function paginate(url: string, maxPages = 4): Promise<Page[]> {
  let out: Page[] = [];
  let next: string | null = url; let n = 0;
  while (next && n < maxPages) {
    const j = await graphGet(next);
    if (j.error) break;
    out = out.concat((j.data ?? []) as Page[]);
    next = j.paging?.next ?? null; n++;
  }
  return out;
}
// concorrência limitada (evita estourar rate limit com 70+ BMs)
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []; let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  });
  await Promise.all(workers);
  return out;
}

// Varre TUDO que o token enxerga: /me/accounts + owned_pages + client_pages de CADA Business Manager.
// Dedup por igId. É o "scanner" completo (a rota antiga só via /me/accounts e perdia as páginas dos BMs).
async function gatherContas(token: string): Promise<{ contas: Map<string, Conta>; erro?: string }> {
  const contas = new Map<string, Conta>();
  const add = (p: Page) => {
    const ig = p.instagram_business_account;
    if (ig?.id && !contas.has(ig.id)) contas.set(ig.id, { pageId: p.id, pageName: p.name, igId: ig.id, igUsername: ig.username || "", followers: ig.followers_count ?? null });
  };
  // 1) páginas que o usuário administra direto
  const meResp = await graphGet(`${GRAPH}/me/accounts?fields=${FIELDS}&limit=100&access_token=${token}`);
  if (meResp.error) {
    const c = meResp.error.code;
    if (c === 190 || c === 200 || c === 10) return { contas, erro: "reconnect" };
  }
  (await paginate(`${GRAPH}/me/accounts?fields=${FIELDS}&limit=100&access_token=${token}`)).forEach(add);
  // 2) todos os Business Managers → owned_pages + client_pages
  const bms = await paginate(`${GRAPH}/me/businesses?fields=id&limit=100&access_token=${token}`, 3);
  await mapLimit(bms, 6, async (b) => {
    for (const edge of ["owned_pages", "client_pages"] as const) {
      (await paginate(`${GRAPH}/${b.id}/${edge}?fields=${FIELDS}&limit=100&access_token=${token}`, 2)).forEach(add);
    }
  });
  return { contas };
}

// GET /api/meta/instagram/discover — SCANNER completo: lista todas as contas de IG que o token enxerga
// (via /me/accounts + todos os BMs), com sugestão do cliente que casa. bmScan=false só usa /me/accounts.
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const token = await getMetaToken();
  if (!token) return NextResponse.json({ error: "Token Meta não configurado ou expirado. Reconecte o Meta.", needsReconnect: true }, { status: 400 });

  const { contas: contasMap, erro } = await gatherContas(token);
  if (erro === "reconnect") return NextResponse.json({ error: "O token do Meta expirou ou perdeu acesso. Reconecte o Meta.", needsReconnect: true }, { status: 502 });

  const { data: clients } = await supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, instagram_user, ig_business_account_id, ig_username_cache")
    .or("active.is.null,active.eq.true");

  const contas = [...contasMap.values()].sort((a, b) => a.igUsername.localeCompare(b.igUsername));
  const items = contas.map((ig) => {
    const match = (clients ?? []).find((c) =>
      (c.instagram_user && norm(c.instagram_user as string) === norm(ig.igUsername)) ||
      norm((c.nome_fantasia as string) || (c.name as string)) === norm(ig.pageName),
    );
    const jaMapeado = (clients ?? []).find((c) => c.ig_business_account_id === ig.igId);
    return {
      pageId: ig.pageId, pageName: ig.pageName, igId: ig.igId, igUsername: ig.igUsername, followers: ig.followers,
      sugestaoClienteId: match?.id ?? null,
      sugestaoClienteNome: match ? ((match.nome_fantasia as string) || (match.name as string)) : null,
      jaMapeadoClienteId: jaMapeado?.id ?? null,
    };
  });

  return NextResponse.json({
    total: items.length,
    contas: items,
    clientes: (clients ?? []).map((c) => ({
      id: c.id, nome: (c.nome_fantasia as string) || (c.name as string),
      igMapeado: c.ig_business_account_id ?? null, cache: c.ig_username_cache ?? null,
      handle: c.instagram_user ?? null,
    })),
  });
}

// POST — mapeia. Duas formas:
//   { clientId, igId, pageId, igUsername }  → mapeia UM cliente (igId vazio desmapeia).
//   { action: "automap" }                   → mapeia em lote todos os clientes cujo @ (instagram_user)
//                                             bate EXATAMENTE com uma conta visível. Seguro (só @ igual).
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  if (body?.action === "automap") {
    const token = await getMetaToken();
    if (!token) return NextResponse.json({ error: "Token Meta não configurado.", needsReconnect: true }, { status: 400 });
    const { contas: contasMap, erro } = await gatherContas(token);
    if (erro === "reconnect") return NextResponse.json({ error: "Token expirado.", needsReconnect: true }, { status: 502 });
    const porHandle = new Map<string, Conta>();
    for (const c of contasMap.values()) { const k = norm(c.igUsername); if (k && !porHandle.has(k)) porHandle.set(k, c); }

    const { data: clients } = await supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, instagram_user, ig_business_account_id")
      .or("active.is.null,active.eq.true");

    const mapeados: { cliente: string; igUsername: string }[] = [];
    for (const c of clients ?? []) {
      const handle = c.instagram_user as string | null;
      if (!handle) continue;                                   // sem @ cadastrado → não arrisca
      const conta = porHandle.get(norm(handle));
      if (!conta) continue;                                    // @ não está visível pro token
      if (c.ig_business_account_id === conta.igId) continue;   // já mapeado certo
      const { error } = await supabaseAdmin.from("clients").update({
        ig_business_account_id: conta.igId, fb_page_id: conta.pageId, ig_username_cache: conta.igUsername,
      }).eq("id", c.id);
      if (!error) mapeados.push({ cliente: (c.nome_fantasia as string) || (c.name as string), igUsername: conta.igUsername });
    }
    return NextResponse.json({ ok: true, mapeados, total: mapeados.length });
  }

  const clientId = body?.clientId as string;
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });
  const { error } = await supabaseAdmin.from("clients").update({
    ig_business_account_id: body?.igId || null,
    fb_page_id: body?.pageId || null,
    ig_username_cache: body?.igUsername || null,
  }).eq("id", clientId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
