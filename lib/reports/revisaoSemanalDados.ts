// lib/reports/revisaoSemanalDados.ts — o BANCO da revisão semanal de operação (N31). As regras
// moram em lib/reports/revisaoSemanal.ts (puro, testado); aqui é só ler.
//
// Fonte que falhar vira um nome em `falhas` (e a legenda avisa) — nunca um zero calado.

import { supabaseAdmin } from "@/lib/supabase/server";
import { hojeSP, apareceParaEquipe } from "@/lib/clients/pausa";
import { ETAPAS_COMPROMETIDAS, statusDasEtapas } from "@/lib/conteudo/etapas";
import { carregarCards, carregarPosts, temColunasIg } from "@/lib/conteudo/dados";
import { somarDias, type LinhaCard } from "@/lib/conteudo/no-ar";
import { resolverDonos } from "@/lib/cs/dono-tarefa";
import {
  montarRevisao, semanaAnterior,
  type ClienteRevisao, type ReuniaoRevisao, type Revisao, type TarefaRevisao,
} from "./revisaoSemanal";

const COLS_CARD = "id, client_id, title, status, format, platform, due_date, due_time, scheduled_at, designer_delivered_at, client_approved_at, publish_verified_at, status_changed_at, social_media, archived_at";

export async function carregarRevisao(agora = new Date()): Promise<{ revisao: Revisao; falhas: string[] }> {
  const hoje = hojeSP(agora);
  const semana = semanaAnterior(hoje);
  const falhas: string[] = [];

  // ── Clientes (a carteira do time: pausado entra, ex-cliente e rascunho não) ──
  const { data: cli, error: eCli } = await supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, assigned_social, assigned_designer, ig_business_account_id, ig_public_username, active, churned_at, draft_status");
  if (eCli) throw new Error(`clientes: ${eCli.message}`);
  const clientes: ClienteRevisao[] = (cli ?? [])
    .filter((c) => apareceParaEquipe(c) && !c.draft_status)
    .map((c) => ({
      id: c.id as string,
      nome: ((c.nome_fantasia as string) || (c.name as string) || "Cliente").trim(),
      social: ((c.assigned_social as string) || "").trim() || null,
      designer: ((c.assigned_designer as string) || "").trim() || null,
      temInstagram: !!(c.ig_business_account_id || c.ig_public_username),
    }));
  const nomes = new Map(clientes.map((c) => [c.id, c.nome]));

  // ── Posts e cards da semana (com a folga que o casamento ±1 dia precisa) ──
  const { posts, erro: ePosts } = await carregarPosts(somarDias(semana.inicio, -1), somarDias(semana.fim, 1));
  if (ePosts) falhas.push(`posts do Instagram: ${ePosts}`);
  const comIg = await temColunasIg().catch(() => false);
  const { cards: daSemana, erro: eCards } = await carregarCards(
    somarDias(semana.inicio, -2), somarDias(semana.fim, 2), posts.map((p) => p.media_id), comIg);
  if (eCards) falhas.push(`cards: ${eCards}`);

  // Cards com prazo vencido AGORA nas etapas em que prazo é compromisso (podem ser de qualquer semana).
  const { data: vencidos, error: eVenc } = await supabaseAdmin.from("content_cards").select(COLS_CARD)
    .in("status", statusDasEtapas(...ETAPAS_COMPROMETIDAS)).is("archived_at", null).lt("due_date", hoje).limit(1000);
  if (eVenc) falhas.push(`cards atrasados: ${eVenc.message}`);
  const porId = new Map<string, LinhaCard>();
  for (const c of daSemana) porId.set(c.id, c);
  for (const c of (vencidos ?? []) as unknown as LinhaCard[]) porId.set(c.id, c);

  // ── Reuniões: realizadas na semana + o ciclo do mês corrente + agendadas que já passaram ──
  const inicioTs = new Date(`${somarDias(semana.inicio, -1)}T00:00:00-03:00`).toISOString();
  const [rFeitas, rCiclo] = await Promise.all([
    supabaseAdmin.from("meetings").select("client_id, responsavel, estado, start_at, realizada_em, mes_referencia, deleted_at")
      .eq("estado", "realizada").gte("realizada_em", inicioTs).not("client_id", "is", null),
    supabaseAdmin.from("meetings").select("client_id, responsavel, estado, start_at, realizada_em, mes_referencia, deleted_at")
      .in("estado", ["pendente", "proposta", "agendada"]).not("client_id", "is", null)
      // Agendada que já passou: só as dos últimos 30 dias (mais antiga que isso é faxina, não pendência da semana).
      .or(`mes_referencia.eq.${hoje.slice(0, 7)},and(start_at.lt.${agora.toISOString()},start_at.gte.${new Date(agora.getTime() - 30 * 86_400_000).toISOString()})`),
  ]);
  if (rFeitas.error) falhas.push(`reuniões: ${rFeitas.error.message}`);
  if (rCiclo.error) falhas.push(`reuniões do mês: ${rCiclo.error.message}`);
  const reunioes: ReuniaoRevisao[] = [...(rFeitas.data ?? []), ...(rCiclo.data ?? [])]
    .filter((r) => !r.deleted_at)
    .map((r) => ({
      clientId: r.client_id as string,
      responsavel: ((r.responsavel as string) || "").trim() || null,
      estado: r.estado as string,
      startAt: (r.start_at as string) ?? null,
      realizadaEm: (r.realizada_em as string) ?? null,
      mesReferencia: (r.mes_referencia as string) ?? null,
    }));

  // ── Tarefas vencidas, com o dono resolvido (papel genérico → pessoa do cliente) ──
  const { data: tar, error: eTar } = await supabaseAdmin.from("tasks")
    .select("id, title, assigned_to, client_id, client_name, due_date, status")
    .neq("status", "done").lt("due_date", hoje).limit(1000);
  if (eTar) falhas.push(`tarefas: ${eTar.message}`);
  const linhasTarefa = (tar ?? []) as { id: string; title: string; assigned_to: string | null; client_id: string | null; client_name: string | null; due_date: string }[];
  const donos = await resolverDonos(linhasTarefa).catch(() => new Map<string, string | null>());
  const tarefas: TarefaRevisao[] = linhasTarefa.filter((t) => !!t.due_date).map((t) => ({
    titulo: (t.title || "Tarefa").trim(),
    // null do resolvedor = papel genérico sem dono no cliente: fica "Sem responsável", não "designer".
    dono: donos.has(t.id) ? donos.get(t.id) ?? null : ((t.assigned_to ?? "").trim() || null),
    cliente: (t.client_id ? nomes.get(t.client_id) : null) ?? t.client_name ?? null,
    vencimento: t.due_date,
  }));

  const revisao = montarRevisao({ semana, hoje, clientes, posts, cards: [...porId.values()], reunioes, tarefas });
  return { revisao, falhas };
}
