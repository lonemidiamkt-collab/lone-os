export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { loadLoneLogo } from "@/lib/cs/roteiro-pdf";
import * as db from "@/lib/supabase/queries";
import { buscarProspect } from "@/lib/prospeccao/db";
import { podeIr, registrarEvento, transicionar } from "@/lib/prospeccao/maquina";
import { nomeProprio } from "@/lib/prospeccao/normalizar";
import { faltandoNaProposta, pacoteProposta, propostaPdfHtml, type DadosProposta } from "@/lib/crm/proposta";
import type { ProspectRow } from "@/lib/prospeccao/tipos";

// /api/crm/proposta — GERADOR DE PROPOSTA (Leva 7C, N29). Comercial + gestão.
//   GET  ?prospectId=… | ?leadId=…  [&pacote=lone_growth]  → o PDF, montado do diagnóstico do prospect
//   POST { prospectId? , leadId? }                          → "proposta enviada": data no lead do CRM,
//                                                             etapa Proposta no funil e no piloto
// SEM R$ — nem no PDF, nem no registro. O que conta é a proposta ENVIADA (a data), não o valor.

const PAPEIS: Papel[] = ["admin", "manager", "comercial"];

/** Lead do CRM → o prospect de onde ele veio (a proposta nasce do diagnóstico). */
async function prospectDoPedido(prospectId: string | null, leadId: string | null): Promise<{ prospect: ProspectRow | null; leadId: string | null }> {
  if (prospectId) {
    const p = await buscarProspect(prospectId);
    return { prospect: p, leadId: leadId ?? (p?.crm_lead_id ?? null) };
  }
  if (leadId) {
    const { data } = await supabaseAdmin.from("crm_leads").select("prospect_id").eq("id", leadId).maybeSingle();
    const pid = (data?.prospect_id as string) ?? null;
    return { prospect: pid ? await buscarProspect(pid) : null, leadId };
  }
  return { prospect: null, leadId: null };
}

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS);
  if (gate instanceof NextResponse) return gate;
  const sp = req.nextUrl.searchParams;
  const { prospect: p } = await prospectDoPedido(sp.get("prospectId"), sp.get("leadId"));
  if (!p) return NextResponse.json({ error: "A proposta nasce do diagnóstico da prospecção — este lead não tem prospect vinculado." }, { status: 404 });

  const pr = p.presenca ?? null;
  const dados: DadosProposta = {
    empresa: p.nome, decisor: p.decisor_nome ? nomeProprio(p.decisor_nome) : null,
    cidade: p.cidade ? `${p.cidade}${p.uf ? `/${p.uf}` : ""}` : null, segmento: p.segmento,
    porQue: p.diagnostico?.por_que_prospectar ?? null, oportunidades: p.diagnostico?.oportunidades ?? [],
    presenca: {
      seguidores: pr?.instagram_followers ?? null, postsPorSemana: pr?.posts_por_semana ?? null,
      googleNota: p.google_nota, googleAvaliacoes: p.google_avaliacoes, anuncia: pr?.anuncia ?? null,
    },
    pacote: pacoteProposta(sp.get("pacote")),
  };
  const falta = faltandoNaProposta(dados);
  if (falta.length) return NextResponse.json({ error: `Falta para montar a proposta: ${falta.join(", ")}.`, faltando: falta }, { status: 422 });

  const geradoEm = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const pdf = await htmlToPdf(propostaPdfHtml(dados, await loadLoneLogo(), geradoEm));
  if (!pdf.ok || !pdf.buffer) return NextResponse.json({ error: pdf.error ?? "Falha ao gerar o PDF" }, { status: 502 });
  const slug = p.nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return new NextResponse(new Uint8Array(pdf.buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="proposta-${slug}.pdf"` },
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS);
  if (gate instanceof NextResponse) return gate;
  const body = await req.json().catch(() => null) as { prospectId?: string; leadId?: string } | null;
  const { prospect, leadId } = await prospectDoPedido(body?.prospectId ?? null, body?.leadId ?? null);
  if (!prospect && !leadId) return NextResponse.json({ error: "prospectId ou leadId obrigatório" }, { status: 400 });

  const { data: tm } = await supabaseAdmin.from("team_members").select("name").eq("email", gate.user.email).maybeSingle();
  const quem = (tm?.name as string) || gate.user.email.split("@")[0];
  const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const avisos: string[] = [];

  // Funil do CRM: a data da proposta (1ª vez) e a etapa, se ainda estava antes dela.
  if (leadId) {
    const lead = await db.fetchCrmLeadById(leadId);
    if (lead) {
      const patch: Record<string, unknown> = {};
      if (!lead.propostaEnviadaEm) patch.propostaEnviadaEm = hojeSP;
      if (["lead", "orcamento", "reuniao"].includes(lead.estagio)) patch.estagio = "proposta";
      if (Object.keys(patch).length) {
        try { await db.updateCrmLead(leadId, patch); } catch (e) { avisos.push(`lead: ${e instanceof Error ? e.message : "erro"}`); }
      }
      await db.insertLeadActivity({ leadId, tipo: "etapa", texto: "Proposta enviada (PDF gerado pelo painel)", autor: quem }).catch(() => {});
    }
  }

  // Piloto SDR: a etapa Proposta, quando a máquina permite; senão só o evento.
  if (prospect) {
    if (podeIr(prospect.estagio, "proposta")) {
      try {
        await transicionar(prospect, { para: "proposta", motivo: "Proposta enviada pelo painel", responsavel: quem });
      } catch (e) { avisos.push(`prospecção: ${e instanceof Error ? e.message : "erro"}`); }
    } else {
      await registrarEvento(prospect.id, { tipo: "proposta_enviada", motivo: "Proposta enviada pelo painel", responsavel: quem });
    }
  }
  return NextResponse.json({ ok: true, propostaEnviadaEm: hojeSP, avisos });
}
