export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// Admin whitelist — mantido em sync com outras rotas
const ADMIN_EMAILS = new Set([
  "lonemidiamkt@gmail.com",
  "lucas@lonemidia.com",
  "julio@lonemidia.com",
]);

/**
 * GET /api/platform-updates?user_email=<email>
 *
 * Retorna lista de updates publicados + flag 'read' por usuario.
 */
export async function GET(req: NextRequest) {
  const userEmail = (req.nextUrl.searchParams.get("user_email") || "").trim().toLowerCase();

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
 * - create: admin cria novo update
 * - mark_read: usuario marca update(s) como lido
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action, admin_email, user_email, update_ids, title, description, category, icon } = body as {
    action?: string;
    admin_email?: string;
    user_email?: string;
    update_ids?: string[];
    title?: string;
    description?: string;
    category?: string;
    icon?: string;
  };

  if (action === "mark_read") {
    if (!user_email || !update_ids || !Array.isArray(update_ids) || update_ids.length === 0) {
      return NextResponse.json({ error: "user_email e update_ids sao obrigatorios" }, { status: 400 });
    }
    const rows = update_ids.map((id) => ({ user_email: user_email.toLowerCase(), update_id: id }));
    const { error } = await supabaseAdmin.from("user_read_updates").upsert(rows, { onConflict: "user_email,update_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, marked: update_ids.length });
  }

  if (action === "create") {
    const adminEmail = (admin_email || "").trim().toLowerCase();
    if (!adminEmail || !ADMIN_EMAILS.has(adminEmail)) {
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
      created_by: adminEmail,
    }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, update: data });
  }

  return NextResponse.json({ error: "action invalido (use 'create' ou 'mark_read')" }, { status: 400 });
}
