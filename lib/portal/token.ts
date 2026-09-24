// lib/portal/token.ts — o cliente dono de um link do portal, ou null.
//
// Mesma regra das outras rotas públicas do portal (app/portal/[token]/page.tsx): link revogado,
// portal desligado, ex-cliente (inativo/arquivado) e cliente pausado não acessam.

import { supabaseAdmin } from "@/lib/supabase/server";
import { estaPausado } from "@/lib/clients/pausa";

export interface ClienteDoPortal { id: string; nome: string }

export async function clienteDoToken(token: string): Promise<ClienteDoPortal | null> {
  if (!token || token.length > 200) return null;
  const { data: c } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, public_report_enabled, public_report_token_revoked_at, active, churned_at, paused_at, paused_until")
    .eq("public_report_token", token)
    .maybeSingle();
  if (!c || !c.public_report_enabled || c.public_report_token_revoked_at || c.active === false || c.churned_at || estaPausado(c)) {
    return null;
  }
  return { id: c.id as string, nome: ((c.nome_fantasia as string) || (c.name as string) || "Cliente") };
}
