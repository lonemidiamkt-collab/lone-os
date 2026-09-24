// RESULTADO DE ONTEM — o lado bom do alerta de queda.
//
// PRA QUE (Roberto, 24/09): "poderia ser em PDF e poderíamos ter um falando as que estão com bons
// resultados". O alerta das 9h30 só falava de queda; quem foi bem ficava invisível, e é justamente
// o que dá pra mostrar ao cliente e o que merece mais verba.
//
// Fonte: metric_snapshots (um dia FECHADO por cliente, gravado pelo defense-scan). Ontem contra a
// média dos 7 dias anteriores da própria conta — nunca o dia em andamento, que distorce tudo.

import { supabaseAdmin } from "@/lib/supabase/server";
import { clienteDoHoje, type ClienteHojeRow } from "@/lib/traffic/hoje/montar";
import { lerMetricasDiarias } from "@/lib/traffic/hoje/carregar";
import { ROTULO_RESULTADO, comoTipoResultado, type TipoResultadoConta } from "@/lib/meta/resultado";

export interface DiaConta {
  metric_date: string;
  spend: number;
  /** Resultado pelo objetivo (Leva 7A): conversas, leads ou compras. */
  conversions: number;
  tipo?: TipoResultadoConta | null;
}

export interface FoiBem {
  clientId: string;
  nome: string;
  conversas: number;
  mediaConversas: number;
  custo: number | null;
  mediaCusto: number | null;
  gasto: number;
  /** "conversas subiram 45%", "custo por conversa caiu 30%" — um ou os dois (ou leads/compras). */
  motivos: string[];
  /** O que `conversas` conta (Leva 7A): conversas, leads, compras ou misto. */
  tipo?: TipoResultadoConta;
  /** Pra ordenar: o maior ganho percentual. */
  ganho: number;
}

/** Dias anteriores mínimos pra ter média que valha. */
export const MIN_DIAS_BASE = 4;
/** Conversas mínimas ontem: 2 contra 1 é +100% e não quer dizer nada. */
export const MIN_CONVERSAS = 3;

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Ontem foi bom? Mais conversas (+30% e pelo menos 2 a mais que a média) e/ou custo por conversa
 * 25% menor — este só vale se o gasto não despencou (gastar menos e ter menos conversas não é mérito).
 */
export function avaliarDia(ontem: DiaConta, anteriores: DiaConta[]): Omit<FoiBem, "clientId" | "nome"> | null {
  if (anteriores.length < MIN_DIAS_BASE || ontem.conversions < MIN_CONVERSAS) return null;
  const tipo: TipoResultadoConta = ontem.tipo ?? "mensagens";
  const rot = ROTULO_RESULTADO[tipo];

  const mediaConversas = media(anteriores.map((d) => d.conversions));
  const gastoBase = anteriores.reduce((a, d) => a + d.spend, 0);
  const convBase = anteriores.reduce((a, d) => a + d.conversions, 0);
  const mediaCusto = convBase > 0 ? gastoBase / convBase : null;
  const custo = ontem.conversions > 0 ? ontem.spend / ontem.conversions : null;

  const motivos: string[] = [];
  let ganho = 0;

  if (mediaConversas > 0 && ontem.conversions >= mediaConversas * 1.3 && ontem.conversions - mediaConversas >= 2) {
    const p = Math.round((ontem.conversions / mediaConversas - 1) * 100);
    motivos.push(`${rot.varios} subiram ${p}%`);
    ganho = Math.max(ganho, p);
  }
  const gastoMedio = media(anteriores.map((d) => d.spend));
  if (mediaCusto && custo !== null && custo <= mediaCusto * 0.75 && ontem.spend >= gastoMedio * 0.5) {
    const p = Math.round((1 - custo / mediaCusto) * 100);
    motivos.push(`${rot.custo} caiu ${p}%`);
    ganho = Math.max(ganho, p);
  }
  if (!motivos.length) return null;

  return {
    conversas: ontem.conversions,
    mediaConversas: Math.round(mediaConversas * 10) / 10,
    custo: custo === null ? null : Math.round(custo * 100) / 100,
    mediaCusto: mediaCusto === null ? null : Math.round(mediaCusto * 100) / 100,
    gasto: Math.round(ontem.spend * 100) / 100,
    motivos,
    ganho,
    tipo,
  };
}

/** Data de ontem em São Paulo (AAAA-MM-DD). */
export function ontemSP(agora: Date = new Date()): string {
  return new Date(agora.getTime() - 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Clientes de tráfego em operação que foram bem ontem, do maior ganho pro menor. */
export async function carregarQuemFoiBem(excluir: Set<string>, agora: Date = new Date()): Promise<{ ontem: string; bons: FoiBem[] }> {
  const ontem = ontemSP(agora);
  const inicio = new Date(new Date(`${ontem}T12:00:00Z`).getTime() - 7 * 86_400_000).toISOString().slice(0, 10);

  const [{ data: clientes }, { data: dias }] = await Promise.all([
    supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, logo, doc_logo, active, churned_at, draft_status, paused_at, paused_until, service_type, assigned_traffic, meta_ad_account_id"),
    // Resultado pelo objetivo quando já gravado (results); senão, as conversas de sempre.
    lerMetricasDiarias(inicio, ontem),
  ]);

  const porCliente = new Map<string, DiaConta[]>();
  for (const d of dias ?? []) {
    const id = d.client_id as string;
    if (!porCliente.has(id)) porCliente.set(id, []);
    const res = d.results != null && d.results !== "" ? Number(d.results) : null;
    porCliente.get(id)!.push({
      metric_date: d.metric_date as string, spend: Number(d.spend) || 0,
      conversions: (res != null && Number.isFinite(res) ? res : Number(d.conversions)) || 0,
      tipo: comoTipoResultado(d.result_kind),
    });
  }

  const bons: FoiBem[] = [];
  for (const c of (clientes ?? []) as unknown as ClienteHojeRow[]) {
    if (excluir.has(c.id) || !clienteDoHoje(c, agora)) continue;
    const serie = porCliente.get(c.id);
    const diaOntem = serie?.find((d) => d.metric_date === ontem);
    if (!serie || !diaOntem) continue;
    const r = avaliarDia(diaOntem, serie.filter((d) => d.metric_date < ontem));
    if (r) bons.push({ clientId: c.id, nome: (c.nome_fantasia || c.name || "(sem nome)") as string, ...r });
  }
  bons.sort((a, b) => b.ganho - a.ganho);
  return { ontem, bons };
}
