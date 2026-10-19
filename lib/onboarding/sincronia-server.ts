// lib/onboarding/sincronia-server.ts — aplica patchDoRascunho (./sincronia.ts) no banco.

import { supabaseAdmin } from "@/lib/supabase/server";
import { patchDoRascunho, RASCUNHO_PARA_FICHA, COLUNAS_FICHA } from "./sincronia";

const COLUNAS_RASCUNHO = ["id", "client_id", "status", ...Object.keys(RASCUNHO_PARA_FICHA)].join(", ");

export interface ResultadoSincronia { clientId: string | null; campos: string[]; erro?: string }

/** Leva o rascunho de UM cadastro para a ficha do cliente. `aplicar=false` só calcula. */
export async function sincronizarRascunho(
  filtro: { token: string } | { id: string },
  aplicar = true,
): Promise<ResultadoSincronia> {
  const q = supabaseAdmin.from("client_onboarding_submissions").select(COLUNAS_RASCUNHO);
  const { data: sub, error } = await ("token" in filtro ? q.eq("token", filtro.token) : q.eq("id", filtro.id)).maybeSingle();
  if (error || !sub) return { clientId: null, campos: [], erro: error?.message ?? "cadastro não encontrado" };
  const rascunho = sub as unknown as Record<string, unknown>;
  const clientId = (rascunho.client_id as string | null) ?? null;
  if (!clientId) return { clientId: null, campos: [] };

  const { data: ficha, error: eFicha } = await supabaseAdmin
    .from("clients").select(["draft_status", ...COLUNAS_FICHA].join(", ")).eq("id", clientId).maybeSingle();
  if (eFicha || !ficha) return { clientId, campos: [], erro: eFicha?.message ?? "cliente não encontrado" };
  const f = ficha as unknown as Record<string, unknown>;

  const patch = patchDoRascunho(rascunho, f, !!f.draft_status);
  const campos = Object.keys(patch);
  if (!campos.length || !aplicar) return { clientId, campos };

  const { error: eGrava } = await supabaseAdmin.from("clients").update(patch).eq("id", clientId);
  if (eGrava) return { clientId, campos: [], erro: eGrava.message };
  return { clientId, campos };
}
