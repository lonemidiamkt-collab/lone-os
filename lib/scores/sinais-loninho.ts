// O QUE O LONINHO SABE, VIRANDO INDICADOR.
//
// PRA QUE (Roberto, 02/09): "quero ligar o loninho a essa parte para ele poder pegar informações
// dos grupos, dos atendimentos, etc e também jogar nesse banco de dados."
//
// O agente já coletava tudo isto e nada chegava aos indicadores:
//   cs_message_corpus   10.434 mensagens com cliente identificado
//   cs_demandas         pedidos, reclamações, tipo, urgência, quem decidiu e quando
//   cs_rework_events    145 retrabalhos COM MOTIVO
//   cs_client_events    datas e compromissos ditos pelo cliente
//
// O caso mais gritante: o card "Sem contato +15d: 50 de 50 clientes" vinha de `interaction_logs`,
// que tem UMA linha no banco inteiro — ninguém usa o botão "Registrar". Enquanto isso o Loninho
// tinha 10.434 mensagens datadas por cliente. O indicador estava certo na intenção e cego na
// fonte: media adoção de um botão, não relacionamento com o cliente.

import { supabaseAdmin } from "@/lib/supabase/server";

export interface SinaisCliente {
  clientId: string;
  /** Última conversa NO GRUPO do cliente — pelo corpus do agente, não por registro manual. */
  ultimoContato: string | null;
  diasSemContato: number | null;
  /** Mensagens trocadas nos últimos 30 dias: mede relacionamento vivo, não só o último toque. */
  mensagens30d: number;
  /** Quantas partiram do CLIENTE. Cliente que não fala é sinal de esfriamento. */
  mensagensCliente30d: number;
  reclamacoes30d: number;
  pedidos30d: number;
  /** Pedidos que o time nunca decidiu (expiraram ou seguem pendentes). */
  pedidosSemResposta: number;
  retrabalhos30d: number;
  /** Motivos do retrabalho, do mais frequente ao menos — é o que revela processo ruim. */
  motivosRetrabalho: { motivo: string; n: number }[];
  /** Mensagens nos 30 dias ANTERIORES aos últimos 30 — serve para ver esfriamento. */
  mensagens30dAnterior: number;
  /** Minutos, em mediana, entre o cliente falar e alguém do time responder no grupo. */
  minutosParaResponder: number | null;
  /** Quantas vezes o cliente falou e ninguém respondeu no mesmo dia. */
  semRespostaNoDia: number;
}

const DIAS = 86_400_000;

/**
 * Puxa, de uma vez, os sinais que o agente produziu para todos os clientes.
 *
 * Em lote de propósito: o cockpit precisa disso para ~50 clientes e uma consulta por cliente
 * transformaria o carregamento da tela em 300 idas ao banco.
 */
export async function sinaisDoLoninho(clientIds: string[]): Promise<Map<string, SinaisCliente>> {
  const out = new Map<string, SinaisCliente>();
  if (!clientIds.length) return out;

  const desde30 = new Date(Date.now() - 30 * DIAS).toISOString();

  const [corpus, demandas, rework] = await Promise.all([
    supabaseAdmin.from("cs_message_corpus")
      .select("client_id, created_at, is_team")
      .in("client_id", clientIds)
      .gte("created_at", new Date(Date.now() - 180 * DIAS).toISOString())
      .order("created_at", { ascending: true }),
    supabaseAdmin.from("cs_demandas")
      .select("client_id, tipo, status, created_at")
      .in("client_id", clientIds)
      .gte("created_at", desde30),
    supabaseAdmin.from("cs_rework_events")
      .select("client_id, reason, created_at")
      .in("client_id", clientIds)
      .gte("created_at", desde30),
  ]);

  for (const id of clientIds) {
    out.set(id, {
      clientId: id, ultimoContato: null, diasSemContato: null,
      mensagens30d: 0, mensagensCliente30d: 0, reclamacoes30d: 0,
      pedidos30d: 0, pedidosSemResposta: 0, retrabalhos30d: 0, motivosRetrabalho: [],
      mensagens30dAnterior: 0, minutosParaResponder: null, semRespostaNoDia: 0,
    });
  }

  // ── TEMPO DE RESPOSTA, extraído da conversa ─────────────────────────────
  //
  // O SLA de atendimento nunca teve fonte: não existe campo em lugar nenhum dizendo quanto o time
  // demora para responder. Mas o corpus tem a sequência das falas com horário — dá para medir
  // andando pelas mensagens de cada grupo e cronometrando a distância entre a fala do cliente e
  // a primeira resposta nossa depois dela.
  //
  // Mediana, não média: uma única mensagem respondida no dia seguinte (fim de semana, feriado)
  // arrastaria a média e faria um atendimento bom parecer ruim.
  const esperas = new Map<string, number[]>();
  const aguardando = new Map<string, string>();     // clientId → horário da fala do cliente
  const semResposta = new Map<string, number>();
  for (const m of corpus.data ?? []) {
    const cid = m.client_id as string;
    if (!cid) continue;
    const q = m.created_at as string;
    if (!m.is_team) {
      // Só marca a PRIMEIRA fala de uma sequência do cliente — senão cinco mensagens seguidas
      // dele viravam cinco esperas idênticas e distorciam a mediana.
      if (!aguardando.has(cid)) aguardando.set(cid, q);
    } else {
      const desde = aguardando.get(cid);
      if (desde) {
        const min = (new Date(q).getTime() - new Date(desde).getTime()) / 60000;
        // Acima de 24h já não mede atendimento: mede outra conversa começando.
        if (min >= 0 && min <= 1440) (esperas.get(cid) ?? esperas.set(cid, []).get(cid)!).push(min);
        else semResposta.set(cid, (semResposta.get(cid) ?? 0) + 1);
        aguardando.delete(cid);
      }
    }
  }
  // Fala do cliente que ficou sem NENHUMA resposta até agora.
  for (const [cid] of aguardando) semResposta.set(cid, (semResposta.get(cid) ?? 0) + 1);

  const corte30 = Date.now() - 30 * DIAS;
  const corte60 = Date.now() - 60 * DIAS;
  for (const m of corpus.data ?? []) {
    const s = out.get(m.client_id as string);
    if (!s) continue;
    const q = m.created_at as string;
    if (!s.ultimoContato || q > s.ultimoContato) s.ultimoContato = q;
    const t = new Date(q).getTime();
    if (t < corte30 && t >= corte60) s.mensagens30dAnterior += 1;
    if (t >= corte30) {
      s.mensagens30d += 1;
      // `is_team` marca fala NOSSA. O resto é o cliente — e é o lado que importa para engajamento:
      // grupo onde só a agência fala é grupo esfriando.
      if (!m.is_team) s.mensagensCliente30d += 1;
    }
  }

  for (const d of demandas.data ?? []) {
    const s = out.get(d.client_id as string);
    if (!s) continue;
    s.pedidos30d += 1;
    if (d.tipo === "reclamacao") s.reclamacoes30d += 1;
    // "expirada" e "pendente" são o mesmo fato do ponto de vista do cliente: ninguém respondeu.
    if (d.status === "expirada" || d.status === "pendente") s.pedidosSemResposta += 1;
  }

  const motivos = new Map<string, Map<string, number>>();
  for (const r of rework.data ?? []) {
    const s = out.get(r.client_id as string);
    if (!s) continue;
    s.retrabalhos30d += 1;
    const motivo = ((r.reason as string) || "sem motivo registrado").trim();
    const m = motivos.get(s.clientId) ?? new Map<string, number>();
    m.set(motivo, (m.get(motivo) ?? 0) + 1);
    motivos.set(s.clientId, m);
  }
  for (const [id, m] of motivos) {
    const s = out.get(id);
    if (s) s.motivosRetrabalho = [...m.entries()].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n);
  }

  for (const s of out.values()) {
    s.diasSemContato = s.ultimoContato
      ? Math.floor((Date.now() - new Date(s.ultimoContato).getTime()) / DIAS)
      : null;
    const e = esperas.get(s.clientId);
    if (e?.length) {
      const ord = [...e].sort((a, b) => a - b);
      s.minutosParaResponder = Math.round(ord[Math.floor(ord.length / 2)]);
    }
    s.semRespostaNoDia = semResposta.get(s.clientId) ?? 0;
  }
  return out;
}

// ── DOS SINAIS PARA OS COMPONENTES DE SAÚDE ──────────────────────────────
//
// Cada função abaixo devolve 0..100 ou `null`. `null` quer dizer "não dá para medir", e o Health
// Score redistribui o peso — nunca conta como zero. Cliente novo sem histórico não pode nascer
// doente.

/** Relacionamento: há quanto tempo alguém falou com este cliente. */
export function componenteRelacionamento(s: SinaisCliente): number | null {
  if (s.diasSemContato === null) return null;   // nunca houve conversa registrada: não sabemos
  const d = s.diasSemContato;
  if (d <= 3) return 100;
  if (d <= 7) return 85;
  if (d <= 15) return 65;
  if (d <= 30) return 40;
  return 15;
}

/** Engajamento DO CLIENTE: ele responde, ou o grupo virou monólogo da agência? */
export function componenteEngajamento(s: SinaisCliente): number | null {
  if (s.mensagens30d === 0) return null;
  const proporcao = s.mensagensCliente30d / s.mensagens30d;
  // Um grupo saudável tem o cliente falando perto de metade do tempo. Abaixo de 10% é a agência
  // falando sozinha — que costuma preceder o silêncio total.
  if (proporcao >= 0.35) return 100;
  if (proporcao >= 0.2) return 80;
  if (proporcao >= 0.1) return 55;
  return 25;
}

/** Sentimento: reclamação recente é o sinal mais forte que o agente captura. */
export function componenteSentimento(s: SinaisCliente): number | null {
  if (s.mensagens30d === 0) return null;
  if (s.reclamacoes30d >= 3) return 15;
  if (s.reclamacoes30d === 2) return 35;
  if (s.reclamacoes30d === 1) return 55;
  return 90;
}

/** Pendências: pedido do cliente que o time nunca respondeu. */
export function componentePendencias(s: SinaisCliente): number | null {
  if (s.pedidos30d === 0) return null;
  const pct = s.pedidosSemResposta / s.pedidos30d;
  if (pct === 0) return 100;
  if (pct <= 0.25) return 75;
  if (pct <= 0.5) return 50;
  return 20;
}

/**
 * Atendimento: quanto o time demora para responder no grupo.
 *
 * Este componente não tinha fonte no sistema — não existe campo de SLA em lugar nenhum. Sai da
 * própria conversa: mediana do tempo entre a fala do cliente e a primeira resposta nossa.
 */
export function componenteAtendimento(s: SinaisCliente): number | null {
  if (s.minutosParaResponder === null && s.semRespostaNoDia === 0) return null;
  // Fala do cliente que ficou sem resposta pesa mais que demora: silêncio é pior que lentidão.
  if (s.semRespostaNoDia >= 3) return 25;
  const min = s.minutosParaResponder;
  if (min === null) return s.semRespostaNoDia > 0 ? 45 : null;
  if (min <= 30) return 100;
  if (min <= 120) return 85;
  if (min <= 360) return 65;
  if (min <= 720) return 45;
  return 30;
}

/**
 * Tendência da conversa: o grupo está esfriando?
 *
 * Queda forte de volume costuma vir antes do churn — e antes de qualquer reclamação. É o sinal
 * mais precoce que o corpus oferece.
 */
export function tendenciaConversa(s: SinaisCliente): { variacao: number | null; esfriando: boolean } {
  // Sem base de comparação não há tendência; um cliente novo não está "esfriando".
  if (s.mensagens30dAnterior < 5) return { variacao: null, esfriando: false };
  const v = (s.mensagens30d - s.mensagens30dAnterior) / s.mensagens30dAnterior;
  return { variacao: Math.round(v * 100), esfriando: v <= -0.5 };
}

/** Frases prontas explicando a nota — é o "por quê" que o Roberto pediu ver no painel. */
export function observacoes(s: SinaisCliente): string[] {
  const o: string[] = [];
  if (s.diasSemContato !== null && s.diasSemContato > 15) o.push(`${s.diasSemContato} dias sem contato no grupo`);
  if (s.reclamacoes30d > 0) o.push(`${s.reclamacoes30d} reclamação${s.reclamacoes30d > 1 ? "ões" : ""} nos últimos 30 dias`);
  if (s.pedidosSemResposta > 0) o.push(`${s.pedidosSemResposta} pedido${s.pedidosSemResposta > 1 ? "s" : ""} sem resposta do time`);
  if (s.retrabalhos30d >= 3) {
    const top = s.motivosRetrabalho[0];
    o.push(`${s.retrabalhos30d} retrabalhos${top ? ` (principal: ${top.motivo})` : ""}`);
  }
  if (s.mensagens30d > 0 && s.mensagensCliente30d === 0) o.push("o cliente não falou nada no grupo em 30 dias");
  if (s.semRespostaNoDia >= 2) o.push(`${s.semRespostaNoDia} falas do cliente sem resposta no mesmo dia`);
  if (s.minutosParaResponder !== null && s.minutosParaResponder > 360) {
    const h = Math.round(s.minutosParaResponder / 60);
    o.push(`demoramos ${h}h para responder, na mediana`);
  }
  const t = tendenciaConversa(s);
  if (t.esfriando) o.push(`conversa caiu ${Math.abs(t.variacao ?? 0)}% em relação ao mês anterior`);
  return o;
}
