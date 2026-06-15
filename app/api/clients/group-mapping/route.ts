// app/api/clients/group-mapping/route.ts
// Mapeamento cliente ↔ grupo WhatsApp (admin). GET sugere; POST salva.
// A confirmação é SEMPRE humana — o match é só sugestão (risco de grupo errado).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { listGroups } from "@/lib/whatsapp/evolution";
import { matchGroupForClient, type GroupOption } from "@/lib/whatsapp/group-match";
import { selectActiveMetaClients, clientDisplayName } from "@/lib/traffic/weekly-report";
import { getClientAlertConfigs } from "@/lib/traffic/sync-core";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });

  const groupsRes = await listGroups();
  if (!groupsRes.ok) {
    return NextResponse.json({ error: `Evolution: ${groupsRes.error}` }, { status: 502 });
  }
  const groups: GroupOption[] = (groupsRes.data ?? []).map((g) => ({ id: g.id, subject: g.subject }));

  const clients = await selectActiveMetaClients();
  const configs = await getClientAlertConfigs();
  const rows = clients.map((c) => {
    const name = clientDisplayName(c);
    const suggestion = matchGroupForClient(name, groups);
    const cfg = configs.get(c.id);
    return {
      clientId: c.id,
      clientName: name,
      metaAccountId: c.meta_ad_account_id,
      currentJid: c.whatsapp_group_jid ?? null,
      currentName: c.whatsapp_group_name ?? null,
      suggestion,
      verbaMinima: cfg?.verbaMinima ?? null,
      destino: cfg?.destino ?? "interno",
    };
  });

  return NextResponse.json({
    groups: groups.sort((a, b) => a.subject.localeCompare(b.subject)),
    clients: rows,
    mapped: rows.filter((r) => r.currentJid).length,
    total: rows.length,
  });
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });

  let body: {
    mappings?: Array<{
      clientId: string; groupJid: string | null; groupName?: string | null;
      verbaMinima?: number | null; destino?: string;
    }>;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const mappings = body.mappings ?? [];
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return NextResponse.json({ error: "Nenhum mapeamento enviado" }, { status: 400 });
  }

  let updated = 0;
  const errors: string[] = [];
  for (const m of mappings) {
    if (!m.clientId) continue;
    const jid = (m.groupJid ?? "").trim() || null;
    const { error } = await supabaseAdmin
      .from("clients")
      .update({ whatsapp_group_jid: jid, whatsapp_group_name: jid ? (m.groupName ?? null) : null })
      .eq("id", m.clientId);
    if (error) { errors.push(`${m.clientId}: ${error.message}`); continue; }

    // Config de alerta (verba mínima R$ + destino). Upsert preserva os toggles.
    const verba = m.verbaMinima != null && Number.isFinite(m.verbaMinima) ? m.verbaMinima : null;
    const { error: cErr } = await supabaseAdmin.from("client_alert_config").upsert({
      client_id: m.clientId,
      verba_minima: verba,
      destino: m.destino === "cliente" ? "cliente" : "interno",
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id" });
    if (cErr) errors.push(`${m.clientId} (config): ${cErr.message}`);
    updated++;
  }

  return NextResponse.json({ ok: errors.length === 0, updated, errors });
}
