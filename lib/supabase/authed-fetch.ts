/**
 * fetch wrapper que injeta o access_token do Supabase no header Authorization.
 *
 * Use em todas as chamadas pra rotas Next.js que fazem `getServerUser(req)` —
 * sem isso, o server não recebe o token (Supabase JS default guarda em
 * localStorage, não em cookies).
 *
 * Uso:
 *   import { authedFetch } from "@/lib/supabase/authed-fetch";
 *   const res = await authedFetch("/api/broadcasts", { method: "POST", body: ... });
 */

import { supabase } from "./client";

/** Evento disparado quando o servidor recusa por falta de sessão. O AppShell escuta e avisa. */
export const SESSAO_EXPIRADA = "lone:sessao-expirada";

export async function authedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }
  } catch { /* ignore — cookie handles same-origin auth */ }

  const res = await fetch(input, { ...init, headers });

  // SESSÃO EXPIRADA NÃO PODE VIRAR "TELA VAZIA". Quando o token vence, este fetch ia sem
  // Authorization, o servidor respondia 401 e cada store transformava isso numa lista vazia — o
  // painel mostrava "0 clientes ativos", "0 em risco" e cards em branco, SEM nenhum erro no console.
  // O usuário continua vendo o próprio nome (vem do perfil local), então parece que está logado e o
  // sistema é que está quebrado. Agora avisa, em vez de mentir que não há dados.
  if (res.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SESSAO_EXPIRADA));
  }
  return res;
}
