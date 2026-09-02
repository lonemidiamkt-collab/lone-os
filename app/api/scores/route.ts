export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { scoreDimensao, loneScore, leituraLoneScore, type ResultadoDimensao } from "@/lib/scores/executivo";
import { calcularSaude, distribuicao, situacaoDaDistribuicao, type SaudeCliente } from "@/lib/scores/health";
import { scorePessoa, capacidade, type Funcao, type ResultadoPessoa } from "@/lib/scores/performance";
import { classificar, resumirAtrasos, type CardParaAtraso } from "@/lib/scores/atraso";
import {
  sinaisDoLoninho, componenteRelacionamento, componenteEngajamento,
  componenteSentimento, componentePendencias, observacoes,
} from "@/lib/scores/sinais-loninho";
import type { Indicador } from "@/lib/scores/indicador";

// GET /api/scores — a fonte única do Lone Score, da saúde por cliente e do desempenho por pessoa.
//
// Substitui a matemática que vivia espalhada entre a tela de OKRs e o cockpit. Três regras que
// valem para tudo aqui e explicam a forma do código:
//
//   1. Nada é inventado. Sem fonte confiável, o indicador vale `null` e o peso se redistribui —
//      "0,0 dias de tempo médio" era ausência de dado exibida como perfeição.
//   2. A natureza da métrica manda. Acumulativa tem progresso e projeção; qualidade tem distância
//      até a meta. Ver lib/scores/indicador.ts.
//   3. O que o Loninho observa nos grupos ENTRA na conta. Era o dado mais rico do sistema e não
//      alimentava indicador nenhum.

const DIAS = 86_400_000;

/** Fração do mês já percorrida — é o que separa "atrasado" de "no ritmo" nas acumulativas. */
function fracaoDoMes(): number {
  const agora = new Date();
  const ini = new Date(agora.getFullYear(), agora.getMonth(), 1).getTime();
  const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 1).getTime();
  return (agora.getTime() - ini) / (fim - ini);
}

export async function GET(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;

  const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [clientesQ, cardsQ, contratosQ, membrosQ] = await Promise.all([
    supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, status, active, assigned_social, assigned_designer, assigned_traffic, churned_at, created_at")
      .or("active.is.null,active.eq.true"),
    supabaseAdmin.from("content_cards")
      .select("id, client_id, status, due_date, designer_delivered_at, designer_delivered_by, client_approved_at, blocked_reason, created_at, social_media")
      .is("archived_at", null)
      .gte("created_at", new Date(Date.now() - 90 * DIAS).toISOString()),
    supabaseAdmin.from("contracts").select("client_id, monthly_value, status"),
    supabaseAdmin.from("team_members").select("name, role, active"),
  ]);

  const clientes = (clientesQ.data ?? []).filter((c) => !/\(teste\)/i.test((c.name as string) || ""));
  const ativos = clientes.filter((c) => c.status !== "onboarding");
  const cards = cardsQ.data ?? [];
  // Os sinais são dos clientes ATIVOS — o mesmo universo do resto do cálculo. Usar a lista
  // completa fazia a confiança reportar "48 de 42 clientes com conversa", porque os em
  // onboarding entravam no numerador e não no denominador.
  const ids = ativos.map((c) => c.id as string);

  // ── O QUE O LONINHO VIU ────────────────────────────────────────────────
  const sinais = await sinaisDoLoninho(ids);

  // ── SAÚDE POR CLIENTE, com o porquê ────────────────────────────────────
  const cardsPorCliente = new Map<string, typeof cards>();
  for (const k of cards) {
    const cid = k.client_id as string;
    if (!cid) continue;
    (cardsPorCliente.get(cid) ?? cardsPorCliente.set(cid, []).get(cid)!).push(k);
  }

  const saude: SaudeCliente[] = ativos.map((c) => {
    const id = c.id as string;
    const s = sinais.get(id);
    const meus = cardsPorCliente.get(id) ?? [];
    const entregues = meus.filter((k) => k.designer_delivered_at).length;
    const noPrazo = meus.filter((k) => k.designer_delivered_at && k.due_date
      && (k.designer_delivered_at as string).slice(0, 10) <= (k.due_date as string).slice(0, 10)).length;

    return calcularSaude({
      clientId: id,
      cliente: (c.nome_fantasia as string) || (c.name as string) || "Cliente",
      componentes: {
        // Resultado do cliente (30%) ainda não tem fonte confiável por cliente — fica null em vez
        // de virar um número inventado com o maior peso do cálculo.
        resultado: null,
        entrega: entregues > 0 ? Math.round((noPrazo / entregues) * 100) : null,
        relacionamento: s ? componenteRelacionamento(s) : null,
        sentimento: s ? componenteSentimento(s) : null,
        pendencias: s ? componentePendencias(s) : null,
        engajamento: s ? componenteEngajamento(s) : null,
        financeiro: null,
      },
      observacoes: s ? observacoes(s) : [],
    });
  });

  const dist = distribuicao(saude);

  // ── ATRASO: de quem é ──────────────────────────────────────────────────
  const hoje = new Date().toISOString().slice(0, 10);
  const paraAtraso: CardParaAtraso[] = cards
    .filter((k) => k.status !== "published" && k.status !== "scheduled")
    .map((k) => ({
      id: k.id as string,
      status: k.status as string,
      diasAtePost: k.due_date
        ? Math.round((new Date(`${(k.due_date as string).slice(0, 10)}T12:00:00Z`).getTime()
          - new Date(`${hoje}T12:00:00Z`).getTime()) / DIAS)
        : null,
      designerEntregou: !!k.designer_delivered_at,
      clienteAprovouEm: (k.client_approved_at as string) ?? null,
      bloqueadoPor: (k.blocked_reason as string) ?? null,
    }));
  const diasEsperandoCliente = paraAtraso
    .filter((k) => classificar(k) === "aguardando_cliente" && k.diasAtePost !== null && k.diasAtePost < 0)
    .map((k) => -(k.diasAtePost as number));
  const atrasos = resumirAtrasos(paraAtraso, diasEsperandoCliente);

  // ── DESEMPENHO POR PESSOA ──────────────────────────────────────────────
  const membros = (membrosQ.data ?? []).filter((m) => m.active !== false);
  const pessoas: ResultadoPessoa[] = [];

  const porFuncao: { funcao: Funcao; campo: "assigned_designer" | "assigned_social" | "assigned_traffic" }[] = [
    { funcao: "designer", campo: "assigned_designer" },
    { funcao: "social", campo: "assigned_social" },
    { funcao: "traffic", campo: "assigned_traffic" },
  ];

  for (const { funcao, campo } of porFuncao) {
    const nomes = [...new Set(ativos.map((c) => (c as Record<string, unknown>)[campo] as string).filter(Boolean))];
    for (const nome of nomes) {
      const meusClientes = ativos.filter((c) => (c as Record<string, unknown>)[campo] === nome);
      const idsMeus = new Set(meusClientes.map((c) => c.id as string));
      const meusCards = cards.filter((k) => idsMeus.has(k.client_id as string));

      const entregues = meusCards.filter((k) => k.designer_delivered_at);
      const noPrazo = entregues.filter((k) => k.due_date
        && (k.designer_delivered_at as string).slice(0, 10) <= (k.due_date as string).slice(0, 10));
      // Retrabalho e saúde vêm do que o Loninho registrou nos grupos desta carteira.
      const rework = [...idsMeus].reduce((s, id) => s + (sinais.get(id)?.retrabalhos30d ?? 0), 0);
      const saudeMinha = saude.filter((x) => idsMeus.has(x.clientId) && x.score !== null);
      const saudeMedia = saudeMinha.length
        ? Math.round(saudeMinha.reduce((s, x) => s + (x.score as number), 0) / saudeMinha.length)
        : null;
      const semResposta = [...idsMeus].reduce((s, id) => s + (sinais.get(id)?.pedidosSemResposta ?? 0), 0);
      const pedidos = [...idsMeus].reduce((s, id) => s + (sinais.get(id)?.pedidos30d ?? 0), 0);

      const ind: Indicador[] = [
        { chave: "entregas_no_prazo", titulo: "Entregas no prazo", natureza: "qualidade",
          valor: entregues.length ? Math.round((noPrazo.length / entregues.length) * 100) : null,
          meta: 90, unidade: "%", fonte: "content_cards" },
        { chave: "retrabalho", titulo: "Retrabalho", natureza: "inversa",
          valor: entregues.length ? Math.round((rework / entregues.length) * 100) : null,
          meta: 10, unidade: "%", fonte: "cs_rework_events (Loninho)" },
        { chave: "saude_carteira", titulo: "Saúde da carteira", natureza: "qualidade",
          valor: saudeMedia, meta: 80, fonte: "health + sinais do Loninho" },
        { chave: "organizacao", titulo: "Pedidos respondidos", natureza: "qualidade",
          valor: pedidos > 0 ? Math.round(((pedidos - semResposta) / pedidos) * 100) : null,
          meta: 90, unidade: "%", fonte: "cs_demandas (Loninho)" },
      ];

      pessoas.push(scorePessoa({ pessoa: nome, funcao, indicadores: ind, carteira: meusClientes.length }));
    }
  }

  // ── CAPACIDADE POR ÁREA ────────────────────────────────────────────────
  const capacidades = porFuncao.map(({ funcao, campo }) => {
    const atendidos = ativos.filter((c) => !!(c as Record<string, unknown>)[campo]).length;
    const quantos = new Set(ativos.map((c) => (c as Record<string, unknown>)[campo] as string).filter(Boolean)).size;
    return capacidade(funcao, atendidos, quantos || 1);
  });

  // ── DIMENSÕES DO LONE SCORE ────────────────────────────────────────────
  const f = fracaoDoMes();
  const churned = clientes.filter((c) => c.churned_at
    && (c.churned_at as string) >= inicioMes).length;
  const novos = clientes.filter((c) => (c.created_at as string) >= inicioMes).length;
  // "draft" é o único status que existe hoje na tabela (4 linhas, todas rascunho). Filtrar por
  // "active" devolvia zero e a lacuna do financeiro dizia "0 contratos" — verdadeiro por acaso,
  // pelo motivo errado. Conta o que está assinado OU ativo; rascunho não é receita.
  const contratosAtivos = (contratosQ.data ?? []).filter((c) => c.status === "active" || c.status === "signed");
  const mrr = contratosAtivos.reduce((s, c) => s + Number(c.monthly_value ?? 0), 0);

  const dims: ResultadoDimensao[] = [
    // Financeiro: só há 4 contratos cadastrados de ~43 clientes ativos. Publicar MRR sobre isso
    // seria inventar o número mais pesado do score — fica sem dado até a base existir.
    scoreDimensao("financeiro", [
      { chave: "mrr", titulo: "MRR contratado", natureza: "acumulativa",
        valor: contratosAtivos.length >= ativos.length * 0.8 ? mrr : null,
        meta: 0, unidade: "R$", fracaoDoPeriodo: f,
        fonte: `contracts (${contratosAtivos.length} de ${ativos.length} clientes)` },
    ]),
    scoreDimensao("clientes", [
      { chave: "churn", titulo: "Churn no mês", natureza: "inversa",
        valor: ativos.length ? Number(((churned / ativos.length) * 100).toFixed(1)) : null,
        meta: 5, unidade: "%", fonte: "clients.churned_at" },
      { chave: "saude", titulo: "Saúde média da carteira", natureza: "qualidade",
        valor: dist.media, meta: 80, fonte: "health score" },
      { chave: "em_risco", titulo: "Clientes em risco", natureza: "inversa",
        valor: dist.total ? Number(((dist.risco / dist.total) * 100).toFixed(1)) : null,
        meta: 10, unidade: "%", fonte: "health score" },
    ]),
    scoreDimensao("comercial", [
      { chave: "novos", titulo: "Novos clientes no mês", natureza: "acumulativa",
        valor: novos, meta: 3, fracaoDoPeriodo: f, fonte: "clients.created_at" },
    ]),
    scoreDimensao("operacao", [
      { chave: "atraso_interno", titulo: "Atraso interno", natureza: "inversa",
        valor: atrasos.total ? atrasos.atrasoInternoPct : null, meta: 10, unidade: "%",
        fonte: "content_cards (separado do atraso do cliente)" },
      { chave: "capacidade", titulo: "Capacidade utilizada", natureza: "inversa",
        valor: Math.round(Math.max(...capacidades.map((c) => c.utilizacao)) * 100),
        meta: 90, unidade: "%", fonte: "carteira por pessoa" },
    ]),
    scoreDimensao("qualidade", [
      { chave: "sem_contato", titulo: "Clientes sem contato +15d", natureza: "inversa",
        valor: ativos.length
          ? Number((([...sinais.values()].filter((s) => (s.diasSemContato ?? 999) > 15).length / ativos.length) * 100).toFixed(1))
          : null,
        meta: 10, unidade: "%", fonte: "cs_message_corpus (Loninho)" },
    ]),
  ];

  const score = loneScore(dims);

  return NextResponse.json({
    ok: true,
    lone_score: { ...score, leitura: leituraLoneScore(score) },
    saude: {
      ...dist,
      situacao: situacaoDaDistribuicao(dist),
      // Só os em risco vão nomeados: é o que exige ação. A lista completa tem rota própria.
      detalhe: dist.emRisco.slice(0, 10),
    },
    pessoas: pessoas.sort((a, b) => (a.score ?? 999) - (b.score ?? 999)),
    capacidade: capacidades,
    atrasos,
    // Confiança dos dados: o que está medido e o que não está (ponto 18 do documento).
    confianca: {
      cobertura_score: score.cobertura,
      clientes_com_conversa: [...sinais.values()].filter((s) => s.ultimoContato).length,
      clientes_ativos: ativos.length,
      contratos_cadastrados: contratosAtivos.length,
      lacunas: [
        contratosAtivos.length < ativos.length * 0.8
          ? `financeiro sem base: ${contratosAtivos.length} contratos para ${ativos.length} clientes ativos`
          : "",
        saude.every((s) => s.componentes.find((c) => c.chave === "resultado")?.valor === null)
          ? "resultado do cliente (30% da saúde) não tem fonte por cliente"
          : "",
      ].filter(Boolean),
    },
  });
}
