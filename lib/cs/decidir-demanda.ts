// lib/cs/decidir-demanda.ts — quem decide o pedido do cliente pela plataforma, e o "voltar para
// pendente". PURO (tests/cs-decidir-demanda.test.ts); a rota é app/api/cs/decide.
//
// POR QUE (25/10/2026, auditoria de erro recuperável, 11.4). "Descartar pedido" no /agente era um
// clique, sem confirmar nem desfazer, e o POST aceitava qualquer pessoa logada — designer e comercial
// inclusive (o GET da mesma rota já os barrava, e o WhatsApp exige autoridade). O update não era
// conferido. O pedido descartado por engano só voltava por SQL, e o "ok" no WhatsApp respondia
// "já foi decidida".

import type { Papel } from "@/lib/api/require-role";

/** Quem lê a conversa do cliente e decide o pedido: gestão, social e tráfego (os mesmos do GET). */
export const PAPEIS_QUE_DECIDEM: readonly Papel[] = ["admin", "manager", "social", "traffic"];

export function podeDecidirDemanda(papel: Papel | null | undefined): boolean {
  return !!papel && PAPEIS_QUE_DECIDEM.includes(papel);
}

export const SEM_PERMISSAO_DECIDIR = "Só gestão, social e tráfego decidem o pedido do cliente. Nada foi alterado.";

/** Desfazer na tela: tempo em que o pedido descartado ainda mostra o "Desfazer" ao lado. */
export const DESFAZER_DESCARTE_S = 10;

/**
 * Pode voltar para pendente? Só o que foi DESCARTADO (o confirmado já virou card — desfaz no board).
 * E o código curto só é único entre as pendentes: se outro pedido pendente já usa o mesmo, não reabre.
 */
export function podeReabrir(d: { status: string | null | undefined }, codigoEmUso: boolean): { ok: true } | { ok: false; erro: string } {
  if (d.status === "pendente") return { ok: false, erro: "Esse pedido já está pendente." };
  if (d.status !== "descartada") return { ok: false, erro: "Só pedido descartado volta para pendente — o confirmado já virou card (desfaça no board)." };
  if (codigoEmUso) return { ok: false, erro: "Outro pedido pendente está usando o mesmo código agora. Peça de novo no grupo ou crie o card à mão." };
  return { ok: true };
}

/** Nome de quem decidiu: o do cadastro da equipe; sem cadastro, o começo do e-mail. */
export function nomeDeQuemDecide(nomeNoCadastro: string | null | undefined, email: string | null | undefined): string {
  return (nomeNoCadastro || "").trim() || (email || "").split("@")[0] || "equipe";
}
