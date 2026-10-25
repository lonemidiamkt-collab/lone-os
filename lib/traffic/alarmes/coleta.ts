// lib/traffic/alarmes/coleta.ts — gasto e conversas POR CAMPANHA E POR DIA, de várias contas numa leitura só.
//
// Uma chamada em lote (batch da Graph API, até 50 contas) com `level=campaign&time_increment=1`: 15 dias
// (14 fechados + hoje) dão o histórico do alarme "sem conversa" e a série de 7 dias do ritmo da verba.
// Conversa = a mesma métrica do Gerenciador (lib/meta/messages.ts, janela 7d_click).
//
// Conta AUSENTE do mapa = a leitura falhou ou veio incompleta. Quem chama não julga essa conta: leitura que
// falha nunca vira "zero conversa" (é o erro que dispararia o alarme à toa).

import { META_CONFIG } from "@/lib/meta/config";
import { countMessagesFromActions } from "@/lib/meta/messages";
import type { DiaCampanha } from "./sem-conversa";

export interface LinhaMeta {
  date_start?: string;
  campaign_id?: string;
  spend?: string;
  actions?: { action_type: string; value: string }[];
}

interface Pagina { data?: LinhaMeta[]; paging?: { next?: string } }

const LOTE = 50;
/** Páginas extras por conta (500 linhas cada). Conta com mais que isso fica de fora, nunca pela metade. */
const MAX_PAGINAS = 4;

/** Linhas da Meta → DiaCampanha. Exportada para o ensaio com dado real usar a mesma conversão. */
export function converter(rows: LinhaMeta[]): DiaCampanha[] {
  const out: DiaCampanha[] = [];
  for (const r of rows) {
    if (!r.date_start || !r.campaign_id) continue;
    const gasto = parseFloat(r.spend ?? "0");
    out.push({
      data: r.date_start,
      campanhaId: r.campaign_id,
      gasto: Number.isFinite(gasto) && gasto > 0 ? gasto : 0,
      conversas: countMessagesFromActions(r.actions),
    });
  }
  return out;
}

async function proximasPaginas(next: string | undefined): Promise<LinhaMeta[] | null> {
  const extra: LinhaMeta[] = [];
  let url = next;
  for (let i = 0; url && i < MAX_PAGINAS; i++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const p = (await res.json()) as Pagina;
    extra.push(...(p.data ?? []));
    url = p.paging?.next;
  }
  return url ? null : extra; // ainda tinha página: incompleta
}

/** Gasto e conversas por campanha e dia, de `desde` a `ate` (inclusive, datas de São Paulo). */
export async function lerCampanhasPorDia(
  token: string,
  contas: string[],
  desde: string,
  ate: string,
): Promise<Map<string, DiaCampanha[]>> {
  const out = new Map<string, DiaCampanha[]>();
  const params = [
    "level=campaign",
    "fields=campaign_id,spend,actions",
    `time_range=${encodeURIComponent(JSON.stringify({ since: desde, until: ate }))}`,
    "time_increment=1",
    `action_attribution_windows=${encodeURIComponent('["7d_click"]')}`,
    "limit=500",
  ].join("&");

  for (let i = 0; i < contas.length; i += LOTE) {
    const lote = contas.slice(i, i + LOTE);
    const body = new URLSearchParams();
    body.set("access_token", token);
    body.set("batch", JSON.stringify(lote.map((id) => ({ method: "GET", relative_url: `${id}/insights?${params}` }))));
    let respostas: Array<{ code: number; body: string } | null>;
    try {
      const res = await fetch(`${META_CONFIG.graphApiBase}/${META_CONFIG.graphApiVersion}/`, {
        method: "POST",
        body: body.toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) { console.error("[alarmes/coleta] lote HTTP", res.status); continue; }
      respostas = await res.json();
    } catch (e) {
      console.error("[alarmes/coleta] lote:", e instanceof Error ? e.message : e);
      continue;
    }
    for (let j = 0; j < lote.length; j++) {
      const item = respostas[j];
      if (!item || item.code !== 200) continue;
      try {
        const p = JSON.parse(item.body) as Pagina;
        let linhas = p.data ?? [];
        if (p.paging?.next) {
          const extra = await proximasPaginas(p.paging.next);
          if (extra === null) continue; // incompleta: fica de fora
          linhas = [...linhas, ...extra];
        }
        out.set(lote[j], converter(linhas));
      } catch {
        // corpo ilegível = leitura falhou; conta fica fora do mapa
      }
    }
  }
  return out;
}

