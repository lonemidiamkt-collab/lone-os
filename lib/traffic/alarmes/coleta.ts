// lib/traffic/alarmes/coleta.ts — gasto e conversas POR CAMPANHA E POR DIA, de várias contas numa leitura só.
//
// Uma chamada em lote (batch da Graph API, até 50 contas) com `level=campaign&time_increment=1`: 15 dias
// (14 fechados + hoje) dão o histórico do alarme "sem conversa" e a série de 7 dias do ritmo da verba.
// Conversa = a mesma métrica do Gerenciador (lib/meta/messages.ts, janela 7d_click).
//
// Conta AUSENTE de `porConta` = a leitura falhou ou veio incompleta. Quem chama não julga essa conta: leitura que
// falha nunca vira "zero conversa" (é o erro que dispararia o alarme à toa).
//
// RELEITURA (26/10/2026): na rodada das 8h05 de segunda a Meta não devolveu 5 de 45 contas no lote — o horário em
// que várias rotinas consultam a Meta juntas — e elas ficaram sem vigilância até as 10h05. Agora a conta que falha
// no lote é pedida de novo SOZINHA, uma de cada vez, com espera crescente (como o saldo já faz em
// lib/meta/account-balance.ts). O motivo de quem continua falhando volta em `falhas` (antes era descartado).

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

export interface LeituraCampanhas {
  porConta: Map<string, DiaCampanha[]>;
  /** Conta → motivo, para as que não deu para ler nem na releitura. */
  falhas: Map<string, string>;
}

const LOTE = 50;
/** Páginas extras por conta (500 linhas cada). Conta com mais que isso fica de fora, nunca pela metade. */
const MAX_PAGINAS = 4;
/** Esperas antes de cada releitura individual. A segunda é longa o bastante para o limite de chamadas aliviar. */
export const ESPERAS_RELEITURA_MS = [2_000, 8_000];

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

/** O motivo que a Meta deu, curto: "Meta 17: User request limit reached". */
export function motivoDaMeta(status: number, corpo: string): string {
  try {
    const e = (JSON.parse(corpo) as { error?: { code?: number; message?: string } }).error;
    if (e?.message) return `Meta ${e.code ?? status}: ${e.message}`.slice(0, 140);
  } catch { /* corpo não é JSON */ }
  return `Meta respondeu ${status}`;
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

/** Uma página de resposta → linhas completas (seguindo a paginação), ou o motivo de não dar. */
async function linhasDaPagina(corpo: string): Promise<{ linhas: DiaCampanha[] } | { motivo: string }> {
  let p: Pagina;
  try { p = JSON.parse(corpo) as Pagina; } catch { return { motivo: "resposta ilegível da Meta" }; }
  let linhas = p.data ?? [];
  if (p.paging?.next) {
    const extra = await proximasPaginas(p.paging.next);
    if (extra === null) return { motivo: "leitura veio incompleta (paginação)" };
    linhas = [...linhas, ...extra];
  }
  return { linhas: converter(linhas) };
}

const esperarDeVerdade = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Gasto e conversas por campanha e dia, de `desde` a `ate` (inclusive, datas de São Paulo). */
export async function lerCampanhasPorDia(
  token: string,
  contas: string[],
  desde: string,
  ate: string,
  opts: { esperar?: (ms: number) => Promise<void> } = {},
): Promise<LeituraCampanhas> {
  const esperar = opts.esperar ?? esperarDeVerdade;
  const porConta = new Map<string, DiaCampanha[]>();
  const falhas = new Map<string, string>();
  const params = [
    "level=campaign",
    "fields=campaign_id,spend,actions",
    `time_range=${encodeURIComponent(JSON.stringify({ since: desde, until: ate }))}`,
    "time_increment=1",
    `action_attribution_windows=${encodeURIComponent('["7d_click"]')}`,
    "limit=500",
  ].join("&");
  const base = `${META_CONFIG.graphApiBase}/${META_CONFIG.graphApiVersion}`;

  // 1) O lote.
  for (let i = 0; i < contas.length; i += LOTE) {
    const lote = contas.slice(i, i + LOTE);
    const body = new URLSearchParams();
    body.set("access_token", token);
    body.set("batch", JSON.stringify(lote.map((id) => ({ method: "GET", relative_url: `${id}/insights?${params}` }))));
    let respostas: Array<{ code: number; body: string } | null>;
    try {
      const res = await fetch(`${base}/`, {
        method: "POST",
        body: body.toString(),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const motivo = motivoDaMeta(res.status, await res.text().catch(() => ""));
        for (const id of lote) falhas.set(id, motivo);
        continue;
      }
      respostas = await res.json();
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      for (const id of lote) falhas.set(id, motivo);
      continue;
    }
    for (let j = 0; j < lote.length; j++) {
      const item = respostas[j];
      if (!item) { falhas.set(lote[j], "a Meta não devolveu resposta para a conta"); continue; }
      if (item.code !== 200) { falhas.set(lote[j], motivoDaMeta(item.code, item.body)); continue; }
      const r = await linhasDaPagina(item.body);
      if ("linhas" in r) porConta.set(lote[j], r.linhas);
      else falhas.set(lote[j], r.motivo);
    }
  }

  // 2) Releitura: cada conta que falhou, sozinha e uma de cada vez (o lote é que esbarra no limite de chamadas).
  for (const id of [...falhas.keys()]) {
    for (const ms of ESPERAS_RELEITURA_MS) {
      await esperar(ms);
      try {
        const res = await fetch(`${base}/${id}/insights?${params}&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(30_000) });
        const corpo = await res.text();
        if (!res.ok) { falhas.set(id, motivoDaMeta(res.status, corpo)); continue; }
        const r = await linhasDaPagina(corpo);
        if ("linhas" in r) { porConta.set(id, r.linhas); falhas.delete(id); break; }
        falhas.set(id, r.motivo);
      } catch (e) {
        falhas.set(id, e instanceof Error ? e.message : String(e));
      }
    }
  }
  for (const [id, motivo] of falhas) console.warn(`[alarmes/coleta] ${id} sem leitura depois da releitura: ${motivo}`);
  return { porConta, falhas };
}
