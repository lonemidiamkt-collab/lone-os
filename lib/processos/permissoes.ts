// lib/processos/permissoes.ts — quem pode o quê no Hub de Processos.
//
// Puro de propósito: permissão é a coisa que mais dá errado em silêncio, então precisa ser
// testável sem subir servidor. As rotas chamam daqui; esconder botão na tela NÃO é proteção
// (a lição está escrita em lib/api/require-role.ts).

import type { Papel } from "@/lib/api/require-role";
import type { AreaProcesso } from "./redator";

export type AcaoProcesso = "ver" | "criar" | "editar_rascunho" | "publicar" | "descontinuar";

/** Qual papel de login "manda" em cada área — quem pode escrever processo dela. */
const DONO_DA_AREA: Record<AreaProcesso, Papel[]> = {
  social: ["social", "designer"],
  traffic: ["traffic"],
  cs: ["social"],          // o CS é operado pelo time de social hoje
  comercial: ["comercial"],
  geral: [],               // área geral é da gestão
};

const GESTAO: Papel[] = ["admin", "manager"];

/**
 * Regra:
 *  · ver ................ todo mundo que tem login (processo escondido é processo não seguido)
 *  · criar/editar ....... gestão, ou quem é do setor daquela área
 *  · publicar ........... SÓ gestão. Publicar é dizer "isto é como a Lone trabalha".
 *  · descontinuar ....... SÓ gestão
 */
export function pode(papel: Papel | null, acao: AcaoProcesso, area: AreaProcesso): boolean {
  if (!papel) return false;
  if (acao === "ver") return true;
  if (GESTAO.includes(papel)) return true;
  if (acao === "publicar" || acao === "descontinuar") return false;
  return DONO_DA_AREA[area].includes(papel);
}

/** Áreas em que este papel consegue criar processo — usado pra montar a tela sem prometer o que a rota nega. */
export function areasQuePodeCriar(papel: Papel | null): AreaProcesso[] {
  const todas: AreaProcesso[] = ["social", "traffic", "cs", "comercial", "geral"];
  if (!papel) return [];
  return todas.filter((a) => pode(papel, "criar", a));
}
