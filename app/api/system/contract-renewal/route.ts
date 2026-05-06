export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * POST /api/system/contract-renewal
 *
 * Cron endpoint. Deve ser chamado uma vez por dia (ex: via cron no VPS).
 * Varre contratos ativos chegando perto do vencimento e, pra cada um:
 *   1. Se esta a <= 30 dias do fim E ainda nao existe rascunho de renovacao:
 *      - Cria um novo registro em `contracts` como DRAFT
 *        (version+1, novas datas, valor = renewal_value se configurado senao mantem)
 *        marcado como renewal_draft_of = contrato atual
 *      - Cria notificacao pros admins
 *      - Registra timeline entry
 *   2. Se esta a <= 7 dias do fim: cria notificacao URGENTE adicional.
 *
 * Idempotente: pode rodar varias vezes sem duplicar drafts.
 */

const DAYS_AHEAD_CREATE_DRAFT = 30;
const DAYS_AHEAD_URGENT = 7;

function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}

export async function POST(req: NextRequest) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + DAYS_AHEAD_CREATE_DRAFT);
    const cutoffIso = cutoffDate.toISOString().slice(0, 10);

    // 1. Busca contratos ativos terminando ate `cutoff`
    const { data: expiring, error } = await supabaseAdmin
      .from("contracts")
      .select("*, clients(id, name, nome_fantasia, contact_name)")
      .eq("status", "active")
      .lte("end_date", cutoffIso)
      .gte("end_date", today)
      .order("end_date");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const drafts_created: string[] = [];
    const alerts_sent: string[] = [];
    const skipped: string[] = [];

    for (const c of (expiring ?? []) as Record<string, unknown>[] ) {
      const clientId = c.client_id as string;
      const contractId = c.id as string;
      const endDate = c.end_date as string;
      const daysLeft = daysBetween(today, endDate);
      const clientRow = c.clients as { name: string; nome_fantasia: string | null; contact_name: string | null } | null;
      const clientName = clientRow?.nome_fantasia || clientRow?.name || "Cliente";

      // 2. Checa se ja existe rascunho de renovacao pra este contrato
      const { data: existingDraft } = await supabaseAdmin
        .from("contracts")
        .select("id")
        .eq("renewal_draft_of", contractId)
        .limit(1);

      const hasDraft = existingDraft && existingDraft.length > 0;

      if (!hasDraft) {
        // 3. Cria rascunho de renovacao
        const newValue = c.renewal_value ? Number(c.renewal_value) : Number(c.monthly_value);
        const duration = Number(c.duration_months || 6);
        const newStart = endDate; // comeca no mesmo dia que o atual termina
        const newEnd = addMonths(newStart, duration);

        // Pega versao atual maxima do cliente
        const { data: allContracts } = await supabaseAdmin
          .from("contracts")
          .select("version")
          .eq("client_id", clientId)
          .order("version", { ascending: false })
          .limit(1);
        const nextVersion = allContracts && allContracts.length > 0 ? Number(allContracts[0].version) + 1 : 2;

        const { data: insertedDraft, error: insErr } = await supabaseAdmin.from("contracts").insert({
          client_id: clientId,
          version: nextVersion,
          service_type: c.service_type,
          monthly_value: newValue,
          start_date: newStart,
          end_date: newEnd,
          duration_months: duration,
          status: "draft",
          payment_day: c.payment_day || 10,
          previous_contract_id: contractId,
          renewal_draft_of: contractId,
          has_renewal: false,
          generated_by: "Sistema (renovacao automatica)",
        }).select("id").maybeSingle();

        if (insErr || !insertedDraft) {
          console.error("[contract-renewal] Insert failed:", insErr);
          skipped.push(clientName);
          continue;
        }

        drafts_created.push(clientName);

        // Timeline
        await supabaseAdmin.from("timeline_entries").insert({
          client_id: clientId,
          type: "manual",
          actor: "Sistema",
          description: `Rascunho de renovacao V${nextVersion} gerado automaticamente — vencimento em ${daysLeft} dias. Aguardando envio manual.`,
          timestamp: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        });

        // Notificacao
        await supabaseAdmin.from("notifications").insert({
          type: "system",
          title: `Renovacao pendente — ${clientName}`,
          body: `Contrato vence em ${daysLeft} dias. Rascunho V${nextVersion} ja criado, revise e envie.`,
          client_id: clientId,
        });
      }

      // 4. Alerta urgente se < 7 dias (sempre dispara, mesmo com draft ja existente)
      if (daysLeft <= DAYS_AHEAD_URGENT) {
        await supabaseAdmin.from("notifications").insert({
          type: "system",
          title: `🚨 URGENTE: contrato vence em ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"}`,
          body: `${clientName} — envie o contrato de renovacao o quanto antes.`,
          client_id: clientId,
        });
        alerts_sent.push(clientName);
      }
    }

    return NextResponse.json({
      success: true,
      checked: expiring?.length ?? 0,
      drafts_created,
      urgent_alerts: alerts_sent,
      skipped,
    });
  } catch (err) {
    console.error("[contract-renewal] unexpected:", err);
    return NextResponse.json({
      error: `Erro inesperado: ${err instanceof Error ? err.message : "unknown"}`,
    }, { status: 500 });
  }
}
