export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

/**
 * GET /api/platform-updates
 *
 * Retorna lista de updates publicados + flag 'read' por usuario.
 * Usa email da session (cookie). Se não houver session, retorna sem flag de read.
 */
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  const userEmail = user?.email ?? "";

  const { data: updates, error } = await supabaseAdmin
    .from("platform_updates")
    .select("*")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Marca quais o usuario ja leu
  let readIds = new Set<string>();
  if (userEmail && updates) {
    const { data: reads } = await supabaseAdmin
      .from("user_read_updates")
      .select("update_id")
      .eq("user_email", userEmail);
    readIds = new Set((reads ?? []).map((r: { update_id: string }) => r.update_id));
  }

  const enriched = (updates ?? []).map((u: Record<string, unknown>) => ({
    ...u,
    read: readIds.has(u.id as string),
  }));

  return NextResponse.json({
    updates: enriched,
    unreadCount: enriched.filter((u) => !u.read).length,
  });
}

/**
 * POST /api/platform-updates
 *
 * Actions:
 * - create: admin cria novo update (precisa session admin)
 * - mark_read: usuario marca update(s) como lido (precisa session)
 *
 * Auth via session cookie (não aceita admin_email/user_email no body).
 */
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sessão inválida ou ausente" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { action, update_ids, title, description, category, icon } = body as {
    action?: string;
    update_ids?: string[];
    title?: string;
    description?: string;
    category?: string;
    icon?: string;
  };

  if (action === "mark_read") {
    if (!update_ids || !Array.isArray(update_ids) || update_ids.length === 0) {
      return NextResponse.json({ error: "update_ids é obrigatório" }, { status: 400 });
    }
    const rows = update_ids.map((id) => ({ user_email: user.email, update_id: id }));
    const { error } = await supabaseAdmin.from("user_read_updates").upsert(rows, { onConflict: "user_email,update_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, marked: update_ids.length });
  }

  if (action === "create") {
    if (!user.isAdmin) {
      return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
    }
    if (!title?.trim() || !description?.trim()) {
      return NextResponse.json({ error: "title e description sao obrigatorios" }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin.from("platform_updates").insert({
      title: title.trim(),
      description: description.trim(),
      category: category || "feature",
      icon: icon || null,
      created_by: user.email,
    }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, update: data });
  }

  return NextResponse.json({ error: "action invalido (use 'create' ou 'mark_read')" }, { status: 400 });
}
