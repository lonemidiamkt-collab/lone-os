export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

const GRAPH = "https://graph.facebook.com/v21.0";

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
const norm = (s: string) => (s || "").toLowerCase().replace(/[@\s._-]/g, "");

// GET /api/meta/instagram/discover — lista as Páginas do FB + a conta de Instagram comercial de cada
// (id, @, seguidores) que o token da agência enxerga, e sugere o cliente que casa (pelo @). O admin usa
// pra mapear a conta de IG a cada cliente (grava em clients.ig_business_account_id/fb_page_id).
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const token = await getMetaToken();
  if (!token) return NextResponse.json({ error: "Token Meta não configurado ou expirado. Reconecte o Meta." }, { status: 400 });

  const url = `${GRAPH}/me/accounts?fields=id,name,instagram_business_account{id,username,name,followers_count}&limit=200&access_token=${token}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const err = json?.error;
    const needsReconnect = err?.code === 190 || err?.code === 200 || err?.code === 10;
    return NextResponse.json({ error: err?.message || `HTTP ${res.status}`, code: err?.code, needsReconnect }, { status: 502 });
  }

  const pages = (json.data ?? []).filter((p: { instagram_business_account?: unknown }) => p.instagram_business_account);
  const { data: clients } = await supabaseAdmin.from("clients").select("id, name, nome_fantasia, instagram_user, ig_business_account_id").or("active.is.null,active.eq.true");

  const items = pages.map((p: { id: string; name: string; instagram_business_account: { id: string; username?: string; name?: string; followers_count?: number } }) => {
    const ig = p.instagram_business_account;
    const igUser = ig.username || "";
    // Sugere o cliente pelo @ do instagram (instagram_user) OU pelo nome.
    const match = (clients ?? []).find((c) =>
      (c.instagram_user && norm(c.instagram_user as string) === norm(igUser)) ||
      norm((c.nome_fantasia as string) || (c.name as string)) === norm(ig.name || ""),
    );
    const jaMapeado = (clients ?? []).find((c) => c.ig_business_account_id === ig.id);
    return {
      pageId: p.id, pageName: p.name,
      igId: ig.id, igUsername: igUser, followers: ig.followers_count ?? null,
      sugestaoClienteId: match?.id ?? null,
      sugestaoClienteNome: match ? ((match.nome_fantasia as string) || (match.name as string)) : null,
      jaMapeadoClienteId: jaMapeado?.id ?? null,
    };
  });

  return NextResponse.json({ contas: items, clientes: (clients ?? []).map((c) => ({ id: c.id, nome: (c.nome_fantasia as string) || (c.name as string), igMapeado: c.ig_business_account_id ?? null })) });
}

// POST { clientId, igId, pageId, igUsername } — mapeia a conta de IG ao cliente. igId vazio desmapeia.
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
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
