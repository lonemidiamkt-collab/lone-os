// lib/conteudo/versoes.ts — AS VERSÕES DA ARTE, para comparar na revisão (Leva 7B, N17).
//
// Cada entrega é uma versão em creative_deliveries (V1, V2…), com o motivo da alteração que a
// provocou (revision_reason). Os arquivos de cada versão vêm do recibo da operação de entrega
// (ops_log, action "entregar_arte" → after.delivery.urls): os anexos do card mudam de dono a cada
// reentrega (delivery_id passa para a versão nova), o recibo não.
//
// Módulo puro (testado em tests/conteudo-versoes.test.ts); a rota é app/api/conteudo/versoes.

export interface VersaoArte {
  id: string;
  versao: number;
  por: string;
  em: string;
  /** A alteração pedida que gerou ESTA versão (null na V1). */
  motivo: string | null;
  urls: string[];
  substituida: boolean;
}

export interface LinhaEntrega {
  id: string;
  version: number;
  delivered_by?: string | null;
  delivered_at: string;
  status?: string | null;
  revision_reason?: string | null;
}

export interface LinhaReciboEntrega {
  after?: { delivery?: { id?: string; urls?: unknown } | null } | null;
}

export interface LinhaAnexoVersao {
  url: string;
  delivery_id?: string | null;
  position?: number | null;
}

function urlsDoRecibo(r: LinhaReciboEntrega): { id: string; urls: string[] } | null {
  const d = r.after?.delivery;
  if (!d?.id) return null;
  const urls = Array.isArray(d.urls) ? d.urls.filter((u): u is string => typeof u === "string" && !!u) : [];
  return { id: d.id, urls };
}

/** As versões, da mais nova para a mais velha. */
export function montarVersoes(
  entregas: readonly LinhaEntrega[],
  recibos: readonly LinhaReciboEntrega[],
  anexos: readonly LinhaAnexoVersao[] = [],
): VersaoArte[] {
  const porEntrega = new Map<string, string[]>();
  for (const r of recibos) {
    const u = urlsDoRecibo(r);
    if (u && u.urls.length && !porEntrega.has(u.id)) porEntrega.set(u.id, u.urls);
  }
  return [...entregas]
    .sort((a, b) => b.version - a.version)
    .map((e) => {
      const doRecibo = porEntrega.get(e.id);
      const doAnexo = anexos.filter((a) => a.delivery_id === e.id)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((a) => a.url);
      return {
        id: e.id,
        versao: e.version,
        por: e.delivered_by ?? "",
        em: e.delivered_at,
        motivo: e.revision_reason?.trim() || null,
        urls: doRecibo ?? doAnexo,
        substituida: e.status === "substituida",
      };
    });
}

export interface Comparacao {
  anterior: VersaoArte | null;
  atual: VersaoArte | null;
  /** O motivo fixado no topo. */
  motivo: string | null;
  /**
   * true = a alteração está PEDIDA e ainda não reentregue: o motivo é o que precisa mudar na versão
   * atual. false = a versão atual já é a resposta ao motivo (o social confere se foi atendido).
   */
  pendente: boolean;
}

/**
 * O par a comparar. Com alteração pendente, o motivo é o pedido em aberto (o designer vê o que
 * mudar); depois da reentrega, é o motivo gravado na versão nova (o social confere se foi atendido).
 */
export function parParaComparar(versoes: readonly VersaoArte[], alteracaoPendente?: string | null): Comparacao {
  const [atual = null, anterior = null] = versoes;
  const pendente = !!alteracaoPendente?.trim();
  return {
    atual,
    anterior,
    motivo: pendente ? alteracaoPendente!.trim() : atual?.motivo ?? null,
    pendente,
  };
}

/** Dá para comparar lado a lado? (duas versões com arquivo). */
export function podeComparar(versoes: readonly VersaoArte[]): boolean {
  return versoes.length >= 2 && versoes[0].urls.length > 0 && versoes[1].urls.length > 0;
}
