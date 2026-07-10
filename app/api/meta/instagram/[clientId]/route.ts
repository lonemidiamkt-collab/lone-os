export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

const GRAPH = "https://graph.facebook.com/v21.0";

async function getMetaToken(): Promise<string | null> {
  const { data } = await supabaseAdmin.from("agency_settings").select("key, value").in("key", ["meta_token", "meta_token_expires_at"]);
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
  const token = map.get("meta_token");
  const exp = map.get("meta_token_expires_at") ? parseInt(map.get("meta_token_expires_at")!, 10) : null;
  if (!token || (exp && exp < Date.now())) return null;
  return token;
}

// GET /api/meta/instagram/[clientId] — métricas ORGÂNICAS do Instagram do cliente: seguidores + alcance
// da conta + últimos posts com curtidas/comentários/alcance/views. Requer o IG mapeado (discover) e o
// token com escopo instagram_manage_insights. Auth: usuário logado OU ?token=<portal_token> (pro portal).
export async function GET(req: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const portalToken = req.nextUrl.searchParams.get("token");

  // Autoriza: staff logado, OU token público do portal daquele cliente.
  let ok = false;
  if (portalToken) {
    const { data: c } = await supabaseAdmin.from("clients").select("id, public_report_enabled, public_report_token_revoked_at").eq("public_report_token", portalToken).eq("id", clientId).maybeSingle();
    ok = !!c && !!c.public_report_enabled && !c.public_report_token_revoked_at;
  } else {
    ok = !!(await getServerUser(req));
  }
  if (!ok) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { data: cli } = await supabaseAdmin.from("clients").select("ig_business_account_id, ig_username_cache").eq("id", clientId).maybeSingle();
  const igId = cli?.ig_business_account_id as string | null;
  if (!igId) return NextResponse.json({ error: "Instagram não mapeado pra este cliente", mapped: false }, { status: 404 });

  const token = await getMetaToken();
  if (!token) return NextResponse.json({ error: "Token Meta não configurado ou expirado" }, { status: 400 });

  // Conta: seguidores + nº de posts.
  const acctRes = await fetch(`${GRAPH}/${igId}?fields=username,followers_count,media_count&access_token=${token}`);
  const acct = await acctRes.json().catch(() => ({}));
  if (!acctRes.ok || acct.error) {
    const err = acct?.error;
    const needsReconnect = err?.code === 190 || err?.code === 200 || err?.code === 10;
    return NextResponse.json({ error: err?.message || `HTTP ${acctRes.status}`, code: err?.code, needsReconnect }, { status: 502 });
  }

  // Últimos posts (curtidas/comentários são campos diretos).
  const mediaRes = await fetch(`${GRAPH}/${igId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=12&access_token=${token}`);
  const mediaJson = await mediaRes.json().catch(() => ({}));
  const media = (mediaJson.data ?? []) as Array<Record<string, unknown>>;

  // Alcance/views por post (insights) — best-effort por mídia (métrica varia por tipo).
  const posts = await Promise.all(media.map(async (m) => {
    const tipo = (m.media_type as string) || "";
    const metricas = tipo === "VIDEO" || tipo === "REELS" ? "reach,saved,video_views" : "reach,saved";
    let reach: number | null = null, views: number | null = null, saved: number | null = null;
    try {
      const ir = await fetch(`${GRAPH}/${m.id}/insights?metric=${metricas}&access_token=${token}`);
      const ij = await ir.json().catch(() => ({}));
      for (const row of (ij.data ?? []) as Array<{ name: string; values: { value: number }[] }>) {
        const v = row.values?.[0]?.value ?? null;
        if (row.name === "reach") reach = v;
        else if (row.name === "video_views") views = v;
        else if (row.name === "saved") saved = v;
      }
    } catch { /* insights indisponível pra essa mídia */ }
    return {
      id: m.id as string,
      tipo,
      thumb: (m.thumbnail_url as string) || (m.media_url as string) || null,
      permalink: (m.permalink as string) || null,
      legenda: ((m.caption as string) || "").slice(0, 120),
      data: (m.timestamp as string) || null,
      curtidas: (m.like_count as number) ?? null,
      comentarios: (m.comments_count as number) ?? null,
      alcance: reach, views, salvamentos: saved,
    };
  }));

  return NextResponse.json({
    mapped: true,
    conta: { username: acct.username as string, seguidores: acct.followers_count as number ?? null, posts: acct.media_count as number ?? null },
    posts,
  });
}
