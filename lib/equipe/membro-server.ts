// lib/equipe/membro-server.ts — a linha de team_members de quem está logado. Server-only.
//
// 25/10/2026 (onda 6, item 8.12): o elo login → equipe é o e-mail, sem diferença de maiúsculas
// (team_members não tem `auth_id`). Erro do banco volta como erro — quem chama decide entre 503 e
// seguir sem a informação; nunca vira "não está na equipe".

import { supabaseAdmin } from "@/lib/supabase/server";
import { escolherPorEmail, normalizarEmail, padraoExatoIlike } from "@/lib/equipe/email";

export type ResultadoMembro<T> = { membro: T | null; erro: string | null };

/**
 * Busca a pessoa da equipe pelo e-mail do login. `colunas` precisa incluir `email` (a conferência
 * final é feita aqui, comparando sem diferença de caixa).
 */
export async function buscarMembroPorEmail<T extends Record<string, unknown> = Record<string, unknown>>(
  email: string | null | undefined,
  colunas = "id, name, email, role, is_active, deleted_at",
): Promise<ResultadoMembro<T>> {
  const alvo = normalizarEmail(email);
  if (!alvo) return { membro: null, erro: null };
  const cols = /\bemail\b/.test(colunas) ? colunas : `${colunas}, email`;
  try {
    const { data, error } = await supabaseAdmin.from("team_members").select(cols).ilike("email", padraoExatoIlike(alvo)).limit(5);
    if (error) return { membro: null, erro: error.message };
    return { membro: escolherPorEmail((data ?? []) as unknown as T[], alvo), erro: null };
  } catch (e) {
    return { membro: null, erro: e instanceof Error ? e.message : String(e) };
  }
}
