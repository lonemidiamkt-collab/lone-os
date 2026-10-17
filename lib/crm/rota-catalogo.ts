// lib/crm/rota-catalogo.ts — busca a lista de lojas na PÁGINA da rota (ROTA_PAGINA_URL) e guarda por
// 10 minutos na memória do servidor. Usado pelo cron crm-rota e pela aba Rota do comercial.

import { catalogoDaPagina, type LojaCatalogo } from "@/lib/crm/rota";

export const PAGINA_DA_ROTA = process.env.ROTA_PAGINA_URL || "https://rota-lagos.vercel.app/";
const TTL = 10 * 60 * 1000;
let guardado: { em: number; lojas: LojaCatalogo[] } | null = null;

export async function buscarCatalogo(p: { fresco?: boolean } = {}): Promise<LojaCatalogo[]> {
  if (!p.fresco && guardado && Date.now() - guardado.em < TTL) return guardado.lojas;
  const r = await fetch(PAGINA_DA_ROTA, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`página da rota respondeu HTTP ${r.status}`);
  const lojas = catalogoDaPagina(await r.text());
  guardado = { em: Date.now(), lojas };
  return lojas;
}
