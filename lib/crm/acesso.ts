// lib/crm/acesso.ts — QUEM entra no comercial. Um lugar só para todas as rotas, o menu e a página.
//
// Out/2026: o comercial passou a guardar a mensalidade negociada e a meta de MRR novo — dinheiro da
// agência. Decisão do Roberto: só ele usa. "admin" no Lone OS são os dois sócios (Roberto e Lucas);
// gestão e SDR saíram. Antes, `/api/crm/activities` e `/api/crm/metas` só pediam login: qualquer
// pessoa da equipe lia o histórico das negociações e podia mudar a meta chamando a rota direto.

import type { Papel } from "@/lib/api/require-role";

export const PAPEIS_COMERCIAL: Papel[] = ["admin"];

/** Para checagem no cliente (menu, página). A rota sempre confere de novo no servidor. */
export function podeVerComercial(papel: string | null | undefined): boolean {
  return !!papel && (PAPEIS_COMERCIAL as string[]).includes(papel);
}

/**
 * Nome de quem recebe os avisos do comercial no sino (notifications.target_user = nome do
 * colaborador, ver app/api/data/notifications). Antes o lembrete ia para o time todo, com o nome
 * dos leads.
 */
export const DESTINO_AVISOS_COMERCIAL = "Roberto Lino";
