export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import * as db from "@/lib/supabase/queries";
import { supabaseAdmin } from "@/lib/supabase/server";
import { carregarExtras, EXTRAS_VAZIOS } from "@/lib/crm/extras";
import { normalizarQualificacao, notaDoLead } from "@/lib/crm/nota";
import { carregarConfig } from "@/lib/prospeccao/config";

// CRM comercial (SDR) — CRUD dos leads.
// ESCOPO POR PAPEL: só comercial + gestão. Antes bastava estar logado e o escopo era "feito no menu"
// — mas esconder o item no Sidebar não impede chamar a rota: o designer lia o funil inteiro
// (contatos, valores negociados, motivo de perda).
//   GET                       → lista os leads
//   POST   { ...campos }      → cria um lead (contatoNome obrigatório)
//   PATCH  { id, ...campos }  → atualiza (ex.: mover de estágio, marcar reunião)
//   DELETE ?id=…              → apaga

const CRM_ROLES: Papel[] = ["admin", "manager", "comercial"];

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, CRM_ROLES);
  if (gate instanceof NextResponse) return gate;
  const leads = await db.fetchCrmLeads();
  // Leva 7C (N27/N28): nota A/B/C, toques da cadência e se já virou cliente — e os segmentos do ICP
  // para a qualificação (os mesmos da prospecção).
  const [extras, cfg] = await Promise.all([carregarExtras(leads.map((l) => l.id)), carregarConfig()]);
  return NextResponse.json({
    leads: leads.map((l) => ({ ...l, ...(extras.get(l.id) ?? EXTRAS_VAZIOS) })),
    segmentosIcp: cfg.segmentos.map((x) => x.nome),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, CRM_ROLES);
  if (gate instanceof NextResponse) return gate;
  const body = await req.json().catch(() => null);
  if (!body?.contatoNome?.trim()) return NextResponse.json({ error: "Nome do contato é obrigatório" }, { status: 400 });
  try {
    const lead = await db.insertCrmLead(body);
    return NextResponse.json({ lead });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireRole(req, CRM_ROLES);
  if (gate instanceof NextResponse) return gate;
  const body = await req.json().catch(() => null);
  const { id, ...patch } = body ?? {};
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  try {
    // Transições automáticas (no servidor, pra valer também no drag do Kanban):
    // → ganho/perdido: carimba fechado_em (data REAL da venda — é a base do relatório mensal);
    // → volta pra etapa aberta: limpa fechado_em (e motivo de perda, se saiu de perdido);
    // → proposta: marca proposta_enviada_em (1ª vez).
    let etapaMudou: string | null = null;
    if (typeof patch.estagio === "string") {
      const atual = await db.fetchCrmLeadById(id);
      // Data em São Paulo (não UTC): o relatório agrupa por mês de fechado_em; à noite no fim do mês,
      // o ISO UTC (UTC-3 → +3h) jogava a venda pro mês seguinte e ela sumia do "Vendas no mês".
      const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // "YYYY-MM-DD"
      const fechado = patch.estagio === "ganho" || patch.estagio === "perdido";
      if (fechado && atual?.estagio !== patch.estagio) patch.fechadoEm = hojeSP;
      if (!fechado) {
        patch.fechadoEm = null;
        if (atual?.estagio === "perdido" && patch.motivoPerda === undefined) patch.motivoPerda = null;
      }
      if (patch.estagio === "proposta" && !atual?.propostaEnviadaEm && patch.propostaEnviadaEm === undefined) {
        patch.propostaEnviadaEm = hojeSP;
      }
      if (atual && atual.estagio !== patch.estagio) etapaMudou = patch.estagio;
    }
    // Qualificação → nota pela régua da prospecção (lib/crm/nota.ts). Colunas da migration
    // 20260926100000: sem ela, o resto do lead salva e a nota volta com aviso.
    const { qualificacao, cadenciaInicio, ...resto } = patch as Record<string, unknown>;
    let avisoNota: string | null = null;
    if (qualificacao !== undefined || cadenciaInicio !== undefined) {
      const extra: Record<string, unknown> = {};
      if (qualificacao !== undefined) {
        const q = normalizarQualificacao(qualificacao);
        const n = notaDoLead(q, await carregarConfig());
        Object.assign(extra, { qualificacao: q, nota: n.nota, nota_score: n.score, nota_detalhe: n.detalhe });
      }
      if (cadenciaInicio !== undefined) extra.cadencia_inicio = typeof cadenciaInicio === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cadenciaInicio) ? cadenciaInicio : null;
      const { error } = await supabaseAdmin.from("crm_leads").update(extra).eq("id", id);
      if (error) avisoNota = /column|schema cache/i.test(error.message) ? "A nota não foi salva: falta aplicar a migration 20260926100000." : error.message;
    }
    for (const k of Object.keys(patch)) if (!(k in resto)) delete (patch as Record<string, unknown>)[k];
    const lead = await db.updateCrmLead(id, patch);
    // Auto-registra a mudança de etapa na timeline (best-effort — não derruba o update).
    if (etapaMudou) {
      const LABEL: Record<string, string> = {
        lead: "Novo lead", orcamento: "Orçamento", proposta: "Proposta",
        reuniao: "Reunião", ganho: "Ganho ✅", perdido: "Perdido ❌",
      };
      db.insertLeadActivity({ leadId: id, tipo: "etapa", texto: `Movido para ${LABEL[etapaMudou] ?? etapaMudou}`, autor: (patch.responsavel as string) ?? null }).catch(() => {});
    }
    const extras = (await carregarExtras([lead.id])).get(lead.id) ?? EXTRAS_VAZIOS;
    return NextResponse.json({ lead: { ...lead, ...extras }, avisoNota });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireRole(req, CRM_ROLES);
  if (gate instanceof NextResponse) return gate;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  try {
    await db.deleteCrmLead(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
