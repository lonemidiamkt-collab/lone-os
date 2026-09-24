// lib/goals/calcular-server.ts — lê o banco e calcula TODAS as metas de um mês (N33). Só servidor.
// As contas moram em lib/goals/calculos.ts (puro, testado). Fonte que falhar vira `semFonte` naquela
// meta e um nome em `falhas` — nunca derruba as outras nem vira zero.

import { supabaseAdmin } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/clients/pausa";
import { temSocial } from "@/lib/clients/servico";
import { carregarCards, carregarPosts, temColunasIg } from "@/lib/conteudo/dados";
import { montarResultados, type ClienteResultado } from "@/lib/conteudo/resultados";
import { somarDias } from "@/lib/conteudo/no-ar";
import { spDateStr } from "@/lib/utils";
import { limitesDoMes } from "./catalogo";
import {
  churnDoMes, clientesAtivos, designDoMes, entregaContratada, novosClientes, npsDasNotas, postsNoPrazo,
  reunioesDoMes, riscoDoMes, semFonte, trafegoDoMes,
  type ClienteMetas, type LinhaEntrega, type LinhaReuniao, type LinhaSaude, type ValorMeta,
} from "./calculos";

const PAGINA = 1000;
const LOTE_IN = 60;
const erroDe = (e: unknown) => (e instanceof Error ? e.message : String(e));
const tabelaFaltando = (m: string) => /does not exist|schema cache|Could not find/i.test(m);

/** Lê todas as páginas (o PostgREST corta em 1000 linhas). */
async function paginar<T>(montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; de < 100_000; de += PAGINA) {
    const { data, error } = await montar(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as T[];
    linhas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return linhas;
}

export interface CalculoDoMes {
  mes: string;
  valores: Record<string, ValorMeta>;
  falhas: string[];
}

export async function calcularMetasDoMes(mes: string, agora = new Date()): Promise<CalculoDoMes> {
  const { inicio, fim } = limitesDoMes(mes);
  const tsInicio = new Date(`${inicio}T00:00:00-03:00`).toISOString();
  const tsFim = new Date(`${fim}T23:59:59-03:00`).toISOString();
  const hoje = hojeSP(agora);
  const falhas: string[] = [];
  const v: Record<string, ValorMeta> = {};
  const falhou = (fonte: string, chaves: string[], e: unknown) => {
    const m = erroDe(e);
    falhas.push(`${fonte}: ${m}`);
    for (const k of chaves) v[k] = semFonte(tabelaFaltando(m) ? `${fonte} ainda não existe no banco` : `não consegui ler ${fonte} agora`);
  };

  // ── Clientes ──────────────────────────────────────────────────────────────
  let clientes: ClienteMetas[] = [];
  let nomes = new Map<string, { nome: string; social: string | null; temInstagram: boolean; meta: number | null }>();
  try {
    const linhas = await paginar<Record<string, unknown>>((a, b) => supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, assigned_social, join_date, created_at, churned_at, active, draft_status, service_type, ig_business_account_id, ig_public_username, posts_goal")
      .order("id").range(a, b));
    clientes = linhas.map((c) => ({
      id: c.id as string,
      entrada: ((c.join_date as string) || "").slice(0, 10) || (c.created_at ? spDateStr(c.created_at as string) : null),
      saida: c.churned_at ? spDateStr(c.churned_at as string) : null,
      desativadoSemData: c.active === false && !c.churned_at,
      rascunho: !!c.draft_status,
      temSocial: temSocial(c as { service_type?: string | null }),
      temInstagram: !!(c.ig_business_account_id || c.ig_public_username),
      postsContratados: Number(c.posts_goal) > 0 ? Number(c.posts_goal) : null,
    }));
    nomes = new Map(linhas.map((c) => [c.id as string, {
      nome: ((c.nome_fantasia as string) || (c.name as string) || "").trim(),
      social: ((c.assigned_social as string) || "").trim() || null,
      temInstagram: !!(c.ig_business_account_id || c.ig_public_username),
      meta: Number(c.posts_goal) > 0 ? Number(c.posts_goal) : null,
    }]));
    v.clientes_ativos = clientesAtivos(clientes, mes);
    v.novos_clientes = novosClientes(clientes, mes);
    v.churn_pct = churnDoMes(clientes, mes);
  } catch (e) {
    falhou("o cadastro de clientes", ["clientes_ativos", "novos_clientes", "churn_pct", "entrega_contratada_pct", "reunioes_mes_pct"], e);
  }

  // As outras fontes são independentes: leem em paralelo.
  await Promise.all([
    // ── NPS (pesquisa pós-reunião, Leva 6B) ─────────────────────────────────
    (async () => {
      try {
        const linhas = await paginar<{ nota: number }>((a, b) => supabaseAdmin.from("cs_nps_pesquisas").select("nota")
          .not("nota", "is", null).gte("respondido_em", tsInicio).lte("respondido_em", tsFim).range(a, b));
        v.nps_clientes = npsDasNotas(linhas.map((l) => Number(l.nota)));
      } catch (e) { falhou("a pesquisa de NPS", ["nps_clientes"], e); }
    })(),

    // ── Saúde ───────────────────────────────────────────────────────────────
    (async () => {
      try {
        const linhas = await paginar<LinhaSaude>((a, b) => supabaseAdmin.from("client_health_scores")
          .select("client_id, level, computed_for_date").gte("computed_for_date", inicio).lte("computed_for_date", fim)
          .in("level", ["saudavel", "atencao", "risco"]).order("computed_for_date").range(a, b));
        v.clientes_em_risco_pct = riscoDoMes(linhas, mes);
      } catch (e) { falhou("o histórico de saúde", ["clientes_em_risco_pct"], e); }
    })(),

    // ── Tráfego (função SQL da migration 20260926120000) ─────────────────────
    (async () => {
      const { data, error } = await supabaseAdmin.rpc("metas_trafego_mes", { p_inicio: inicio, p_fim: fim });
      if (error) {
        falhas.push(`tráfego: ${error.message}`);
        const motivo = /metas_trafego_mes|function|schema cache/i.test(error.message)
          ? "aguarda a migration 20260926120000_gestao_portal.sql"
          : "não consegui ler o tráfego agora";
        v.conversas_mes = semFonte(motivo);
        v.custo_por_conversa = semFonte(motivo);
        return;
      }
      const t = (data ?? null) as { conversas?: number; investido?: number; contas?: number } | null;
      const r = trafegoDoMes(t ? { conversas: t.conversas ?? null, investido: t.investido ?? null, contas: t.contas ?? null } : null);
      v.conversas_mes = r.conversas;
      v.custo_por_conversa = r.custo;
    })(),

    // ── Posts: Instagram real + casamento com o quadro ───────────────────────
    (async () => {
      try {
        const { posts, erro } = await carregarPosts(somarDias(inicio, -1), somarDias(fim, 1));
        if (erro) throw new Error(erro);
        const porCliente = new Map<string, number>();
        let total = 0;
        for (const p of posts) {
          const d = spDateStr(p.posted_at);
          if (d < inicio || d > fim) continue;
          total++;
          porCliente.set(p.client_id, (porCliente.get(p.client_id) ?? 0) + 1);
        }
        v.posts_publicados = { valor: total, detalhe: `${porCliente.size} ${porCliente.size === 1 ? "cliente" : "clientes"}` };
        if (clientes.length) v.entrega_contratada_pct = entregaContratada(clientes, porCliente, mes);

        const comIg = await temColunasIg().catch(() => false);
        const { cards, erro: eCards } = await carregarCards(somarDias(inicio, -2), somarDias(fim, 2), posts.map((p) => p.media_id), comIg);
        if (eCards) throw new Error(eCards);
        const lista: ClienteResultado[] = [...nomes].map(([id, n]) => ({
          id, nome: n.nome, social: n.social, temInstagram: n.temInstagram, meta: n.meta, ultimoPost: null,
        }));
        const res = montarResultados({ mes, hoje, clientes: lista, posts, cards });
        v.posts_no_prazo_pct = postsNoPrazo(res.totais.noPrazo, res.totais.atrasados);
      } catch (e) {
        const chaves = ["posts_no_prazo_pct"];
        if (!v.posts_publicados) chaves.push("posts_publicados", "entrega_contratada_pct");
        falhou("os posts do Instagram", chaves, e);
      }
    })(),

    // ── Reuniões do ciclo mensal ─────────────────────────────────────────────
    (async () => {
      try {
        const linhas = await paginar<LinhaReuniao & { deleted_at: string | null }>((a, b) => supabaseAdmin.from("meetings")
          .select("client_id, estado, realizada_em, mes_referencia, deleted_at").not("client_id", "is", null)
          .or(`mes_referencia.eq.${mes},and(realizada_em.gte.${tsInicio},realizada_em.lte.${tsFim})`).range(a, b));
        if (clientes.length) v.reunioes_mes_pct = reunioesDoMes(clientes, linhas.filter((r) => !r.deleted_at), mes);
      } catch (e) { falhou("as reuniões", ["reunioes_mes_pct"], e); }
    })(),

    // ── Design: versões entregues (creative_deliveries) ──────────────────────
    (async () => {
      try {
        // O registro de versões começou com a entrega atômica (migration 20260918120000). Mês que
        // acabou antes da primeira entrega registrada não tem "0 artes": não tem fonte.
        const { data: primeira, error: ePrim } = await supabaseAdmin.from("creative_deliveries")
          .select("delivered_at").order("delivered_at", { ascending: true }).limit(1);
        if (ePrim) throw new Error(ePrim.message);
        const desde = primeira?.[0]?.delivered_at ? spDateStr(primeira[0].delivered_at as string) : null;
        if (!desde || desde > fim) {
          const motivo = desde ? `entregas registradas só a partir de ${desde.split("-").reverse().join("/")}` : "nenhuma entrega registrada ainda";
          v.artes_entregues = semFonte(motivo); v.artes_no_prazo_pct = semFonte(motivo); v.retrabalho_pct = semFonte(motivo);
          return;
        }
        const entregas = await paginar<LinhaEntrega>((a, b) => supabaseAdmin.from("creative_deliveries")
          .select("card_id, version, delivered_at").gte("delivered_at", tsInicio).lte("delivered_at", tsFim)
          .order("delivered_at").range(a, b));
        const ids = [...new Set(entregas.filter((e) => e.version === 1).map((e) => e.card_id))];
        const prazo = new Map<string, string | null>();
        for (let i = 0; i < ids.length; i += LOTE_IN) {
          const { data, error } = await supabaseAdmin.from("content_cards").select("id, due_date").in("id", ids.slice(i, i + LOTE_IN));
          if (error) throw new Error(error.message);
          for (const c of data ?? []) prazo.set(c.id as string, (c.due_date as string) ?? null);
        }
        const d = designDoMes(entregas, prazo, mes);
        // Mês pela metade no registro: o número vale, mas diz desde quando.
        if (desde > inicio && d.entregues.valor != null) d.entregues.detalhe = `${d.entregues.detalhe} · registro desde ${desde.slice(8, 10)}/${desde.slice(5, 7)}`;
        v.artes_entregues = d.entregues;
        v.artes_no_prazo_pct = d.noPrazo;
        v.retrabalho_pct = d.retrabalho;
      } catch (e) { falhou("as entregas de arte", ["artes_entregues", "artes_no_prazo_pct", "retrabalho_pct"], e); }
    })(),
  ]);

  return { mes, valores: v, falhas };
}
