// lib/metrics/cockpit.ts — os números do cockpit do CEO, calculados no SERVIDOR e a partir da fonte.
//
// Como estava (27/07/2026, tudo verificado no banco):
//   • "Evolução vs 2026-06" comparava com um bloco de números ESCRITO NO CÓDIGO
//     (totalClients: 5 — a Lone tem 46; postsPublished: 42; avgHealthScore: 62). Toda seta verde
//     e vermelha da tela era comparação com invenção.
//   • Os snapshots ficavam no localStorage: cada pessoa via um histórico, limpar cache apagava.
//   • "Posts Publicados: 3" — contava card no board. O Instagram tinha 265 no mês.
//   • "SLA de Entrega: 0h" — precisa de work_started_at + publish_verified_at. ZERO cards têm
//     os dois. Media o vazio e mostrava 0 como se fosse resultado.
//   • "Velocidade Design: −0,3 dias" — 33 dos 60 cards têm entrega registrada ANTES do início.
//   • "Engajamento: NaN dias" — conta impossível indo pra tela.
//
// Regra deste módulo: **métrica sem fonte devolve `null`, nunca 0.** Zero é uma medição; null é
// "não sei". Confundir os dois foi o que fez a tela mentir com cara de precisão.

import { supabaseAdmin } from "@/lib/supabase/server";

export interface Metrica {
  valor: number | null;
  /** Null quando não há como medir — a tela mostra "—" e o porquê, em vez de 0. */
  semFonte?: string;
}

export interface Cockpit {
  periodo: string;              // "2026-07"
  clientes: number;
  ativos: number;
  emRisco: number;
  churnPct: Metrica;
  healthMedio: Metrica;
  postsPublicados: Metrica;
  postsMeta: number | null;
  slaEntregaHoras: Metrica;
  slaCumprimentoPct: Metrica;
  designEntregues: Metrica;
  designNoPrazoPct: Metrica;
  designDiasMedio: Metrica;
  tarefasConcluidas: Metrica;
  tarefasVencidas: Metrica;
  diasSemFalarMedio: Metrica;
  /** Quantos clientes entraram em cada média — a tela avisa quando a cobertura é baixa. */
  cobertura: { health: number; interacao: number };
}

const num = (v: number | null | undefined): Metrica => ({ valor: v ?? null });
const semFonte = (motivo: string): Metrica => ({ valor: null, semFonte: motivo });
const arred = (v: number, casas = 1) => Math.round(v * 10 ** casas) / 10 ** casas;

export function periodoAtualBRT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

/** Calcula o mês corrente a partir das fontes reais. Nunca inventa: o que não tem fonte vem null. */
export async function calcularCockpit(periodo = periodoAtualBRT()): Promise<Cockpit> {
  const inicio = `${periodo}-01`;
  const [ano, m] = periodo.split("-").map(Number);
  const fimIso = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const [{ data: clientes }, { data: cards }, { data: tarefas }, { data: posts }] = await Promise.all([
    supabaseAdmin.from("clients")
      .select("id, status, current_health_score, posts_goal, last_client_msg_at")
      .is("draft_status", null).or("active.is.null,active.eq.true"),
    supabaseAdmin.from("content_cards")
      .select("designer_delivered_at, due_date, work_started_at, publish_verified_at")
      .is("archived_at", null),
    supabaseAdmin.from("tasks").select("status, due_date"),
    supabaseAdmin.from("client_ig_posts").select("id")
      .gte("posted_at", `${inicio}T00:00:00-03:00`).lte("posted_at", `${fimIso}T23:59:59-03:00`),
  ]);

  const cli = clientes ?? [];
  const ativos = cli.filter((c) => c.status !== "onboarding");
  const emRisco = cli.filter((c) => c.status === "at_risk");

  // ── Saúde: só quem TEM score entra na média. Contar quem não tem como zero puxava tudo pra baixo.
  const comScore = cli.filter((c) => c.current_health_score != null);
  const healthMedio = comScore.length
    ? num(arred(comScore.reduce((s, c) => s + Number(c.current_health_score), 0) / comScore.length))
    : semFonte("nenhum cliente com score calculado");

  // ── Posts: Instagram, não board. O board tem 3 "publicado" contra 265 posts reais no mês.
  const meta = cli.reduce((s, c) => s + (Number(c.posts_goal) || 0), 0);

  // ── Design ────────────────────────────────────────────────────────────────
  const k = cards ?? [];
  const entregues = k.filter((c) => c.designer_delivered_at);
  const noPrazo = entregues.filter((c) => c.due_date && (c.designer_delivered_at as string).slice(0, 10) <= (c.due_date as string));

  // Velocidade só existe com hora de INÍCIO confiável. Hoje nenhum card tem work_started_at, e
  // usar status_changed_at no lugar dava duração NEGATIVA em 33 dos 60 (o status muda depois da
  // entrega). Melhor dizer que não sabe.
  const comInicio = k.filter((c) => c.work_started_at && c.designer_delivered_at &&
    (c.designer_delivered_at as string) > (c.work_started_at as string));
  const designDias = comInicio.length >= 5
    ? num(arred(comInicio.reduce((s, c) =>
        s + (new Date(c.designer_delivered_at as string).getTime() - new Date(c.work_started_at as string).getTime()) / 86400000, 0) / comInicio.length))
    : semFonte("ninguém marca início do trabalho no card");

  // ── SLA de entrega: exige os dois carimbos. Zero cards têm. ────────────────
  const comSla = k.filter((c) => c.work_started_at && c.publish_verified_at);
  const slaHoras = comSla.length >= 3
    ? num(arred(comSla.reduce((s, c) =>
        s + (new Date(c.publish_verified_at as string).getTime() - new Date(c.work_started_at as string).getTime()) / 3600000, 0) / comSla.length))
    : semFonte("card não registra início nem verificação de publicação");
  const slaPct = comSla.length >= 3
    ? num(Math.round(comSla.filter((c) =>
        (new Date(c.publish_verified_at as string).getTime() - new Date(c.work_started_at as string).getTime()) / 3600000 <= 48).length / comSla.length * 100))
    : semFonte("sem card com os dois carimbos");

  // ── Tarefas ───────────────────────────────────────────────────────────────
  const t = tarefas ?? [];
  const vencidas = t.filter((x) => x.status !== "done" && x.due_date && (x.due_date as string) < hoje);

  // ── Silêncio do cliente: só quem tem registro de conversa entra. ───────────
  const comMsg = cli.filter((c) => c.last_client_msg_at);
  const diasSemFalar = comMsg.length
    ? num(arred(comMsg.reduce((s, c) =>
        s + (Date.now() - new Date(c.last_client_msg_at as string).getTime()) / 86400000, 0) / comMsg.length))
    : semFonte("nenhuma conversa de cliente registrada");

  return {
    periodo,
    clientes: cli.length,
    ativos: ativos.length,
    emRisco: emRisco.length,
    churnPct: cli.length ? num(arred((emRisco.length / cli.length) * 100)) : semFonte("sem clientes"),
    healthMedio,
    postsPublicados: num(posts?.length ?? 0),
    postsMeta: meta || null,
    slaEntregaHoras: slaHoras,
    slaCumprimentoPct: slaPct,
    designEntregues: num(entregues.length),
    designNoPrazoPct: entregues.length ? num(Math.round((noPrazo.length / entregues.length) * 100)) : semFonte("nenhuma arte entregue"),
    designDiasMedio: designDias,
    tarefasConcluidas: num(t.filter((x) => x.status === "done").length),
    tarefasVencidas: num(vencidas.length),
    diasSemFalarMedio: diasSemFalar,
    cobertura: { health: comScore.length, interacao: comMsg.length },
  };
}

export interface Delta {
  chave: string;
  rotulo: string;
  atual: number | null;
  anterior: number | null;
  /** Variação em %. Null quando falta um dos lados — e aí a tela NÃO mostra seta. */
  variacaoPct: number | null;
  /** Pra este indicador, menor é melhor (tarefas vencidas, dias sem falar, churn). */
  menorEhMelhor: boolean;
  semFonte?: string;
}

const MAPA: { chave: keyof Cockpit; rotulo: string; menorEhMelhor?: boolean }[] = [
  { chave: "healthMedio", rotulo: "Health Score médio" },
  { chave: "churnPct", rotulo: "Taxa de churn", menorEhMelhor: true },
  { chave: "postsPublicados", rotulo: "Posts publicados" },
  { chave: "designNoPrazoPct", rotulo: "Design no prazo" },
  { chave: "designEntregues", rotulo: "Artes entregues" },
  { chave: "tarefasVencidas", rotulo: "Tarefas vencidas", menorEhMelhor: true },
  { chave: "diasSemFalarMedio", rotulo: "Dias sem o cliente falar", menorEhMelhor: true },
  { chave: "slaEntregaHoras", rotulo: "SLA de entrega", menorEhMelhor: true },
  { chave: "slaCumprimentoPct", rotulo: "SLA cumprido" },
];

/**
 * Compara com o mês anterior REAL. Sem mês anterior gravado, devolve os valores com
 * `variacaoPct: null` — a tela mostra o número e nenhuma seta. Comparar com nada e desenhar
 * seta verde foi exatamente o problema.
 */
export function compararComAnterior(atual: Cockpit, anterior: Cockpit | null): Delta[] {
  return MAPA.map(({ chave, rotulo, menorEhMelhor }) => {
    const a = atual[chave] as Metrica;
    const p = anterior ? (anterior[chave] as Metrica) : null;
    const va = a?.valor ?? null;
    const vp = p?.valor ?? null;
    const variacao = va !== null && vp !== null && vp !== 0 ? arred(((va - vp) / Math.abs(vp)) * 100) : null;
    return { chave, rotulo, atual: va, anterior: vp, variacaoPct: variacao, menorEhMelhor: !!menorEhMelhor, semFonte: a?.semFonte };
  });
}
