// lib/contracts/valor-da-venda.ts — o que foi vendido no Comercial, para o contrato não pedir de novo (28/10/2026).
//
// O valor combinado mora no lead Ganho (crm_leads.valor_orcamento / valor_implantacao) e o cadastro aponta para ele
// (clients.source_lead_id). Antes, o grupo de cadastro e a ficha pediam o valor de novo — chance de digitar diferente
// do vendido. Só leitura; quem usa decide se mostra (nunca em mensagem de grupo).

import { supabaseAdmin } from "@/lib/supabase/server";

export interface ValorDaVenda { mensal: number; implantacao: number | null }

export async function valorDaVenda(clientId: string): Promise<ValorDaVenda | null> {
  const { data: cli, error } = await supabaseAdmin.from("clients").select("source_lead_id").eq("id", clientId).maybeSingle();
  if (error || !cli?.source_lead_id) return null;
  const { data: lead, error: eLead } = await supabaseAdmin.from("crm_leads")
    .select("valor_orcamento, valor_implantacao, estagio").eq("id", cli.source_lead_id as string).maybeSingle();
  if (eLead || !lead || lead.estagio !== "ganho") return null;
  const mensal = Number(lead.valor_orcamento);
  if (!(mensal > 0)) return null;
  const impl = lead.valor_implantacao == null ? null : Number(lead.valor_implantacao);
  return { mensal, implantacao: impl != null && impl > 0 ? impl : null };
}
