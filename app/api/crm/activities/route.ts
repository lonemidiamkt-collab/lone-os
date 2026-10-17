export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { PAPEIS_COMERCIAL } from "@/lib/crm/acesso";
import { TIPOS_TOQUE } from "@/lib/crm/cadencia";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import type { CrmAtividadeTipo } from "@/lib/types";

// Timeline do lead (CRM comercial). Só quem entra no comercial (lib/crm/acesso.ts) — antes bastava
// estar logado, e qualquer pessoa da equipe lia o histórico das negociações chamando a rota.
//   GET  ?leadId=…                      → atividades do lead (mais recente primeiro)
//   POST { leadId, tipo, texto, autor } → registra (nota/ligação/whatsapp/email/reunião/visita).
//        O primeiro TOQUE (ligação, WhatsApp, e-mail, reunião, visita) carimba primeiro_contato_em:
//        é o "tempo até o primeiro contato" do Dashboard.

const TIPOS: CrmAtividadeTipo[] = ["nota", "ligacao", "whatsapp", "email", "reuniao", "visita"];

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const leadId = req.nextUrl.searchParams.get("leadId");
  if (!leadId) return NextResponse.json({ error: "leadId obrigatório" }, { status: 400 });
  const atividades = await db.fetchLeadActivities(leadId);
  return NextResponse.json({ atividades });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const body = await req.json().catch(() => null);
  if (!body?.leadId || !body?.texto?.trim()) {
    return NextResponse.json({ error: "leadId e texto obrigatórios" }, { status: 400 });
  }
  const tipo: CrmAtividadeTipo = TIPOS.includes(body.tipo) ? body.tipo : "nota";
  try {
    const atividade = await db.insertLeadActivity({
      leadId: body.leadId, tipo, texto: String(body.texto).trim(), autor: body.autor ?? null,
    });
    if (TIPOS_TOQUE.has(tipo)) {
      // Só a primeira vez (is null). Sem a coluna (migration pendente), ignora em silêncio: a
      // atividade já foi gravada, e é ela que a cadência conta.
      await supabaseAdmin.from("crm_leads").update({ primeiro_contato_em: atividade.createdAt || new Date().toISOString() })
        .eq("id", body.leadId).is("primeiro_contato_em", null);
    }
    return NextResponse.json({ atividade });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
