// lib/academy/cliente.ts — o Lone OS falando com a Lone Academy (servidor → servidor).
//
// 04/11/2026. A Academy é a plataforma de treinamento do time dos clientes. A gestão libera por
// cliente, aqui na ficha; a Academy cria a empresa, o convite do dono e manda o e-mail de acesso.
// Bancos separados de propósito: um incidente num sistema não abre o outro.
//
// Env: ACADEMY_URL (ex.: https://academy.lonemidia.com) e ACADEMY_SHARED_SECRET (o mesmo
// LONE_OS_SHARED_SECRET da Academy; openssl rand -hex 32). Sem eles, a integração diz que está
// desligada — nunca finge que liberou (docs/ERRO_RECUPERAVEL.md, ponto 5).
//
// Nunca lança: devolve { ok, status, data, erro } com a frase pronta para a tela.

import { assinar, textoAssinado } from "./assinatura";

const CAMINHO = "/api/integracao/lone-os";

export type SituacaoAcademy = "active" | "paused" | "closed";

export interface StatusAcademy {
  existe: boolean;
  empresaId?: string;
  situacao?: SituacaoAcademy;
  assentos?: { limite: number; emUso: number };
  gestor?: { email: string | null; convite: "pendente" | "aceito" | "vencido" | "nenhum"; enviadoEm: string | null; expiraEm: string | null; aceitoEm: string | null };
  ativos7d?: number;
  ultimoAcesso?: string | null;
}

export interface RespostaAcademy extends StatusAcademy {
  resultado?: "convite_enviado" | "convite_reenviado" | "convite_ja_enviado" | "dono_ja_tem_acesso" | "situacao_alterada";
  email?: { enviado: true; id?: string } | { enviado: false; motivo: string };
  /** Link de primeiro acesso: plano B quando o e-mail não sai (mandar pelo WhatsApp). */
  link?: string;
}

export interface Retorno<T> { ok: boolean; status: number; data: T | null; erro: string | null }

export function academyConfigurada(): boolean {
  return !!process.env.ACADEMY_URL && (process.env.ACADEMY_SHARED_SECRET?.length ?? 0) >= 32;
}

async function chamarAcademy<T>(metodo: "GET" | "POST", corpo?: unknown, query?: string): Promise<Retorno<T>> {
  const base = process.env.ACADEMY_URL?.replace(/\/$/, "");
  const segredo = process.env.ACADEMY_SHARED_SECRET;
  if (!base || !segredo || segredo.length < 32) {
    return { ok: false, status: 503, data: null, erro: "Integração com a Lone Academy desligada: falta ACADEMY_URL ou ACADEMY_SHARED_SECRET no servidor." };
  }
  const caminho = CAMINHO + (query ? `?${query}` : "");
  const texto = metodo === "GET" ? "" : JSON.stringify(corpo);
  const ts = String(Math.floor(Date.now() / 1000));
  try {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { "content-type": "application/json", "x-lone-timestamp": ts, "x-lone-assinatura": assinar(segredo, textoAssinado(ts, metodo, caminho, texto)) },
      body: metodo === "GET" ? undefined : texto,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const json = (await r.json().catch(() => null)) as (T & { erro?: string }) | null;
    if (!r.ok) {
      const erro = json?.erro ?? (r.status >= 500 ? "A Lone Academy não respondeu direito agora. Tente de novo em instantes." : `A Lone Academy recusou o pedido (erro ${r.status}).`);
      return { ok: false, status: r.status, data: json, erro };
    }
    return { ok: true, status: r.status, data: json, erro: null };
  } catch (e) {
    console.error("[academy] sem resposta:", e);
    return { ok: false, status: 0, data: null, erro: "Não consegui falar com a Lone Academy (sem resposta). Tente de novo em instantes." };
  }
}

export const statusNaAcademy = (clienteId: string) =>
  chamarAcademy<StatusAcademy>("GET", undefined, `cliente=${encodeURIComponent(clienteId)}`);

export const liberarNaAcademy = (p: { clienteId: string; nome: string; gestor: { nome: string; email: string; cargo?: string }; assentos?: number }) =>
  chamarAcademy<RespostaAcademy>("POST", { acao: "liberar", cliente: { id: p.clienteId, nome: p.nome }, gestor: p.gestor, assentos: p.assentos });

export const reenviarNaAcademy = (p: { clienteId: string; nome: string; gestor: { nome: string; email: string; cargo?: string } }) =>
  chamarAcademy<RespostaAcademy>("POST", { acao: "reenviar", cliente: { id: p.clienteId, nome: p.nome }, gestor: p.gestor });

export const situacaoNaAcademy = (clienteId: string, situacao: SituacaoAcademy) =>
  chamarAcademy<RespostaAcademy>("POST", { acao: "situacao", cliente: { id: clienteId }, situacao });

/**
 * O que a Academy deveria estar mostrando para este cliente. Só o ENCERRAMENTO fecha a Academy:
 * a pausa do Lone OS para o que sai para o cliente (grupo, relatório, portal), e pode voltar sozinha
 * pela data — o treinamento do time dele não precisa parar junto. Pausa na Academy, se precisar,
 * é decisão da Lone no admin da Academy.
 */
export function situacaoEsperada(c: { active?: boolean | null; churned_at?: string | null }): SituacaoAcademy {
  return c.active === false || c.churned_at ? "closed" : "active";
}
