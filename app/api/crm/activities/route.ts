export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { PAPEIS_COMERCIAL } from "@/lib/crm/acesso";
import { registrarAtividade, TIPOS_ATIVIDADE } from "@/lib/crm/registrar-atividade";
import * as db from "@/lib/supabase/queries";
import type { CrmAtividadeTipo } from "@/lib/types";

// Timeline do lead (CRM comercial). Só quem entra no comercial (lib/crm/acesso.ts) — antes bastava
// estar logado, e qualquer pessoa da equipe lia o histórico das negociações chamando a rota.
//   GET  ?leadId=…                      → atividades do lead (mais recente primeiro)
//   POST { leadId, tipo, texto, autor } → registra (nota/ligação/whatsapp/email/reunião/visita/pulado),
//        com as regras do funil em lib/crm/registrar-atividade.ts (primeiro toque tira de Novo etc.).

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
  const tipo: CrmAtividadeTipo = TIPOS_ATIVIDADE.includes(body.tipo) ? body.tipo : "nota";
  try {
    const { atividade, lead } = await registrarAtividade({ leadId: body.leadId, tipo, texto: String(body.texto), autor: body.autor ?? null });
    return NextResponse.json({ atividade, lead });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
