// lib/diagnostico-mensal/dados.ts — coleta, do banco, tudo que o diagnóstico mensal de UM cliente lê.
//
// Só LÊ o que o sistema já guarda (metric_snapshots, meta_entity_snapshots, client_traffic_policy,
// cache do Instagram). Não chama a Meta ao vivo para anúncio: o diagnóstico de 46 contas não pode
// depender de 46 leituras paginadas na hora, e o dado diário já é conferido pela coleta.

import { supabaseAdmin } from "@/lib/supabase/server";
import { getIgSnapshotCached } from "@/lib/meta/igSnapshot";
import { estaPausado, type ClienteComPausa } from "@/lib/clients/pausa";
import { rotuloServico, temTrafego } from "@/lib/clients/servico";
import type { DadosCliente, Dia, Entidade } from "./analise";

export interface ClienteDiagnostico {
  id: string;
  name: string;
  nome_fantasia: string | null;
  service_type: string | null;
  meta_ad_account_id: string | null;
  ig_business_account_id: string | null;
  ig_public_username: string | null;
}

const nomeDe = (c: { nome_fantasia: string | null; name: string }) => c.nome_fantasia || c.name;

const somarDia = (iso: string, n: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
const diasEntre = (de: string, ate: string) => Math.round((new Date(`${ate}T12:00:00Z`).getTime() - new Date(`${de}T12:00:00Z`).getTime()) / 864e5) + 1;

/** Hoje em BRT, AAAA-MM-DD. */
export function hojeBRT(agora = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * O período do diagnóstico. No dia 1º é o MÊS FECHADO que acabou (Roberto: "bateu o dia 31, tem que
 * ter o diagnóstico do dia 1º até o dia 31"); em qualquer outro dia, os 30 dias que terminam ontem.
 */
export function periodoPadrao(hoje = hojeBRT()): { de: string; ate: string } {
  if (hoje.endsWith("-01")) {
    const ate = somarDia(hoje, -1);
    return { de: `${ate.slice(0, 8)}01`, ate };
  }
  const ate = somarDia(hoje, -1);
  return { de: somarDia(ate, -29), ate };
}

/** O período de comparação: o mês civil anterior quando o atual é um mês fechado; senão, a janela de mesmo tamanho logo antes. */
export function periodoAnterior(de: string, ate: string): { de: string; ate: string } {
  const fimDoMes = new Date(Date.UTC(Number(ate.slice(0, 4)), Number(ate.slice(5, 7)), 0)).getUTCDate();
  if (de.endsWith("-01") && Number(ate.slice(8)) === fimDoMes) {
    const antAte = somarDia(de, -1);
    return { de: `${antAte.slice(0, 8)}01`, ate: antAte };
  }
  const n = diasEntre(de, ate);
  return { de: somarDia(de, -n), ate: somarDia(de, -1) };
}

/** Lê todas as linhas, página a página (o PostgREST corta em 1.000 sem avisar). */
async function lerTudo<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < 40; i++) {
    const { data, error } = await consulta(i * 1000, i * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/**
 * Quem recebe diagnóstico: clientes ATIVOS cujo contrato inclui tráfego (lone_growth = social +
 * tráfego; assessoria_trafego / trafego_pago = só tráfego). Cliente só de social fica de fora —
 * o contrato é que autoriza falar de anúncio (lib/clients/servico.ts), a conta Meta não. Pausado
 * continua na carteira mas não entra.
 */
export async function selecionarClientes(onlyId?: string | null): Promise<{ elegiveis: ClienteDiagnostico[]; foraSocial: string[]; pausados: string[] }> {
  let q = supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, service_type, meta_ad_account_id, ig_business_account_id, ig_public_username, status, draft_status, active, paused_at, paused_until")
    .in("status", ["good", "average", "onboarding", "at_risk"])
    .is("draft_status", null).neq("active", false)
    .order("nome_fantasia");
  if (onlyId) q = q.eq("id", onlyId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const elegiveis: ClienteDiagnostico[] = [], foraSocial: string[] = [], pausados: string[] = [];
  for (const c of data ?? []) {
    if (!temTrafego(c)) { foraSocial.push(nomeDe(c as { nome_fantasia: string | null; name: string })); continue; }
    if (estaPausado(c as ClienteComPausa)) { pausados.push(nomeDe(c as { nome_fantasia: string | null; name: string })); continue; }
    elegiveis.push(c as unknown as ClienteDiagnostico);
  }
  return { elegiveis, foraSocial, pausados };
}

interface LinhaEntidade {
  entity_id: string; entity_name: string | null; campaign_name: string | null; metric_date: string;
  spend: number | string; impressions: number | string; clicks: number | string; conversions: number | string;
  frequency: number | string | null; effective_status: string | null;
}

function agregar(linhas: LinhaEntidade[], recenteDesde: string): Entidade[] {
  const por = new Map<string, LinhaEntidade[]>();
  for (const l of linhas) por.set(l.entity_id, [...(por.get(l.entity_id) ?? []), l]);
  const out: Entidade[] = [];
  for (const [id, ls] of por) {
    ls.sort((a, b) => a.metric_date.localeCompare(b.metric_date));
    const soma = (f: (l: LinhaEntidade) => boolean, k: "spend" | "conversions") => ls.filter(f).reduce((s, l) => s + (Number(l[k]) || 0), 0);
    const imp = ls.reduce((s, l) => s + (Number(l.impressions) || 0), 0);
    const freqPeso = ls.reduce((s, l) => s + (Number(l.frequency) || 0) * (Number(l.impressions) || 0), 0);
    const ultimo = ls[ls.length - 1];
    out.push({
      id, nome: ultimo.entity_name || "(sem nome)", campanha: ultimo.campaign_name,
      invest: soma(() => true, "spend"), impressoes: imp,
      cliques: ls.reduce((s, l) => s + (Number(l.clicks) || 0), 0),
      resultados: soma(() => true, "conversions"),
      frequencia: imp > 0 && freqPeso > 0 ? freqPeso / imp : null,
      recente: { invest: soma((l) => l.metric_date >= recenteDesde, "spend"), resultados: soma((l) => l.metric_date >= recenteDesde, "conversions") },
      antigo: { invest: soma((l) => l.metric_date < recenteDesde, "spend"), resultados: soma((l) => l.metric_date < recenteDesde, "conversions") },
      ativo: ultimo.effective_status === "ACTIVE",
    });
  }
  return out.filter((e) => e.invest > 0);
}

export async function coletar(c: ClienteDiagnostico, periodo: { de: string; ate: string }, anterior: { de: string; ate: string }): Promise<DadosCliente> {
  const comConta = !!c.meta_ad_account_id;
  const recenteDesde = somarDia(periodo.ate, -6);

  const [snaps, politica] = comConta ? await Promise.all([
    lerTudo<{ metric_date: string; spend: number | string; impressions: number; clicks: number; conversions: number; results: number | null; result_kind: string | null }>(
      (a, b) => supabaseAdmin.from("metric_snapshots")
        .select("metric_date, spend, impressions, clicks, conversions, results, result_kind")
        .eq("client_id", c.id).gte("metric_date", anterior.de).lte("metric_date", periodo.ate).order("metric_date").range(a, b),
    ),
    supabaseAdmin.from("client_traffic_policy").select("cpl_meta").eq("client_id", c.id).maybeSingle(),
  ]) : [[], { data: null }] as const;

  // O que a conta chama de resultado: o tipo mais comum entre os dias com gasto.
  const tipos = new Map<string, number>();
  for (const s of snaps) if (Number(s.spend) > 0) tipos.set(s.result_kind || "mensagens", (tipos.get(s.result_kind || "mensagens") ?? 0) + 1);
  const dominante = [...tipos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mensagens";
  const rotulo = tipos.size > 1 && [...tipos.keys()].filter((k) => k !== dominante).length ? "resultados"
    : dominante === "leads" ? "leads" : dominante === "compras" ? "compras" : "conversas";

  const dias: Dia[] = snaps.map((s) => ({
    data: s.metric_date, invest: Number(s.spend) || 0, impressoes: Number(s.impressions) || 0, cliques: Number(s.clicks) || 0,
    resultados: Number(s.results ?? s.conversions) || 0,
  }));

  // Anúncio e campanha só entram quando o resultado da conta é CONVERSA: meta_entity_snapshots guarda
  // conversas, e misturar com lead/compra faria o ranking comparar coisas diferentes.
  let anuncios: Entidade[] = [], campanhas: Entidade[] = [];
  if (comConta && rotulo === "conversas") {
    const ler = (nivel: string) => lerTudo<LinhaEntidade>(
      (a, b) => supabaseAdmin.from("meta_entity_snapshots")
        .select("entity_id, entity_name, campaign_name, metric_date, spend, impressions, clicks, conversions, frequency, effective_status")
        .eq("client_id", c.id).eq("nivel", nivel).gte("metric_date", periodo.de).lte("metric_date", periodo.ate).range(a, b),
    );
    const [ads, camps] = await Promise.all([ler("ad"), ler("campaign")]);
    anuncios = agregar(ads, recenteDesde);
    campanhas = agregar(camps, recenteDesde);
  }

  // Instagram — do cache (nunca força a Meta ao vivo em lote). Sem vínculo, sem seção.
  let ig: DadosCliente["ig"] = null;
  if (c.ig_business_account_id || c.ig_public_username) {
    try {
      const snap = await getIgSnapshotCached(c.id, "30d");
      if (snap.mapped && !snap.error && snap.conta) {
        const { count } = await supabaseAdmin.from("client_ig_posts").select("media_id", { count: "exact", head: true })
          .eq("client_id", c.id).gte("posted_at", `${anterior.de}T00:00:00-03:00`).lte("posted_at", `${anterior.ate}T23:59:59-03:00`);
        ig = {
          usuario: snap.conta.username, seguidores: snap.conta.seguidores,
          alcance: snap.resumo?.alcance ?? null, alcanceJanelaDias: snap.resumo?.alcanceJanelaDias ?? null,
          seguidoresGanhos: snap.resumo?.seguidoresGanhos ?? null,
          engajamento: snap.resumo?.engajamento ?? 0,
          postsNoPeriodo: snap.resumo?.postsNoPeriodo ?? snap.posts?.length ?? 0,
          postsNoAnterior: count && count > 0 ? count : null,
          posts: (snap.posts ?? []).map((p) => ({ tipo: p.tipo, alcance: p.alcance, engajamento: p.engajamento, data: p.data, permalink: p.permalink })),
          parcial: snap.fonte === "publico",
        };
      }
    } catch { /* Instagram fora do ar não derruba o diagnóstico dos anúncios */ }
  }

  return {
    nome: nomeDe(c), servico: rotuloServico(c), periodo, anterior, dias, rotulo, anuncios, campanhas,
    metaCpl: politica.data?.cpl_meta ? Number(politica.data.cpl_meta) : null, ig,
  };
}
