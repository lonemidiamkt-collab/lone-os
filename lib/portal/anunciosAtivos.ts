// lib/portal/anunciosAtivos.ts — a lista "Ver todos os anúncios ativos" do portal do cliente.
// Puro (sem Meta, sem Supabase): recebe o que lib/meta/api.ts#getActiveAdsWithInsights trouxe e
// devolve o pedaço que entra no snapshot público. Testado em tests/portal-anuncios-ativos.test.ts.
//
// Regras:
//  - Todo anúncio ATIVO entra, inclusive o que não trouxe conversa ou nem veiculou no período —
//    o cliente pediu pra ver "todos", e esconder o que não funcionou seria maquiar o painel.
//  - Limite de LIMITE_ANUNCIOS_ATIVOS: conta com centenas de anúncios não pode inchar o snapshot
//    (ele é gravado em JSON por período e vai inteiro pro celular). Ficam os que mais renderam;
//    `total` diz quantos existem.
//  - Só campos do próprio anúncio: nada de conta, campanha, público, orçamento ou status interno.

import { countMessagesFromActions } from "@/lib/meta/messages";
import type { ActiveAdItem, ActiveAdsList } from "./types";

export const LIMITE_ANUNCIOS_ATIVOS = 60;

export type CriterioAnuncios = "resultado" | "custo";

interface AnuncioMeta {
  id: string;
  name?: string;
  creative?: { thumbnail_url?: string };
}

interface InsightMeta {
  ad_id: string;
  spend?: string;
  clicks?: string;
  actions?: { action_type: string; value: string }[];
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Mais conversas primeiro; empate → quem investiu mais; depois o nome (ordem estável). */
function porResultado(a: ActiveAdItem, b: ActiveAdItem): number {
  return b.messages - a.messages || b.spend - a.spend || a.name.localeCompare(b.name, "pt-BR");
}

/** Menor custo por conversa primeiro. Sem conversa vai pro fim (com verba antes de sem veiculação). */
function porCusto(a: ActiveAdItem, b: ActiveAdItem): number {
  if (a.cpa != null && b.cpa != null) return a.cpa - b.cpa || b.messages - a.messages;
  if (a.cpa != null) return -1;
  if (b.cpa != null) return 1;
  return b.spend - a.spend || a.name.localeCompare(b.name, "pt-BR");
}

export function ordenarAnuncios(items: readonly ActiveAdItem[], criterio: CriterioAnuncios): ActiveAdItem[] {
  return [...items].sort(criterio === "custo" ? porCusto : porResultado);
}

export function montarAnunciosAtivos(
  ads: readonly AnuncioMeta[],
  insights: readonly InsightMeta[],
  opts: {
    limite?: number;
    thumbPaths?: ReadonlyMap<string, string | null>;
    /** Como contar o resultado de um anúncio (N4: o tipo do período — conversas, leads ou compras).
     *  Padrão: conversas. */
    contar?: (actions?: { action_type: string; value: string }[]) => number;
  } = {},
): ActiveAdsList {
  const limite = opts.limite ?? LIMITE_ANUNCIOS_ATIVOS;
  const contar = opts.contar ?? countMessagesFromActions;

  // A Meta pode devolver mais de uma linha por anúncio (paginação/atribuição): soma.
  const porAnuncio = new Map<string, { spend: number; clicks: number; messages: number }>();
  for (const r of insights) {
    if (!r?.ad_id) continue;
    const atual = porAnuncio.get(r.ad_id) ?? { spend: 0, clicks: 0, messages: 0 };
    atual.spend += parseFloat(r.spend ?? "") || 0;
    atual.clicks += parseInt(r.clicks ?? "", 10) || 0;
    atual.messages += contar(r.actions);
    porAnuncio.set(r.ad_id, atual);
  }

  const vistos = new Set<string>();
  const items: ActiveAdItem[] = [];
  for (const ad of ads) {
    if (!ad?.id || vistos.has(ad.id)) continue;
    vistos.add(ad.id);
    const n = porAnuncio.get(ad.id) ?? { spend: 0, clicks: 0, messages: 0 };
    items.push({
      id: ad.id,
      name: (ad.name ?? "").trim() || "Anúncio sem nome",
      thumbnail_url: ad.creative?.thumbnail_url || null,
      thumbnail_path: opts.thumbPaths?.get(ad.id) ?? null,
      messages: n.messages,
      spend: centavos(n.spend),
      cpa: n.messages > 0 ? centavos(n.spend / n.messages) : null,
      clicks: n.clicks,
    });
  }

  return {
    items: ordenarAnuncios(items, "resultado").slice(0, Math.max(0, limite)),
    total: items.length,
    with_messages: items.filter((a) => a.messages > 0).length,
  };
}

/** Situação do anúncio no período, pro selo da lista. */
export type SituacaoAnuncio = "com_resultado" | "sem_resultado" | "sem_veiculacao";

export function situacaoAnuncio(a: Pick<ActiveAdItem, "messages" | "spend">): SituacaoAnuncio {
  if (a.messages > 0) return "com_resultado";
  return a.spend > 0 ? "sem_resultado" : "sem_veiculacao";
}
