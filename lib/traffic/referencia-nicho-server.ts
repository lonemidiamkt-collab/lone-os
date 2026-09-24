// lib/traffic/referencia-nicho-server.ts — carrega a referência por nicho (Leva 7A, N6). Server-only.
// Regras em lib/traffic/referencia-nicho.ts. Fonte: metric_snapshots (dias FECHADOS, gravados pelo
// defense-scan) dos últimos 30 dias + clients.nicho. Nenhuma chamada à Meta.

import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizarNicho, ROTULO_NICHO, type Nicho } from "@/lib/cs/nicho";
import { faltaNoBanco } from "@/lib/trafego/anuncios-server";
import { temTrafego } from "@/lib/clients/servico";
import { metricasDoCliente, referenciasPorNicho, type DiaCliente, type Metricas30d, type ReferenciaNicho } from "@/lib/traffic/referencia-nicho";

const somarDias = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

type Linha = DiaCliente & { client_id: string };

/** metric_snapshots de uma janela, paginado (a API corta em 1000 linhas), com o resultado pelo objetivo quando existe. */
export async function lerMetricasJanela(desde: string, ate: string): Promise<Linha[]> {
  const ler = async (cols: string) => {
    const out: Linha[] = [];
    for (let de = 0; de < 100_000; de += 1000) {
      const { data, error } = await supabaseAdmin.from("metric_snapshots").select(cols)
        .gte("metric_date", desde).lte("metric_date", ate).order("metric_date").range(de, de + 999);
      if (error) return { out, error };
      out.push(...((data ?? []) as unknown as Linha[]));
      if (!data || data.length < 1000) break;
    }
    return { out, error: null };
  };
  const completo = await ler("client_id, metric_date, spend, impressions, clicks, conversions, results, result_kind");
  if (!completo.error) return completo.out;
  if (!faltaNoBanco(completo.error)) throw new Error(completo.error.message);
  const basico = await ler("client_id, metric_date, spend, impressions, clicks, conversions");
  if (basico.error) throw new Error(basico.error.message);
  return basico.out;
}

export interface ReferenciasCarregadas {
  desde: string;
  ate: string;
  porNicho: Map<string, ReferenciaNicho>;
  /** Cada cliente de tráfego: nicho normalizado e os próprios números de 30 dias. */
  porCliente: Map<string, { nicho: Nicho | null; rotuloNicho: string | null; m: Metricas30d }>;
}

export async function carregarReferencias(ontem: string): Promise<ReferenciasCarregadas> {
  const desde = somarDias(ontem, -29);
  const [{ data: clientes, error }, linhas] = await Promise.all([
    supabaseAdmin.from("clients").select("id, nicho, service_type, active, churned_at"),
    lerMetricasJanela(desde, ontem),
  ]);
  if (error) throw new Error(error.message);
  const porClienteDias = new Map<string, DiaCliente[]>();
  for (const l of linhas) {
    const lista = porClienteDias.get(l.client_id) ?? [];
    lista.push(l);
    porClienteDias.set(l.client_id, lista);
  }
  const porCliente: ReferenciasCarregadas["porCliente"] = new Map();
  for (const c of clientes ?? []) {
    if (c.active === false || c.churned_at || !temTrafego(c as never)) continue;
    const dias = porClienteDias.get(c.id as string);
    if (!dias?.length) continue;
    // "Outro" junta ramos que não têm nada a ver entre si: não vira referência de ninguém.
    const n = normalizarNicho(c.nicho as string | null);
    const nicho = n === "outro" ? null : n;
    porCliente.set(c.id as string, { nicho, rotuloNicho: nicho ? ROTULO_NICHO[nicho] : null, m: metricasDoCliente(dias) });
  }
  const porNicho = referenciasPorNicho([...porCliente.values()].map((v) => ({ nicho: v.nicho, m: v.m })));
  return { desde, ate: ontem, porNicho, porCliente };
}
