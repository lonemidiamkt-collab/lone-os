// lib/reports/revisaoSemanal.ts — a REVISÃO SEMANAL DE OPERAÇÃO (N31, Leva 7D). PURO.
//
// Toda segunda, uma folha para a gestão com a semana que fechou (segunda a domingo):
//   · posts: planejados no quadro × no ar de verdade (Instagram) × registrados no quadro;
//   · atrasos: card com prazo vencido nas etapas em que prazo é compromisso (com o designer,
//     revisão interna, com o cliente) e post que saiu depois do dia planejado;
//   · reuniões: realizadas na semana e as do ciclo do mês ainda sem marcar (ou que passaram sem
//     registro);
//   · pendências por responsável: o acima, mais as tarefas vencidas — cada pessoa com a sua parte.
//
// A contagem de posts usa o MESMO casamento card↔post do "No ar" automático e da aba Resultados
// (lib/conteudo/no-ar.ts): mesmo cliente, ±1 dia, mesmo formato primeiro. Cliente sem Instagram
// vinculado não entra em "sem post" — sem a fonte, "não saiu" seria chute.
//
// Quem grava/lê o banco: lib/reports/revisaoSemanalDados.ts. PDF: lib/reports/revisaoSemanalPdf.ts.
// Job: app/api/system/revisao-semanal (segunda, nasce DESLIGADO).

import { spDateStr } from "@/lib/utils";
import { ETAPAS_COMPROMETIDAS, rotuloDoStatus, statusNaEtapa } from "@/lib/conteudo/etapas";
import {
  casarPostsECards, dataPlanejada, diasEntre, estaNoAr, formatoDoCard, formatoDoInstagram,
  reservarPostsDeQuemJaEstaNoAr, somarDias, vaiProFeed, JANELA_DIAS,
  type CardCasavel, type LinhaCard, type LinhaPost,
} from "@/lib/conteudo/no-ar";

export const SEM_DONO = "Sem responsável";

// ─── A semana ───────────────────────────────────────────────────────────────

export interface Semana { inicio: string; fim: string; rotulo: string }

const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

/** A semana (segunda a domingo) ANTERIOR à semana de `hoje`. Na segunda, é a que acabou ontem. */
export function semanaAnterior(hoje: string): Semana {
  const d = new Date(`${hoje}T12:00:00Z`);
  const desdeSegunda = (d.getUTCDay() + 6) % 7; // seg = 0 … dom = 6
  const segundaDestaSemana = somarDias(hoje, -desdeSegunda);
  const inicio = somarDias(segundaDestaSemana, -7);
  const fim = somarDias(inicio, 6);
  return { inicio, fim, rotulo: `${ddmm(inicio)} a ${ddmm(fim)}` };
}

// ─── Entradas ───────────────────────────────────────────────────────────────

export interface ClienteRevisao {
  id: string;
  nome: string;
  social: string | null;
  designer: string | null;
  temInstagram: boolean;
}

export interface ReuniaoRevisao {
  clientId: string;
  responsavel: string | null;
  estado: string;
  startAt?: string | null;
  realizadaEm?: string | null;
  mesReferencia?: string | null;
}

export interface TarefaRevisao {
  titulo: string;
  dono: string | null;
  cliente?: string | null;
  vencimento: string; // YYYY-MM-DD
}

// ─── Saídas ─────────────────────────────────────────────────────────────────

export interface ContagemPosts {
  /** Cards com data planejada na semana (que vão pro feed). */
  planejados: number;
  /** Posts que foram ao ar no Instagram na semana. */
  noAr: number;
  /** Cards marcados "No ar" no quadro com data na semana (à mão ou pelo Instagram). */
  registrados: number;
  /** Planejados na semana que não acharam post (só clientes com Instagram vinculado). */
  semPost: number;
  /** Posts que casaram com card e saíram DEPOIS do dia planejado. */
  depoisDoDia: number;
}

export interface CardAtrasado { cliente: string; titulo: string; etapa: string; dias: number }
export interface ReuniaoPendente { cliente: string; motivo: string }
export interface TarefaVencida { titulo: string; cliente: string | null; dias: number }

export interface BlocoPessoa {
  pessoa: string;
  posts: ContagemPosts;
  cardsAtrasados: CardAtrasado[];
  reunioesFeitas: string[];
  reunioesPendentes: ReuniaoPendente[];
  tarefasVencidas: TarefaVencida[];
}

export interface Revisao {
  semana: Semana;
  hoje: string;
  totais: ContagemPosts & {
    cardsAtrasados: number;
    reunioesFeitas: number;
    reunioesPendentes: number;
    tarefasVencidas: number;
    clientesSemInstagram: number;
  };
  pessoas: BlocoPessoa[];
}

const zero = (): ContagemPosts => ({ planejados: 0, noAr: 0, registrados: 0, semPost: 0, depoisDoDia: 0 });
const nomeOu = (s: string | null | undefined) => (s ?? "").trim() || SEM_DONO;

/**
 * Monta a revisão. `posts` e `cards` podem vir com margem de alguns dias (o casamento olha ±1 dia);
 * o que conta é o que cai dentro da semana.
 */
export function montarRevisao(args: {
  semana: Semana;
  hoje: string;
  clientes: readonly ClienteRevisao[];
  posts: readonly LinhaPost[];
  cards: readonly LinhaCard[];
  reunioes: readonly ReuniaoRevisao[];
  tarefas: readonly TarefaRevisao[];
}): Revisao {
  const { semana, hoje } = args;
  const clientes = new Map(args.clientes.map((c) => [c.id, c]));
  const naSemana = (dia: string | null | undefined) => !!dia && dia >= semana.inicio && dia <= semana.fim;

  const pessoas = new Map<string, BlocoPessoa>();
  const daPessoa = (nome: string | null | undefined): BlocoPessoa => {
    const p = nomeOu(nome);
    let b = pessoas.get(p);
    if (!b) {
      b = { pessoa: p, posts: zero(), cardsAtrasados: [], reunioesFeitas: [], reunioesPendentes: [], tarefasVencidas: [] };
      pessoas.set(p, b);
    }
    return b;
  };
  const socialDo = (clientId: string) => clientes.get(clientId)?.social ?? null;
  const nomeDo = (clientId: string) => clientes.get(clientId)?.nome ?? "Cliente";

  // ── Posts ────────────────────────────────────────────────────────────────
  const cardsFeed = args.cards.filter((c) => !c.archived_at && clientes.has(c.client_id) && vaiProFeed(c));
  const posts = args.posts.filter((p) => clientes.has(p.client_id));
  const dataDoCard = new Map<string, string>();
  for (const c of cardsFeed) {
    const d = dataPlanejada({ dueDate: c.due_date, scheduledAt: c.scheduled_at });
    if (d) dataDoCard.set(c.id, d);
  }
  const comData = cardsFeed.filter((c) => dataDoCard.has(c.id));

  const { usados, donoDoPost } = reservarPostsDeQuemJaEstaNoAr(comData, posts, JANELA_DIAS);
  const abertos: CardCasavel[] = comData.filter((c) => !estaNoAr(c.status)).map((c) => ({
    id: c.id, clientId: c.client_id, data: dataDoCard.get(c.id)!, hora: c.due_time ?? null, formato: formatoDoCard(c.format),
  }));
  const casados = casarPostsECards(abertos, posts.map((p) => ({
    mediaId: p.media_id, clientId: p.client_id, postedAt: p.posted_at, formato: formatoDoInstagram(p.tipo),
  })), { postsJaUsados: usados });
  const cardDoPost = new Map<string, string>();
  for (const [cardId, mediaId] of donoDoPost) cardDoPost.set(mediaId, cardId);
  for (const par of casados.pares) cardDoPost.set(par.mediaId, par.cardId);
  const cardComPost = new Set(cardDoPost.values());

  const totais = zero();
  const conta = (clientId: string, campo: keyof ContagemPosts) => {
    daPessoa(socialDo(clientId)).posts[campo]++;
    totais[campo]++;
  };

  for (const p of posts) {
    const dia = spDateStr(p.posted_at);
    if (!naSemana(dia)) continue;
    conta(p.client_id, "noAr");
    const cardId = cardDoPost.get(p.media_id);
    const planejado = cardId ? dataDoCard.get(cardId) : undefined;
    if (planejado && diasEntre(planejado, dia) > 0) conta(p.client_id, "depoisDoDia");
  }
  // Registrado no quadro: card "No ar" cujo dia de publicação (ou, sem ele, o planejado) cai na semana.
  // Arquivado vale aqui: o time arquiva depois de postar, para limpar o quadro.
  for (const c of args.cards) {
    if (!estaNoAr(c.status) || !clientes.has(c.client_id) || !vaiProFeed(c)) continue;
    const dia = c.publish_verified_at ? spDateStr(c.publish_verified_at) : dataPlanejada({ dueDate: c.due_date, scheduledAt: c.scheduled_at });
    if (naSemana(dia)) conta(c.client_id, "registrados");
  }
  for (const c of comData) {
    const data = dataDoCard.get(c.id)!;
    const noAr = estaNoAr(c.status);
    if (!naSemana(data)) continue;
    conta(c.client_id, "planejados");
    // Sem post: janela fechada, cliente com Instagram, e nem card "no ar" (quem marcou à mão conferiu).
    if (!noAr && !cardComPost.has(c.id) && somarDias(data, JANELA_DIAS) < hoje && clientes.get(c.client_id)?.temInstagram) {
      conta(c.client_id, "semPost");
    }
  }

  // ── Cards atrasados AGORA (prazo vencido onde prazo é compromisso) ───────
  let cardsAtrasados = 0;
  for (const c of args.cards) {
    if (c.archived_at || !clientes.has(c.client_id) || !c.due_date) continue;
    if (!statusNaEtapa(c.status, ...ETAPAS_COMPROMETIDAS)) continue;
    const dias = diasEntre(c.due_date.slice(0, 10), hoje);
    if (dias <= 0) continue;
    const cli = clientes.get(c.client_id)!;
    // Com o designer, quem deve é o designer do cliente; nas outras etapas, o social do card.
    const dono = statusNaEtapa(c.status, "com_designer") ? (cli.designer ?? c.social_media ?? cli.social) : (c.social_media ?? cli.social);
    daPessoa(dono).cardsAtrasados.push({ cliente: cli.nome, titulo: (c.title ?? "").trim() || "Card sem título", etapa: rotuloDoStatus(c.status), dias });
    cardsAtrasados++;
  }

  // ── Reuniões ─────────────────────────────────────────────────────────────
  let reunioesFeitas = 0, reunioesPendentes = 0;
  const mesDeHoje = hoje.slice(0, 7);
  for (const r of args.reunioes) {
    if (!clientes.has(r.clientId)) continue;
    const dono = r.responsavel ?? socialDo(r.clientId);
    if (r.estado === "realizada" && r.realizadaEm && naSemana(spDateStr(r.realizadaEm))) {
      daPessoa(dono).reunioesFeitas.push(nomeDo(r.clientId));
      reunioesFeitas++;
      continue;
    }
    let motivo: string | null = null;
    if (r.estado === "agendada" && r.startAt && spDateStr(r.startAt) < hoje) motivo = "passou sem registro de realizada";
    else if ((r.estado === "pendente" || r.estado === "proposta") && r.mesReferencia === mesDeHoje) {
      motivo = r.estado === "proposta" ? "horário proposto, falta o cliente confirmar" : "reunião do mês ainda não marcada";
    }
    if (motivo) { daPessoa(dono).reunioesPendentes.push({ cliente: nomeDo(r.clientId), motivo }); reunioesPendentes++; }
  }

  // ── Tarefas vencidas ─────────────────────────────────────────────────────
  let tarefasVencidas = 0;
  for (const t of args.tarefas) {
    const dias = diasEntre(t.vencimento.slice(0, 10), hoje);
    if (dias <= 0) continue;
    daPessoa(t.dono).tarefasVencidas.push({ titulo: t.titulo, cliente: t.cliente ?? null, dias });
    tarefasVencidas++;
  }

  const lista = [...pessoas.values()];
  for (const b of lista) {
    b.cardsAtrasados.sort((a, z) => z.dias - a.dias);
    b.tarefasVencidas.sort((a, z) => z.dias - a.dias);
    b.reunioesFeitas.sort((a, z) => a.localeCompare(z));
  }
  lista.sort((a, b) => Number(a.pessoa === SEM_DONO) - Number(b.pessoa === SEM_DONO) || a.pessoa.localeCompare(b.pessoa));

  return {
    semana, hoje,
    totais: {
      ...totais, cardsAtrasados, reunioesFeitas, reunioesPendentes, tarefasVencidas,
      clientesSemInstagram: args.clientes.filter((c) => !c.temInstagram).length,
    },
    pessoas: lista,
  };
}

/** Legenda curta que acompanha o PDF no grupo interno (o CEO não quer textão no grupo). */
export function legendaRevisao(r: Revisao): string {
  const t = r.totais;
  const atrasos = t.cardsAtrasados + t.tarefasVencidas;
  return [
    `📋 *Revisão da semana* (${r.semana.rotulo})`,
    `${t.noAr} ${t.noAr === 1 ? "post no ar" : "posts no ar"} de ${t.planejados} ${t.planejados === 1 ? "planejado" : "planejados"} · ${atrasos} ${atrasos === 1 ? "atraso" : "atrasos"} · ${t.reunioesFeitas} ${t.reunioesFeitas === 1 ? "reunião" : "reuniões"}`,
    "Detalhes por responsável no PDF.",
  ].join("\n");
}
