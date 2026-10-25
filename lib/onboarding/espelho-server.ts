// lib/onboarding/espelho-server.ts — aplica senhasParaEspelho (./espelho.ts) no banco.
//
// Chamado quando o cadastro vira cliente ativo (provision/approve) e quando um cliente JÁ ativo envia
// o cadastro (app/api/onboarding). Nunca lança e nunca devolve nem loga senha: só quais campos foram.

import { supabaseAdmin } from "@/lib/supabase/server";
import { decryptVault } from "@/lib/crypto/vault";
import { espelharNoCofre } from "@/lib/cofre/espelhar";
import { senhasParaEspelho, COLUNAS_FICHA_ESPELHO } from "./espelho";

export interface ResultadoEspelhoCadastro { ok: boolean; campos: string[]; erro?: string }

/**
 * `rascunho`: a linha do cadastro (client_onboarding_submissions), com meta_/instagram_ login e senha.
 * `usarFicha: false` quando a cópia rascunho → ficha acabou de falhar (a ficha estaria velha).
 */
export async function espelharCadastroNoCofre(
  clientId: string,
  rascunho: Record<string, unknown> | null,
  opcoes?: { usarFicha?: boolean },
): Promise<ResultadoEspelhoCadastro> {
  try {
    let ficha: Record<string, unknown> | null = null;
    if (opcoes?.usarFicha !== false) {
      const { data, error } = await supabaseAdmin.from("clients").select(COLUNAS_FICHA_ESPELHO).eq("id", clientId).maybeSingle();
      if (error) console.error("[onboarding/espelho] ficha não lida (segue com o rascunho):", error.message);
      else ficha = (data as unknown as Record<string, unknown> | null) ?? null;
    }
    const plano = senhasParaEspelho({ ficha, rascunho }, decryptVault);
    const r = await espelharNoCofre(clientId, plano.senhas);
    const problemas = [
      r.ok ? null : r.erro ?? "falha ao gravar no cofre do social",
      plano.naoDecifradas.length ? `senha de ${plano.naoDecifradas.join(" e ")} não pôde ser lida (chave do cofre?)` : null,
    ].filter(Boolean);
    return { ok: problemas.length === 0, campos: r.campos, ...(problemas.length ? { erro: problemas.join("; ") } : {}) };
  } catch (e) {
    return { ok: false, campos: [], erro: e instanceof Error ? e.message : "erro" };
  }
}
