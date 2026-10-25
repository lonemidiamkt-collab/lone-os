// lib/cs/plano-em-cards.ts — o planejamento vira CARD no board.
//
// O buraco (medido em 27/07): 7 calendários gerados na vida, `content_period_plans` com ZERO
// linhas e nenhum card criado a partir de plano. O motor mais caro do sistema — diagnóstico,
// objetivo, mix de pilares, peça a peça — produzia um PDF bonito que morria no grupo.
//
// Faltava o último passo. Pela plataforma existe um botão "criar"; pelo WhatsApp não existia nada.
// E ninguém clicava no botão porque a tela já mostrava o plano pronto — parecia terminado.
//
// Continua HUMAN-GATE: o agente NÃO abre card sozinho. Ele monta, mostra, e pergunta. Um "cria"
// no grupo fecha o ciclo. Mesma regra de toda sugestão dele.
//
// 25/10/2026 (auditoria de erro recuperável, 11.2): o "cria" só vale CITANDO a mensagem do plano
// (regra em lib/cs/plano-confirmacao.ts). O job guarda, em `result`, os ids das mensagens do plano
// (msgIdPergunta, msgIdPronto) e, depois de abrir, os cards criados e a mensagem de confirmação —
// é ela que o "desfaz" cita para arquivar os cards. A reserva é atômica: "ok" + "cria" em seguida
// não abrem os cards duas vezes.

import { supabaseAdmin } from "@/lib/supabase/server";
import { criarCardDemanda } from "@/lib/cs/card";
import { pecaParaTexto, type PecaFinal } from "@/lib/cs/motor";
import type { DecisaoDeConteudo } from "@/lib/cs/pipeline";
import { ehConfirmacaoSolta } from "@/lib/cs/plano-confirmacao";

export interface PlanoPendente {
  clientId: string;
  clienteNome: string;
  periodo: string;
  decisoes: DecisaoDeConteudo[];
  pecas: PecaFinal[];
}

/** Plano de período (mês/quinzena) fica de pé por uma semana: é o tempo real de o cliente responder. */
const JANELA_PLANO_MIN = 7 * 24 * 60;

/**
 * Guarda o plano recém-montado esperando o "cria" do time. Usa `content_calendar_jobs`, que já
 * existe pra isso — nada de tabela nova pra uma fila de um item. Devolve o id do job (null = não guardou).
 */
export async function guardarPendente(groupJid: string, p: PlanoPendente): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.from("content_calendar_jobs").insert({
      client_id: p.clientId, modo: "pendente", status: "aguardando_ok",
      contexto: groupJid,
      result: { clienteNome: p.clienteNome, periodo: p.periodo, decisoes: p.decisoes, pecas: p.pecas },
    }).select("id").maybeSingle();
    if (error) { console.error("[plano-em-cards] não guardei o plano:", error.message); return null; }
    return (data?.id as string) ?? null;
  } catch { return null; }
}

/** Junta campos ao `result` do job (ids das mensagens, cards criados). Best-effort, com o erro no log. */
async function anotarNoJob(jobId: string, campos: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("content_calendar_jobs").select("result").eq("id", jobId).maybeSingle();
  if (error || !data) { console.error("[plano-em-cards] não li o job:", error?.message ?? "sumiu"); return false; }
  const { error: e2 } = await supabaseAdmin.from("content_calendar_jobs")
    .update({ result: { ...((data.result as Record<string, unknown>) ?? {}), ...campos } }).eq("id", jobId);
  if (e2) { console.error("[plano-em-cards] não anotei no job:", e2.message); return false; }
  return true;
}

/** Os ids das mensagens do plano no grupo: é citando uma delas que o "cria" vale. */
export async function marcarMensagensDoPlano(jobId: string, ids: { msgIdPergunta?: string | null; msgIdPronto?: string | null }): Promise<void> {
  const campos = Object.fromEntries(Object.entries(ids).filter(([, v]) => !!v));
  if (Object.keys(campos).length) await anotarNoJob(jobId, campos);
}

type PlanoComJob = PlanoPendente & { jobId: string };

function planoDaLinha(data: { id: unknown; client_id: unknown; result: unknown }): PlanoComJob {
  const r = (data.result as Record<string, unknown>) ?? {};
  return {
    jobId: data.id as string,
    clientId: data.client_id as string,
    clienteNome: (r.clienteNome as string) || "Cliente",
    periodo: (r.periodo as string) || "",
    decisoes: (r.decisoes as DecisaoDeConteudo[]) || [],
    pecas: (r.pecas as PecaFinal[]) || [],
  };
}

const desde = () => new Date(Date.now() - JANELA_PLANO_MIN * 60_000).toISOString();
// Id de mensagem do WhatsApp é alfanumérico; qualquer outra coisa não entra no filtro.
const idSeguro = (id: string) => /^[A-Za-z0-9_-]{4,80}$/.test(id);

/**
 * O plano cuja mensagem foi CITADA (pergunta "Quer que eu abra…" ou o "📅 Montei…"). `jaAberto` = os
 * cards desse plano já saíram (citar de novo não abre outra vez).
 */
export async function planoCitado(groupJid: string, quotedMsgId: string | null | undefined): Promise<(PlanoComJob & { jaAberto: boolean }) | null> {
  if (!quotedMsgId || !idSeguro(quotedMsgId)) return null;
  const { data, error } = await supabaseAdmin.from("content_calendar_jobs")
    .select("id, client_id, result, status, created_at")
    .eq("contexto", groupJid).gte("created_at", desde())
    .or(`result->>msgIdPergunta.eq.${quotedMsgId},result->>msgIdPronto.eq.${quotedMsgId}`)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) { console.error("[plano-em-cards] planoCitado:", error.message); return null; }
  return data?.result ? { ...planoDaLinha(data), jaAberto: data.status !== "aguardando_ok" } : null;
}

/** Os planos que este grupo montou e ainda não viraram card (para dizer quais estão esperando). */
export async function planosPendentes(groupJid: string): Promise<{ clienteNome: string; total: number }[]> {
  const { data, error } = await supabaseAdmin.from("content_calendar_jobs")
    .select("id, client_id, result, created_at")
    .eq("status", "aguardando_ok").eq("contexto", groupJid).gte("created_at", desde())
    .order("created_at", { ascending: false }).limit(5);
  if (error) { console.error("[plano-em-cards] planosPendentes:", error.message); return []; }
  return (data ?? []).filter((d) => d.result).map((d) => {
    const p = planoDaLinha(d);
    return { clienteNome: p.clienteNome, total: p.decisoes.length };
  });
}

/**
 * Reserva o plano ANTES de criar: só uma mensagem ganha. O status vai direto para "done" (o mesmo de
 * antes) — um segundo "cria" não acha mais o plano pendente e não duplica os cards.
 */
export async function reservarPlano(jobId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("content_calendar_jobs")
    .update({ status: "done" }).eq("id", jobId).eq("status", "aguardando_ok").select("id");
  if (error) { console.error("[plano-em-cards] reservar:", error.message); return false; }
  return !!data?.length;
}

export interface ResultadoCriacao {
  criados: number;
  total: number;
  /** Datas que não viraram card — o time precisa saber o que ficou de fora. */
  falharam: string[];
  /** Os cards abertos — o "desfaz" arquiva exatamente estes. */
  cardIds: string[];
}

/** Cria um card por peça planejada. Cada card já nasce com o briefing da peça e a data. */
export async function criarCardsDoPlano(p: PlanoPendente): Promise<ResultadoCriacao> {
  const pecaDe = (data: string) => p.pecas.find((x) => x.data === data);
  const cardIds: string[] = [];
  const falharam: string[] = [];

  for (const d of p.decisoes) {
    const peca = pecaDe(d.data);
    const briefing = peca
      ? `${pecaParaTexto(peca)}\n\n_${d.formato} · pilar: ${d.pilar} · objetivo: ${d.objetivo} · por que agora: ${d.porQueAgora}_`
      : `${d.tema}\n\nÂngulo: ${d.angulo}\n\n_${d.formato} · pilar: ${d.pilar} · objetivo: ${d.objetivo}_`;
    const id = await criarCardDemanda({
      clientId: p.clientId, clienteNome: p.clienteNome,
      titulo: peca?.titulo || d.tema, urgencia: "media",
      briefing, tipo: "arte_nova", dueDate: d.data,
      decisao: {
        pilar: d.pilar, objetivo: d.objetivo, posicao_funil: d.posicaoFunil,
        angulo: d.angulo, dor_alvo: d.dorAlvo, por_que_agora: d.porQueAgora,
      },
    });
    if (id) cardIds.push(id); else falharam.push(d.data);
  }
  return { criados: cardIds.length, total: p.decisoes.length, falharam, cardIds };
}

/** Guarda quais cards saíram deste plano e a mensagem que conta isso (é ela que o "desfaz" cita). */
export async function registrarCardsDoPlano(jobId: string, cardIds: string[], msgIdConfirmacao: string | null | undefined, por: string | null): Promise<void> {
  await anotarNoJob(jobId, {
    cardIds, criadosEm: new Date().toISOString(), criadosPor: por,
    ...(msgIdConfirmacao ? { msgIdConfirmacao } : {}),
  });
}

/** O plano cujos cards foram abertos pela mensagem CITADA no "desfaz". */
export async function planoDosCardsCitados(groupJid: string, quotedMsgId: string | null | undefined): Promise<{ jobId: string; clienteNome: string; cardIds: string[]; desfeitoEm: string | null } | null> {
  if (!quotedMsgId || !idSeguro(quotedMsgId)) return null;
  const { data, error } = await supabaseAdmin.from("content_calendar_jobs")
    .select("id, result").eq("contexto", groupJid).eq("result->>msgIdConfirmacao", quotedMsgId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) { console.error("[plano-em-cards] planoDosCardsCitados:", error.message); return null; }
  if (!data) return null;
  const r = (data.result as Record<string, unknown>) ?? {};
  return {
    jobId: data.id as string, clienteNome: (r.clienteNome as string) || "Cliente",
    cardIds: Array.isArray(r.cardIds) ? (r.cardIds as string[]) : [], desfeitoEm: (r.desfeitoEm as string) ?? null,
  };
}

/** Desfaz: arquiva os cards que o plano abriu (soft-delete, como o "apagar" do board). */
export async function arquivarCardsDoPlano(jobId: string, cardIds: string[], por: string | null): Promise<{ ok: boolean; arquivados: number; erro?: string }> {
  if (!cardIds.length) return { ok: true, arquivados: 0 };
  const { data, error } = await supabaseAdmin.from("content_cards")
    .update({ archived_at: new Date().toISOString() }).in("id", cardIds).is("archived_at", null).select("id");
  if (error) return { ok: false, arquivados: 0, erro: error.message };
  await anotarNoJob(jobId, { desfeitoEm: new Date().toISOString(), desfeitoPor: por });
  return { ok: true, arquivados: data?.length ?? 0 };
}

/** Marca como resolvido pra o mesmo plano não virar card duas vezes. */
export async function fecharPendente(jobId: string): Promise<void> {
  try {
    await supabaseAdmin.from("content_calendar_jobs").update({ status: "done" }).eq("id", jobId);
  } catch { /* pior caso, a janela expira sozinha */ }
}

/** "cria", "pode criar", "abre os cards", "manda pro board" — e o "ok" seco (só vale citando o plano). */
export function pediuParaCriar(texto: string): boolean {
  const t = (texto || "").toLowerCase().trim();
  if (ehConfirmacaoSolta(t)) return true;

  // "O PLANEJAMENTO DO CLIENTE X ESTÁ APROVADO" — é assim que o time fala de verdade (Roberto,
  // 03/08). Antes só entendia o imperativo ("cria os cards"), então a aprovação do calendário
  // mensal/quinzenal não virava nada e alguém tinha que abrir card a card na mão.
  const aprovou = /\b(aprovad[oa]|aprovei|aprovamos|aprovou|liberad[oa]|pode seguir|pode subir|t[áa] ok|est[áa] ok)\b/.test(t);
  const sobrePlano = /\b(planejamento|calend[áa]rio|linha editorial|pauta[s]? do m[êe]s|quinzenal?|mensal)\b/.test(t);
  if (aprovou && sobrePlano) return true;

  return /\b(cria|criar|abre|abrir|manda|mandar|joga|jogar|sobe|subir)\b/.test(t)
    && /\b(card|cards|board|quadro|demanda|demandas|pro social|no social)\b/.test(t);
}
