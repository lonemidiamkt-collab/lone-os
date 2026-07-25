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

/** Disparado quando o servidor recusa por sessão inválida — a UI avisa em vez de mostrar tela vazia. */
export const SESSAO_EXPIRADA = "lone:sessao-expirada";

/** Margem: renova o token se faltarem menos de 60s (evita expirar no meio do voo). */
const MARGEM_S = 60;

export async function authedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);

  try {
    let { data: { session } } = await supabase.auth.getSession();

    // TOKEN VENCIDO É PIOR QUE SESSÃO AUSENTE. Sem sessão, o app mostra a tela de login. Mas com
    // sessão VENCIDA o RoleContext considera a pessoa autenticada (só checa se a sessão existe),
    // enquanto toda chamada volta 401 — e cada store transformava isso em lista vazia. O resultado é
    // o painel com o nome do usuário no topo e "0 clientes ativos", como se o banco tivesse sumido.
    // Aqui o token é renovado ANTES de sair, em vez de mandar um já vencido.
    const exp = session?.expires_at ?? 0;
    const vencido = exp > 0 && exp - MARGEM_S <= Math.floor(Date.now() / 1000);
    if (session && vencido) {
      const { data } = await supabase.auth.refreshSession();
      if (data.session) session = data.session;
    }

    if (session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }
  } catch { /* ignore — cookie handles same-origin auth */ }

  const res = await fetch(input, { ...init, headers });

  // Se ainda assim o servidor recusou, avisa a UI (o AppShell mostra a faixa "entre de novo").
  if (res.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SESSAO_EXPIRADA));
  }
  return res;
}
