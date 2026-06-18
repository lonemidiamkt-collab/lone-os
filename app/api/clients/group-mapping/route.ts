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
import { getClientAlertConfigs, getAlertSettings } from "@/lib/traffic/sync-core";
import { DEFAULT_CLIENT_ALERT_CONFIG } from "@/lib/budgets/operational-alerts";

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });

  // Grupos são best-effort: se a Evolution estiver lenta/offline, a tela ainda
  // mostra os clientes (com o grupo já salvo) — só o dropdown fica limitado.
  const groupsRes = await listGroups();
  const groups: GroupOption[] = groupsRes.ok ? (groupsRes.data ?? []).map((g) => ({ id: g.id, subject: g.subject })) : [];
  const groupsError = groupsRes.ok ? null : groupsRes.error;

  const clients = await selectActiveMetaClients();
  const configs = await getClientAlertConfigs();
  const settings = await getAlertSettings();
  // Verba mensal por conta (Controle de Investimento) — p/ sincronizar o limite na tela.
  const { data: accts } = await supabaseAdmin.from("ad_accounts").select("meta_account_id, monthly_budget");
  const budgetByAccount = new Map(
    (accts ?? []).map((a: { meta_account_id: string; monthly_budget: number | null }) => [a.meta_account_id, a.monthly_budget] as const),
  );
  const rows = clients.map((c) => {
    const name = clientDisplayName(c);
    const suggestion = matchGroupForClient(name, groups);
    const cfg = configs.get(c.id) ?? DEFAULT_CLIENT_ALERT_CONFIG;
    return {
      clientId: c.id,
      clientName: name,
      metaAccountId: c.meta_ad_account_id,
      currentJid: c.whatsapp_group_jid ?? null,
      currentName: c.whatsapp_group_name ?? null,
      suggestion,
      monthlyBudget: budgetByAccount.get(c.meta_ad_account_id ?? "") ?? null,
      verbaMinima: cfg.verbaMinima ?? null,
      destino: cfg.destino,
      alerts: {
        verbaBaixa: cfg.alertVerbaBaixa,
        verbaZerada: cfg.alertVerbaZerada,
        erroConta: cfg.alertErroConta,
        semGasto: cfg.alertSemGasto,
        campanhaParada: cfg.alertCampanhaParada,
        metaErro: cfg.alertMetaErro,
      },
    };
  });

  return NextResponse.json({
    groups: groups.sort((a, b) => a.subject.localeCompare(b.subject)),
    groupsError,
    clients: rows,
    warningPct: settings.warningPct,
    criticalPct: settings.criticalPct,
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
      alerts?: {
        verbaBaixa?: boolean; verbaZerada?: boolean; erroConta?: boolean;
        semGasto?: boolean; campanhaParada?: boolean; metaErro?: boolean;
      };
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
    const a = m.alerts;
    const { error: cErr } = await supabaseAdmin.from("client_alert_config").upsert({
      client_id: m.clientId,
      verba_minima: verba,
      destino: m.destino === "cliente" ? "cliente" : "interno",
      ...(a ? {
        alert_verba_baixa: a.verbaBaixa !== false,
        alert_verba_zerada: a.verbaZerada !== false,
        alert_erro_conta: a.erroConta !== false,
        alert_sem_gasto: a.semGasto !== false,
        alert_campanha_parada: a.campanhaParada === true,
        alert_meta_erro: a.metaErro !== false,
      } : {}),
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id" });
    if (cErr) errors.push(`${m.clientId} (config): ${cErr.message}`);
    updated++;
  }

  return NextResponse.json({ ok: errors.length === 0, updated, errors });
}
