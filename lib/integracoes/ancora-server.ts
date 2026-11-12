// lib/integracoes/ancora-server.ts — a chamada assinada ao Âncora CRM (lado servidor).
//
// Sem ANCORA_PARCEIRO_SECRET (ou com segredo curto) a integração está DESLIGADA: nada sai daqui. O segredo é
// de ambiente, igual ao do lado de lá; nunca vai para o navegador nem para log.
//
// Toda falha volta como falha, com o motivo — a aba mostra "não consegui perguntar ao Âncora", nunca um
// "sem acesso" que seria mentira (docs/ERRO_RECUPERAVEL.md: falha do sistema aparece como falha).

import "server-only";
import { assinar } from "@/lib/crm/site-lead";
import { mensagemDoGet, type EstadoDoCliente } from "@/lib/integracoes/ancora";

export type FalhaAncora = "desligada" | "rede" | "nao_autorizado" | "recusado" | "resposta_invalida";
export type RespostaAncora<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; motivo: FalhaAncora; status: number; mensagem: string; code?: string };

const FRASE: Record<FalhaAncora, string> = {
  desligada: "A integração com o Âncora está desligada neste servidor.",
  rede: "Não consegui falar com o Âncora agora.",
  nao_autorizado: "O Âncora recusou a assinatura deste servidor.",
  recusado: "O Âncora recusou o pedido.",
  resposta_invalida: "O Âncora respondeu num formato inesperado.",
};

function config(): { base: string; segredo: string } | null {
  const segredo = process.env.ANCORA_PARCEIRO_SECRET ?? "";
  if (segredo.length < 32) return null;
  const base = (process.env.ANCORA_BASE_URL ?? "https://ancoracrm.com").trim().replace(/\/+$/, "");
  return { base, segredo };
}

/** A integração está configurada neste servidor? (para a tela dizer "desligada" sem tentar chamar) */
export const ancoraLigada = () => config() !== null;

async function chamar<T>(metodo: "GET" | "POST", url: string, mensagem: string, corpo?: string): Promise<RespostaAncora<T>> {
  const c = config();
  if (!c) return { ok: false, motivo: "desligada", status: 0, mensagem: FRASE.desligada };
  const ts = String(Date.now());
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), 15_000);
  try {
    const r = await fetch(`${c.base}${url}`, {
      method: metodo,
      headers: {
        "x-lone-timestamp": ts,
        "x-lone-signature": assinar(c.segredo, ts, mensagem),
        ...(corpo ? { "content-type": "application/json" } : {}),
      },
      body: corpo,
      cache: "no-store",
      signal: controle.signal,
    });
    let json: unknown = null;
    try { json = await r.json(); } catch { /* corpo não-JSON: tratado abaixo */ }
    const erro = (json as { error?: { code?: string; message?: string } } | null)?.error;
    if (r.status === 401 || r.status === 503) {
      return { ok: false, motivo: r.status === 401 ? "nao_autorizado" : "desligada", status: r.status,
        mensagem: r.status === 401 ? FRASE.nao_autorizado : "A integração está desligada do lado do Âncora." };
    }
    if (!r.ok) return { ok: false, motivo: "recusado", status: r.status, mensagem: erro?.message ?? FRASE.recusado, code: erro?.code };
    const data = (json as { data?: T } | null)?.data;
    if (data === undefined) return { ok: false, motivo: "resposta_invalida", status: r.status, mensagem: FRASE.resposta_invalida };
    return { ok: true, status: r.status, data };
  } catch {
    return { ok: false, motivo: "rede", status: 0, mensagem: FRASE.rede };
  } finally {
    clearTimeout(relogio);
  }
}

/** O estado de até 100 clientes por chamada; listas maiores vão em lotes. */
export async function lerEstadosNoAncora(ids: string[]): Promise<RespostaAncora<EstadoDoCliente[]>> {
  const todos: EstadoDoCliente[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { mensagem, url } = mensagemDoGet("/api/parceiro/convites", { refs: ids.slice(i, i + 100).join(",") });
    const r = await chamar<EstadoDoCliente[]>("GET", url, mensagem);
    if (!r.ok) return r;
    todos.push(...r.data);
  }
  return { ok: true, status: 200, data: todos };
}

export interface LinkGerado { ref_externa: string; estado: string; link: string; expira_em: string; criado: boolean }

export function gerarLinkNoAncora(corpo: Record<string, unknown>): Promise<RespostaAncora<LinkGerado>> {
  const texto = JSON.stringify(corpo);
  return chamar<LinkGerado>("POST", "/api/parceiro/convites", texto, texto);
}

/** Cancela o link ainda aberto do cliente (o cadastro já feito não é tocado). */
export function cancelarLinkNoAncora(clientId: string): Promise<RespostaAncora<{ cancelado: boolean }>> {
  const texto = JSON.stringify({ ref_externa: clientId });
  return chamar<{ cancelado: boolean }>("POST", "/api/parceiro/convites/cancelar", texto, texto);
}
