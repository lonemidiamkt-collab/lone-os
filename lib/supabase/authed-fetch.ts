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

  let res = await fetch(input, { ...init, headers });

  // 401 COM SESSÃO (18/09): 20 por dia nos quadros. O GoTrue nunca recusou um token válido (1.207
  // de 1.207 em 6 h) — o 401 era pedido que saiu SEM o header, porque getSession() devolveu vazio
  // naquele instante (renovação em curso, outra aba, storage). Numa criação isso virava exceção e a
  // tela travava em "Salvando…" até o reload. Agora: renova a sessão e repete UMA vez, com o corpo
  // original (init.body é reutilizável para JSON e FormData).
  if (res.status === 401 && typeof window !== "undefined") {
    try {
      const { data } = await supabase.auth.refreshSession();
      const tok = data.session?.access_token;
      if (tok) {
        const h2 = new Headers(init?.headers);
        h2.set("Authorization", `Bearer ${tok}`);
        res = await fetch(input, { ...init, headers: h2 });
      }
    } catch { /* sem sessão para renovar */ }
    if (res.status === 401) window.dispatchEvent(new CustomEvent(SESSAO_EXPIRADA));
  }
  return res;
}
