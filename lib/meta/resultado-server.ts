// lib/meta/resultado-server.ts — resultado por DIA de uma conta, somando o resultado de cada
// campanha pelo objetivo dela (lib/meta/resultado.ts). Server-only (chama a Graph API).
//
// Custa UMA leitura paginada por conta (nível campanha, um dia por linha). Quem chama só paga essa
// leitura quando a conta tem lead ou compra na leitura da conta — conta só de WhatsApp continua com a
// leitura de sempre (conversas), sem chamada extra.

import { getGraphUrl } from "@/lib/meta/config";
import { metaJson } from "@/lib/meta/fetch";
import { resultadoDaCampanha, somarResultados, type ResultadoCampanha, type ResultadoSomado } from "@/lib/meta/resultado";

interface LinhaCampanhaDia {
  campaign_id?: string;
  objective?: string;
  date_start?: string;
  actions?: { action_type: string; value: string }[];
}

/** Map "AAAA-MM-DD" → resultado somado das campanhas naquele dia. Lança se a leitura falhar. */
export async function resultadosPorDia(
  accountId: string,
  token: string,
  desde: string,
  ate: string,
): Promise<Map<string, ResultadoSomado>> {
  const params = new URLSearchParams({
    access_token: token,
    level: "campaign",
    fields: "campaign_id,objective,date_start,actions",
    time_range: JSON.stringify({ since: desde, until: ate }),
    action_attribution_windows: '["7d_click"]',
    time_increment: "1",
    limit: "500",
  });
  let url: string | null = `${getGraphUrl(`/${accountId}/insights`)}?${params}`;
  const porDia = new Map<string, ResultadoCampanha[]>();
  let paginas = 0;
  while (url && paginas < 20) {
    const json: { data?: LinhaCampanhaDia[]; paging?: { next?: string } } =
      await metaJson(url, { label: `resultado por objetivo ${accountId}`, timeoutMs: 30_000 });
    for (const r of json.data ?? []) {
      if (!r.date_start) continue;
      const lista = porDia.get(r.date_start) ?? [];
      lista.push(resultadoDaCampanha(r.objective, r.actions));
      porDia.set(r.date_start, lista);
    }
    url = json.paging?.next ?? null;
    paginas++;
  }
  const out = new Map<string, ResultadoSomado>();
  for (const [dia, itens] of porDia) out.set(dia, somarResultados(itens));
  return out;
}
