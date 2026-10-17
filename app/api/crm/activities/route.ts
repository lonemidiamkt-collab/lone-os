export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { PAPEIS_COMERCIAL } from "@/lib/crm/acesso";
import { TIPOS_TOQUE } from "@/lib/crm/cadencia";
import { hojeSP } from "@/lib/crm/meta";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import type { CrmAtividadeTipo } from "@/lib/types";

// Timeline do lead (CRM comercial). Só quem entra no comercial (lib/crm/acesso.ts) — antes bastava
// estar logado, e qualquer pessoa da equipe lia o histórico das negociações chamando a rota.
//   GET  ?leadId=…                      → atividades do lead (mais recente primeiro)
//   POST { leadId, tipo, texto, autor } → registra (nota/ligação/whatsapp/email/reunião/visita).
//        O primeiro TOQUE (ligação, WhatsApp, e-mail, reunião, visita) carimba primeiro_contato_em
//        (o "tempo até o primeiro contato" do Dashboard) e tira o lead de Novo → Contato feito.
//        Toque com "retomar em" vencido limpa a data (a retomada foi feita).
//        "pulado" = o comercial decidiu não fazer aquele passo da régua: a cadência anda, o contato não.

const TIPOS: CrmAtividadeTipo[] = ["nota", "ligacao", "whatsapp", "email", "reuniao", "visita", "pulado"];

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
    let lead = null;
    if (TIPOS_TOQUE.has(tipo)) {
      const agora = atividade.createdAt || new Date().toISOString();
      // Só a primeira vez (is null).
      await supabaseAdmin.from("crm_leads").update({ primeiro_contato_em: agora }).eq("id", body.leadId).is("primeiro_contato_em", null);
      const atual = await db.fetchCrmLeadById(body.leadId);
      if (atual) {
        const patch: Record<string, unknown> = {};
        // O funil anda sozinho: quem recebeu o primeiro contato não é mais "Novo".
        if (atual.estagio === "novo") { patch.estagio = "contato"; patch.etapaDesde = agora; }
        if (atual.retomarEm && atual.retomarEm <= hojeSP()) patch.retomarEm = null;
        if (Object.keys(patch).length) {
          lead = await db.updateCrmLead(body.leadId, patch);
          if (patch.estagio) await db.insertLeadActivity({ leadId: body.leadId, tipo: "etapa", texto: "Movido para Contato feito (primeiro contato)", autor: body.autor ?? null }).catch(() => {});
        }
      }
    }
    return NextResponse.json({ atividade, lead });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
