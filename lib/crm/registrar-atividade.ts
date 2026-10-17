// lib/crm/registrar-atividade.ts — registra uma atividade no lead com as regras do funil. Usado pela
// tela (app/api/crm/activities) e pelo Loninho no grupo de vendas (lib/crm/assistente-server.ts).
//   • O primeiro TOQUE (ligação, WhatsApp, e-mail, reunião, visita) carimba primeiro_contato_em
//     (o "tempo até o primeiro contato" do Dashboard) e tira o lead de Novo → Contato feito.
//   • Toque com "retomar em" vencido limpa a data (a retomada foi feita).
//   • "pulado" = o comercial decidiu não fazer aquele passo da régua: a cadência anda, o contato não.

import { TIPOS_TOQUE } from "@/lib/crm/cadencia";
import { hojeSP } from "@/lib/crm/meta";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import type { CrmAtividadeTipo, CrmLead, CrmLeadActivity } from "@/lib/types";

export const TIPOS_ATIVIDADE: CrmAtividadeTipo[] = ["nota", "ligacao", "whatsapp", "email", "reuniao", "visita", "pulado"];

export async function registrarAtividade(p: { leadId: string; tipo: CrmAtividadeTipo; texto: string; autor: string | null }): Promise<{ atividade: CrmLeadActivity; lead: CrmLead | null }> {
  const atividade = await db.insertLeadActivity({ leadId: p.leadId, tipo: p.tipo, texto: p.texto.trim(), autor: p.autor });
  let lead: CrmLead | null = null;
  if (TIPOS_TOQUE.has(p.tipo)) {
    const agora = atividade.createdAt || new Date().toISOString();
    // Só a primeira vez (is null).
    await supabaseAdmin.from("crm_leads").update({ primeiro_contato_em: agora }).eq("id", p.leadId).is("primeiro_contato_em", null);
    const atual = await db.fetchCrmLeadById(p.leadId);
    if (atual) {
      const patch: Record<string, unknown> = {};
      // O funil anda sozinho: quem recebeu o primeiro contato não é mais "Novo".
      if (atual.estagio === "novo") { patch.estagio = "contato"; patch.etapaDesde = agora; }
      if (atual.retomarEm && atual.retomarEm <= hojeSP()) patch.retomarEm = null;
      if (Object.keys(patch).length) {
        lead = await db.updateCrmLead(p.leadId, patch);
        if (patch.estagio) await db.insertLeadActivity({ leadId: p.leadId, tipo: "etapa", texto: "Movido para Contato feito (primeiro contato)", autor: p.autor }).catch(() => {});
      }
    }
  }
  return { atividade, lead };
}
