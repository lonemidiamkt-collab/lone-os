// lib/obs/erro-postgrest.ts — LONE-023: erro do Supabase que ninguém leu vira alerta mesmo assim.
//
// O padrão de bug mais comum do sistema é `const { data } = await supabaseAdmin...` com o `error`
// ignorado: a escrita falha, a rota devolve ok, e "não funciona" aparece dias depois sem rastro.
// Em vez de caçar cada um dos ~600 pontos, o transporte olha a resposta do PostgREST: status ≥ 400
// → console.error + Sentry (warning), com tabela, método, status e código — nunca a linha.
//
// Fora do alerta: 406 (é o `.single()` sem linha — "não achei", não erro) e /auth/v1 (token vencido
// é rotina, e getServerUser já trata). Mesmo erro repetido só reporta 1x a cada 5 min por
// (tabela, método, status) — o Sentry não vira o log de um cron quebrado rodando de minuto em minuto.

import { execucaoAtual } from "@/lib/obs/correlacao";

const ultimo = new Map<string, number>();
const JANELA = 5 * 60 * 1000;

export interface ErroPostgrest {
  tabela: string; metodo: string; status: number; codigo: string | null; mensagem: string; correlationId: string | null;
}

export function tabelaDaUrl(url: string): string | null {
  const m = /\/rest\/v1\/(rpc\/)?([A-Za-z0-9_]+)/.exec(url);
  return m ? (m[1] ? `rpc:${m[2]}` : m[2]) : null;
}

export function deveReportar(url: string, status: number): boolean {
  if (status < 400) return false;
  if (status === 406) return false;
  if (!/\/rest\/v1\//.test(url)) return false; // auth/storage têm os próprios erros de rotina
  return true;
}

function dentroDaJanela(chave: string): boolean {
  const agora = Date.now();
  const t = ultimo.get(chave);
  if (t && agora - t < JANELA) return true;
  if (ultimo.size > 500) ultimo.clear();
  ultimo.set(chave, agora);
  return false;
}

/** Best-effort: lê o corpo (clone) e reporta. Nunca lança. */
export async function reportarErroPostgrest(url: string, metodo: string, res: Response): Promise<void> {
  try {
    const tabela = tabelaDaUrl(url) ?? "?";
    const chave = `${tabela}|${metodo}|${res.status}`;
    if (dentroDaJanela(chave)) return;
    let codigo: string | null = null;
    let mensagem = "";
    try {
      const corpo = (await res.text()).slice(0, 600);
      try {
        const j = JSON.parse(corpo) as { code?: string; message?: string; details?: string; hint?: string };
        codigo = j.code ?? null;
        mensagem = [j.message, j.details, j.hint].filter(Boolean).join(" · ").slice(0, 400);
      } catch { mensagem = corpo; }
    } catch { /* sem corpo */ }
    const e: ErroPostgrest = { tabela, metodo, status: res.status, codigo, mensagem, correlationId: execucaoAtual()?.id ?? null };
    console.error(`[supabase] ${e.metodo} ${e.tabela} → ${e.status}${e.codigo ? ` ${e.codigo}` : ""}: ${e.mensagem}${e.correlationId ? ` (exec ${e.correlationId})` : ""}`);
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.withScope((scope) => {
        scope.setLevel(res.status >= 500 ? "error" : "warning");
        scope.setTag("supabase.tabela", e.tabela);
        scope.setTag("supabase.metodo", e.metodo);
        scope.setTag("supabase.status", String(e.status));
        if (e.codigo) scope.setTag("supabase.codigo", e.codigo);
        if (e.correlationId) scope.setTag("correlation_id", e.correlationId);
        scope.setFingerprint(["supabase", e.tabela, e.metodo, String(e.status), e.codigo ?? ""]);
        Sentry.captureMessage(`Supabase ${e.metodo} ${e.tabela} → ${e.status}${e.codigo ? ` ${e.codigo}` : ""}: ${e.mensagem}`);
      });
    } catch { /* Sentry ausente/desligado */ }
  } catch { /* reportar nunca derruba a chamada */ }
}

/** Só para testes. */
export function _limparJanelaErros() { ultimo.clear(); }
