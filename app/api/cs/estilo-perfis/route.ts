export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// Admin: revisar/editar os PERFIS DE ESTILO gerados (agency_settings key cs_style:team / cs_style:<id>)
// antes de ligar no agente (passo 3). GET lista; POST save edita; POST generate roda o cs-estilo agora.
async function requireAdmin(req: NextRequest) {
  const user = await getServerUser(req);
  return user?.isAdmin ? user : null;
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { data: rows } = await supabaseAdmin
    .from("agency_settings").select("key, value").like("key", "cs_style:%");

  const map = new Map((rows ?? []).map((r) => [r.key as string, r.value as string]));
  const team = map.get("cs_style:team") ?? null;

  // Perfis por cliente: casa cs_style:<uuid> com o nome do cliente.
  const clientIds = [...map.keys()].filter((k) => k !== "cs_style:team").map((k) => k.replace("cs_style:", ""));
  const nomes = new Map<string, string>();
  if (clientIds.length) {
    const { data: cs } = await supabaseAdmin.from("clients").select("id, name, nome_fantasia").in("id", clientIds);
    (cs ?? []).forEach((c) => nomes.set(c.id as string, (c.nome_fantasia as string) || (c.name as string)));
  }
  const clients = clientIds.map((id) => ({ clientId: id, name: nomes.get(id) || id, estilo: map.get(`cs_style:${id}`) ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ team, clients });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const action = body?.action as string;

  if (action === "save") {
    const key = body?.key as string;
    const value = (body?.value as string) ?? "";
    if (!key?.startsWith("cs_style:")) return NextResponse.json({ error: "key inválida" }, { status: 400 });
    // Marca (ou tira) o selo de REVISADO — o cron cs-estilo não sobrescreve perfil revisado à mão.
    const reviewedKey = key.replace("cs_style:", "cs_style_reviewed:");
    if (!value.trim()) {
      await supabaseAdmin.from("agency_settings").delete().eq("key", key);
      await supabaseAdmin.from("agency_settings").delete().eq("key", reviewedKey);
    } else {
      await supabaseAdmin.from("agency_settings").upsert({ key, value: value.trim() }, { onConflict: "key" });
      await supabaseAdmin.from("agency_settings").upsert({ key: reviewedKey, value: new Date().toISOString() }, { onConflict: "key" });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "generate") {
    // Roda o cron cs-estilo agora (server-side, com o CRON_SECRET). ?dry opcional.
    const dry = body?.dry ? "?dry=1" : "";
    try {
      const res = await fetch(`http://localhost:3000/api/system/cs-estilo${dry}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
      });
      const d = await res.json().catch(() => ({}));
      return NextResponse.json(d, { status: res.ok ? 200 : 502 });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "action inválida" }, { status: 400 });
}
