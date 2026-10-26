// lib/portal/token.ts — o cliente dono de um link do portal.
//
// Mesma regra para a página (app/portal/[token]/page.tsx) e para todas as rotas públicas do portal:
// link revogado, portal desligado, ex-cliente (inativo/arquivado) e cliente pausado não acessam.
//
// ERRO DO BANCO NÃO É LINK INVÁLIDO (26/10/2026). Quando o banco oscilava por um instante (a queda de
// 16/10, o 22/10 às 16h46), a leitura falhava e caía no mesmo caminho do link errado: o cliente via
// "página não encontrada" num link que funciona — e o time ouvia "o link do painel não funciona".
// Agora a leitura tem três desfechos: ok, inválido (404) e indisponível (503 / "tente de novo").

import { supabaseAdmin } from "@/lib/supabase/server";
import { estaPausado } from "@/lib/clients/pausa";

/** Colunas que a regra de acesso precisa — toda leitura do link inclui estas. */
export const COLUNAS_ACESSO = "public_report_enabled, public_report_token_revoked_at, active, churned_at, paused_at, paused_until";

export interface LinhaDeAcesso {
  public_report_enabled?: boolean | null;
  public_report_token_revoked_at?: string | null;
  active?: boolean | null;
  churned_at?: string | null;
  paused_at?: string | null;
  paused_until?: string | null;
}

export type LeituraDoLink<T> =
  | { estado: "ok"; linha: T }
  | { estado: "invalido" }
  | { estado: "indisponivel"; erro: string };

/**
 * Todo link do portal é um UUID (a coluna é uuid). Link cortado ao colar no WhatsApp ou digitado errado
 * nem vai ao banco: lá ele vira erro de sintaxe (22P02), que não é o banco fora do ar (26/10/2026).
 */
const FORMATO_DO_LINK = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Frase para o cliente quando a leitura falhou (não é o link). */
export const FRASE_INDISPONIVEL = "Não consegui abrir seu painel agora. Tente de novo em instantes.";

/** O link pode abrir? (revogado, desligado, ex-cliente e pausado não.) */
export function linkLiberado(c: LinhaDeAcesso, agora: Date = new Date()): boolean {
  return !!c.public_report_enabled && !c.public_report_token_revoked_at && c.active !== false && !c.churned_at
    && !estaPausado(c, agora);
}

/**
 * Decide pelo resultado da leitura. `PGRST116` é o "nenhuma linha" do `.single()` e `22P02` é o texto
 * que não é UUID — isso sim é link que não existe. Qualquer outro erro é o banco indisponível, não o link.
 */
export function estadoDaLeitura<T extends LinhaDeAcesso>(
  linha: T | null,
  erro: { message?: string; code?: string } | null,
  agora: Date = new Date(),
): LeituraDoLink<T> {
  if (erro && erro.code !== "PGRST116" && erro.code !== "22P02") return { estado: "indisponivel", erro: erro.message || "erro ao ler o link" };
  if (!linha || !linkLiberado(linha, agora)) return { estado: "invalido" };
  return { estado: "ok", linha };
}

/** Lê o cliente do link com as colunas pedidas (mais as da regra de acesso). Nunca lança. */
export async function lerLinkDoPortal<T extends LinhaDeAcesso = LinhaDeAcesso & { id: string }>(
  token: string,
  colunas = "id",
): Promise<LeituraDoLink<T>> {
  if (!token || !FORMATO_DO_LINK.test(token)) return { estado: "invalido" };
  try {
    const { data, error } = await supabaseAdmin
      .from("clients")
      .select(`${colunas}, ${COLUNAS_ACESSO}`)
      .eq("public_report_token", token)
      .maybeSingle();
    const leitura = estadoDaLeitura((data as unknown as T | null) ?? null, error);
    if (leitura.estado === "indisponivel") console.error("[portal] leitura do link falhou:", leitura.erro);
    return leitura;
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[portal] leitura do link falhou:", erro);
    return { estado: "indisponivel", erro };
  }
}

export interface ClienteDoPortal { id: string; nome: string }

/** O cliente do link para as rotas que só precisam de id e nome. */
export async function clienteDoLink(token: string): Promise<LeituraDoLink<ClienteDoPortal>> {
  const l = await lerLinkDoPortal<LinhaDeAcesso & { id: string; name?: string | null; nome_fantasia?: string | null }>(token, "id, name, nome_fantasia");
  if (l.estado !== "ok") return l;
  return { estado: "ok", linha: { id: l.linha.id, nome: l.linha.nome_fantasia || l.linha.name || "Cliente" } };
}

/** Compatível com quem só quer "o cliente ou null" (trata indisponível como ausente — prefira clienteDoLink). */
export async function clienteDoToken(token: string): Promise<ClienteDoPortal | null> {
  const l = await clienteDoLink(token);
  return l.estado === "ok" ? l.linha : null;
}
