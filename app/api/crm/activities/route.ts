export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { PAPEIS_COMERCIAL } from "@/lib/crm/acesso";
import { desfazerRegistro, registrarAtividade, TIPOS_ATIVIDADE } from "@/lib/crm/registrar-atividade";
import { lerDesfazer, textoMantidos } from "@/lib/crm/desfazer-registro";
import { carregarExtras, EXTRAS_VAZIOS } from "@/lib/crm/extras";
import * as db from "@/lib/supabase/queries";
import type { CrmAtividadeTipo } from "@/lib/types";

// Timeline do lead (CRM comercial). Só quem entra no comercial (lib/crm/acesso.ts) — antes bastava
// estar logado, e qualquer pessoa da equipe lia o histórico das negociações chamando a rota.
//   GET  ?leadId=…                      → atividades do lead (mais recente primeiro)
//   POST { leadId, tipo, texto, autor } → registra (nota/ligação/whatsapp/email/reunião/visita/pulado),
//        com as regras do funil em lib/crm/registrar-atividade.ts (primeiro toque tira de Novo etc.).
//        Devolve `desfazer`: o que o registro mudou.
//   DELETE { desfazer }                 → o "Desfazer" do aviso (24/10/2026, auditoria 4.6): apaga o registro e
//        volta o lead, nos primeiros minutos (lib/crm/desfazer-registro.ts).

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const leadId = req.nextUrl.searchParams.get("leadId");
  if (!leadId) return NextResponse.json({ error: "leadId obrigatório" }, { status: 400 });
  try {
    return NextResponse.json({ atividades: await db.fetchLeadActivities(leadId) });
  } catch (e) {
    // Histórico que não carregou não é "sem histórico ainda" (24/10/2026).
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não consegui ler o histórico do lead." }, { status: 503 });
  }
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
    const { atividade, lead, desfazer } = await registrarAtividade({ leadId: body.leadId, tipo, texto: String(body.texto), autor: body.autor ?? null });
    return NextResponse.json({ atividade, lead, desfazer });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const body = await req.json().catch(() => null);
  const desfazer = lerDesfazer(body?.desfazer);
  if (!desfazer) return NextResponse.json({ error: "Não recebi o que desfazer. Recarregue a página." }, { status: 400 });
  try {
    const r = await desfazerRegistro(desfazer, new Date(), gate.user.email); // quem desfez assina a volta da etapa no histórico
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
    const extras = r.lead ? (await carregarExtras([r.lead.id])).get(r.lead.id) ?? EXTRAS_VAZIOS : null;
    return NextResponse.json({ ok: true, lead: r.lead ? { ...r.lead, ...extras } : null, aviso: textoMantidos(r.mantidos) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
