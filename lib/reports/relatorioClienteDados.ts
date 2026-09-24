// lib/reports/relatorioClienteDados.ts — lê da Meta o que o relatório do cliente precisa (server-only).
// As contas ficam em relatorioCliente.ts (puro); aqui só as chamadas.
//
// Custo: ~8 leituras por cliente, qualquer que seja o número de campanhas (o relatório antigo fazia 3
// POR CAMPANHA — o Império, com 165, passava de 500 chamadas). Todas pela conta, com atribuição de
// 7 dias após o clique (a coluna "Resultados" do Gerenciador).
//
// O que é essencial e o que não é:
//   - período atual (campanha × dia) → sem ele NÃO há relatório: lança.
//   - período anterior, alcance, conjuntos, anúncios, público, miniaturas → se falhar, o PDF sai sem
//     aquela parte (e o motivo vai pro log). Relatório sem comparação é melhor que relatório nenhum;
//     número inventado é pior que os dois.

import { getGraphUrl } from "@/lib/meta/config";
import { metaJson } from "@/lib/meta/fetch";
import { fetchAccountReach } from "@/lib/meta/insights-server";
import {
  montarRelatorio, janelaAnterior,
  type Janela, type LinhaCampanhaDia, type LinhaConjunto, type LinhaAnuncio, type LinhaDemografia,
  type RelatorioAnuncios,
} from "./relatorioCliente";

const ATRIBUICAO = '["7d_click"]';

async function lerPaginado<T>(primeira: string, label: string, maxPaginas = 10): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = primeira;
  for (let i = 0; url && i < maxPaginas; i++) {
    const pagina: { data?: T[]; paging?: { next?: string } } = await metaJson(url, { label: `${label} p${i + 1}`, timeoutMs: 30_000 });
    out.push(...(pagina.data ?? []));
    url = pagina.paging?.next ?? null;
  }
  return out;
}

const intervalo = (j: Janela) => JSON.stringify({ since: j.inicio, until: j.fim });

export function lerCampanhasPorDia(token: string, conta: string, j: Janela): Promise<LinhaCampanhaDia[]> {
  const p = new URLSearchParams({
    access_token: token,
    level: "campaign",
    fields: "campaign_id,campaign_name,objective,date_start,spend,impressions,clicks,inline_link_clicks,actions",
    time_range: intervalo(j),
    time_increment: "1",
    action_attribution_windows: ATRIBUICAO,
    limit: "500",
  });
  return lerPaginado(`${getGraphUrl(`/${conta}/insights`)}?${p}`, `relatório campanhas ${conta} ${j.inicio}→${j.fim}`, 20);
}

export function lerConjuntos(token: string, conta: string, j: Janela): Promise<LinhaConjunto[]> {
  // SÓ campos que existem no /insights. O relatório antigo pedia `effective_status` aqui — a Meta
  // recusava a chamada inteira e o card "melhor conjunto" saía sem nome (ver relatorioCliente.ts).
  const p = new URLSearchParams({
    access_token: token,
    level: "adset",
    fields: "adset_id,adset_name,campaign_name,objective,spend,actions",
    time_range: intervalo(j),
    action_attribution_windows: ATRIBUICAO,
    limit: "200",
  });
  return lerPaginado(`${getGraphUrl(`/${conta}/insights`)}?${p}`, `relatório conjuntos ${conta}`, 5);
}

export function lerAnuncios(token: string, conta: string, j: Janela): Promise<LinhaAnuncio[]> {
  const p = new URLSearchParams({
    access_token: token,
    level: "ad",
    fields: "ad_id,ad_name,campaign_name,objective,spend,impressions,actions",
    time_range: intervalo(j),
    action_attribution_windows: ATRIBUICAO,
    limit: "300",
  });
  return lerPaginado(`${getGraphUrl(`/${conta}/insights`)}?${p}`, `relatório anúncios ${conta}`, 5);
}

export function lerDemografia(token: string, conta: string, j: Janela): Promise<LinhaDemografia[]> {
  const p = new URLSearchParams({
    access_token: token,
    fields: "reach,impressions",
    breakdowns: "age,gender",
    time_range: intervalo(j),
    limit: "200",
  });
  return lerPaginado(`${getGraphUrl(`/${conta}/insights`)}?${p}`, `relatório público ${conta}`, 3);
}

const MAX_MINIATURA = 350_000;

/** Miniatura do anúncio embutida no HTML (data: URI). A URL da CDN da Meta expira em horas e o PDF
 *  não pode depender dela; embutida, o arquivo fica igual para sempre. null se qualquer coisa falhar. */
export async function miniaturaDoAnuncio(token: string, adId: string): Promise<string | null> {
  try {
    const p = new URLSearchParams({
      access_token: token,
      fields: "creative.thumbnail_width(240).thumbnail_height(240){thumbnail_url,image_url}",
    });
    const ad = await metaJson<{ creative?: { thumbnail_url?: string; image_url?: string } }>(
      `${getGraphUrl(`/${adId}`)}?${p}`, { label: `miniatura ${adId}`, timeoutMs: 8_000, tentativas: 2 },
    );
    const url = ad.creative?.thumbnail_url || ad.creative?.image_url;
    if (!url) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const tipo = res.headers.get("content-type") ?? "";
    if (!res.ok || !tipo.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_MINIATURA) return null;
    return `data:${tipo.split(";")[0]};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const motivo = (r: PromiseSettledResult<unknown>) => (r.status === "rejected" ? String(r.reason).slice(0, 160) : "");

/**
 * O relatório de anúncios de UMA conta numa janela. Lança se o período atual não puder ser lido.
 * Devolve null quando a conta não veiculou nem no período nem no anterior (não há o que relatar).
 */
export async function lerRelatorioAnuncios(
  token: string,
  conta: string,
  janela: Janela,
  rotuloLog = conta,
): Promise<RelatorioAnuncios | null> {
  const anterior = janelaAnterior(janela);
  const [atualR, antR, alcR, alcAntR, conjR, anR, demoR] = await Promise.allSettled([
    lerCampanhasPorDia(token, conta, janela),
    lerCampanhasPorDia(token, conta, anterior),
    fetchAccountReach(token, conta, janela.dias, janela.inicio, janela.fim),
    fetchAccountReach(token, conta, anterior.dias, anterior.inicio, anterior.fim),
    lerConjuntos(token, conta, janela),
    lerAnuncios(token, conta, janela),
    lerDemografia(token, conta, janela),
  ]);
  if (atualR.status === "rejected") throw atualR.reason instanceof Error ? atualR.reason : new Error(String(atualR.reason));

  const falhas = [
    antR.status === "rejected" && `anterior: ${motivo(antR)}`,
    conjR.status === "rejected" && `conjuntos: ${motivo(conjR)}`,
    anR.status === "rejected" && `anúncios: ${motivo(anR)}`,
    demoR.status === "rejected" && `público: ${motivo(demoR)}`,
  ].filter(Boolean);
  if (falhas.length) console.error(`[relatorio-cliente] ${rotuloLog}: parte do relatório sem dado — ${falhas.join(" | ")}`);

  const linhas = atualR.value;
  const linhasAnt = antR.status === "fulfilled" ? antR.value : null;
  if (linhas.length === 0 && (!linhasAnt || linhasAnt.length === 0)) return null;

  const alcance = alcR.status === "fulfilled" ? alcR.value : null;
  if (alcance == null && linhas.length > 0) {
    // Sem o alcance DEDUPLICADO o PDF omite a métrica — somar campanha a campanha conta a mesma pessoa
    // várias vezes (o erro de junho). Fica no log porque relatório torto em silêncio foi o problema.
    console.error(`[relatorio-cliente] ${rotuloLog}: alcance deduplicado indisponível — PDF sai sem alcance`);
  }

  const r = montarRelatorio({
    janela,
    anterior: linhasAnt ? { janela: anterior, linhas: linhasAnt, alcance: alcAntR.status === "fulfilled" ? alcAntR.value : null } : null,
    linhas,
    alcance,
    conjuntos: conjR.status === "fulfilled" ? conjR.value : null,
    anuncios: anR.status === "fulfilled" ? anR.value : null,
    demografia: demoR.status === "fulfilled" ? demoR.value : null,
  });

  // Miniaturas só dos que aparecem (3 no máximo), em paralelo.
  const minis = await Promise.all(r.criativos.map((c) => miniaturaDoAnuncio(token, c.id)));
  r.criativos = r.criativos.map((c, i) => ({ ...c, miniatura: minis[i] }));
  return r;
}
