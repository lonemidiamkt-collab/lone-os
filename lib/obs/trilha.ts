// lib/obs/trilha.ts — TRILHA DE AÇÕES DO NAVEGADOR (18/09). Erro JS não explica "cliquei e nada
// aconteceu" quando o código decide não fazer nada. Cada passo importante (criar card, A fazer,
// anexar, entregar, busca descartada) manda uma linha ao servidor: quem, onde, o quê, resultado.
// Fire-and-forget, máx. 80 por sessão. Lê-se com: docker logs loneos-app-1 | grep trilha
let enviados = 0;
export function trilha(acao: string, detalhe?: Record<string, unknown>): void {
  if (typeof window === "undefined" || enviados >= 80) return;
  enviados++;
  const msg = `${acao}${detalhe ? " " + JSON.stringify(detalhe).slice(0, 400) : ""}`;
  import("@/lib/supabase/authed-fetch").then(({ authedFetch }) =>
    authedFetch("/api/system/erro-cliente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ msg, url: location.pathname, acao: "trilha" }) }).catch(() => {}),
  ).catch(() => {});
}
