// lib/cs/estilo.ts — PASSO 3 do aprendizado de estilo. Lê os perfis revisados (agency_settings
// cs_style:team e cs_style:<clientId>) pra o agente escrever no TOM certo:
//  - com o TIME (grupo interno): tom do time (informal).
//  - com o CLIENTE (resposta sugerida/onboarding): tom PROFISSIONAL, calibrado pelo jeito do cliente
//    (sem copiar gírias). O perfil do cliente é CONTEXTO de calibragem, não pra imitar.
// Best-effort: se não houver perfil, retorna null e o prompt segue com o tom padrão.

import { supabaseAdmin } from "@/lib/supabase/server";

async function lerEstilo(key: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin.from("agency_settings").select("value").eq("key", key).maybeSingle();
    const v = (data?.value as string | undefined)?.trim();
    return v || null;
  } catch { return null; }
}

/** Tom do TIME da Lone (conversa interna). */
export function getEstiloTime(): Promise<string | null> {
  return lerEstilo("cs_style:team");
}

/** Tom do CLIENTE (como ELE fala no grupo dele) — usado só pra calibrar formalidade da resposta. */
export function getEstiloCliente(clientId?: string | null): Promise<string | null> {
  if (!clientId) return Promise.resolve(null);
  return lerEstilo(`cs_style:${clientId}`);
}
