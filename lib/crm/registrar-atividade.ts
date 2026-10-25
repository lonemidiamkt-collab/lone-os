// lib/crm/registrar-atividade.ts — registra uma atividade no lead com as regras do funil. Usado pela
// tela (app/api/crm/activities) e pelo Loninho no grupo de vendas (lib/crm/assistente-server.ts).
//   • O primeiro TOQUE (ligação, WhatsApp, e-mail, reunião, visita) carimba primeiro_contato_em
//     (o "tempo até o primeiro contato" do Dashboard) e tira o lead de Novo → Contato feito.
//   • Toque com "retomar em" vencido limpa a data (a retomada foi feita).
//   • "pulado" = o comercial decidiu não fazer aquele passo da régua: a cadência anda, o contato não.
//
// 24/10/2026 (auditoria 4.6): devolve também o que o registro mudou (`desfazer`), para o "Desfazer" da tela
// voltar exatamente isso — ver lib/crm/desfazer-registro.ts.

import { TIPOS_TOQUE } from "@/lib/crm/cadencia";
import { hojeSP } from "@/lib/crm/meta";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import { planoDesfazer, type CampoDesfazivel, type DesfazerRegistro } from "@/lib/crm/desfazer-registro";
import type { CrmAtividadeTipo, CrmLead, CrmLeadActivity } from "@/lib/types";

export const TIPOS_ATIVIDADE: CrmAtividadeTipo[] = ["nota", "ligacao", "whatsapp", "email", "reuniao", "visita", "pulado"];

export async function registrarAtividade(p: { leadId: string; tipo: CrmAtividadeTipo; texto: string; autor: string | null }): Promise<{ atividade: CrmLeadActivity; lead: CrmLead | null; desfazer: DesfazerRegistro }> {
  const atividade = await db.insertLeadActivity({ leadId: p.leadId, tipo: p.tipo, texto: p.texto.trim(), autor: p.autor });
  const desfazer: DesfazerRegistro = { leadId: p.leadId, atividadeIds: [atividade.id], antes: {}, depois: {} };
  let lead: CrmLead | null = null;
  if (TIPOS_TOQUE.has(p.tipo)) {
    const agora = atividade.createdAt || new Date().toISOString();
    // Lido ANTES de mexer: é o "antes" do Desfazer.
    const atual = await db.fetchCrmLeadById(p.leadId);
    // Só a primeira vez (is null).
    if (!atual?.primeiroContatoEm) {
      const { error } = await supabaseAdmin.from("crm_leads").update({ primeiro_contato_em: agora }).eq("id", p.leadId).is("primeiro_contato_em", null);
      if (!error && atual) { desfazer.antes.primeiroContatoEm = null; desfazer.depois.primeiroContatoEm = agora; }
    }
    if (atual) {
      const patch: Partial<Record<CampoDesfazivel, string | null>> = {};
      // O funil anda sozinho: quem recebeu o primeiro contato não é mais "Novo".
      if (atual.estagio === "novo") { patch.estagio = "contato"; patch.etapaDesde = agora; }
      if (atual.retomarEm && atual.retomarEm <= hojeSP()) patch.retomarEm = null;
      if (Object.keys(patch).length) {
        lead = await db.updateCrmLead(p.leadId, patch);
        for (const c of Object.keys(patch) as CampoDesfazivel[]) {
          desfazer.antes[c] = (atual[c] as string | null | undefined) ?? null;
          desfazer.depois[c] = patch[c] ?? null;
        }
        if (patch.estagio) {
          const nota = await db.insertLeadActivity({ leadId: p.leadId, tipo: "etapa", texto: "Movido para Contato feito (primeiro contato)", autor: p.autor }).catch(() => null);
          if (nota) desfazer.atividadeIds.push(nota.id);
        }
      }
    }
  }
  return { atividade, lead, desfazer };
}

/**
 * Desfaz um registro (o "Desfazer" do aviso). Volta primeiro o lead e depois apaga as atividades: se a segunda
 * parte falhar, repetir o Desfazer é seguro (o lead já voltou e não é tocado de novo).
 */
export async function desfazerRegistro(d: DesfazerRegistro, agora: Date = new Date()): Promise<
  { ok: true; lead: CrmLead | null; mantidos: CampoDesfazivel[] } | { ok: false; erro: string; status: number }
> {
  const lead = await db.fetchCrmLeadById(d.leadId);
  const { data, error } = d.atividadeIds.length
    ? await supabaseAdmin.from("crm_lead_activities").select("id, lead_id, created_at").in("id", d.atividadeIds)
    : { data: [] as Record<string, unknown>[], error: null };
  if (error) return { ok: false, erro: `Não consegui conferir o registro (${error.message}). Nada foi desfeito — tente de novo.`, status: 503 };
  const plano = planoDesfazer({
    desfazer: d, lead, agora,
    atividades: (data ?? []).map((a) => ({ id: a.id as string, leadId: a.lead_id as string, createdAt: a.created_at as string })),
  });
  if (!plano.ok) return { ok: false, erro: plano.erro, status: 409 };
  let novo: CrmLead | null = lead;
  if (Object.keys(plano.restaurar).length) {
    try { novo = await db.updateCrmLead(d.leadId, plano.restaurar); }
    catch (e) { return { ok: false, erro: `Não consegui voltar o lead (${e instanceof Error ? e.message : "erro"}). Nada foi desfeito — tente de novo.`, status: 500 }; }
  }
  if (plano.apagar.length) {
    const { error: errDel } = await supabaseAdmin.from("crm_lead_activities").delete().in("id", plano.apagar).eq("lead_id", d.leadId);
    if (errDel) return { ok: false, erro: `O lead voltou, mas o registro continua no histórico (${errDel.message}). Clique em Desfazer de novo.`, status: 500 };
  }
  return { ok: true, lead: novo, mantidos: plano.mantidos };
}
