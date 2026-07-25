// lib/cs/card.ts — criação de ContentCard a partir de uma demanda confirmada do Agente CS.
// Compartilhado entre o webhook inbound (confirmação "ok" no WhatsApp) e o painel Agente Lone
// (botão "Criar card"). A regra do dono (social_media) espelha a lógica original do inbound:
// o card é CONTEÚDO do cliente → dono = assigned_social (aparece no board do social da carteira);
// o "responsável" da demanda (designer p/ arte) serve só pro @ na sugestão — o designer enxerga
// o card pelo board dele (filtra por assigned_designer), independente do social_media.

import { supabaseAdmin } from "@/lib/supabase/server";

const PRIO: Record<string, string> = { alta: "high", media: "medium", baixa: "low" };

/** Modo piloto: há allowlist de grupos (CS_PILOT_GROUP_JIDS) → cards saem marcados [TESTE]. */
export function csIsPilot(): boolean {
  return (process.env.CS_PILOT_GROUP_JIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean).length > 0;
}

/** YYYY-MM-DD (fuso SP) de +N dias úteis a partir de hoje (sem feriados — heurística barata). */
function emDiasUteis(n: number): string {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  let uteis = 0;
  while (uteis < n) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd >= 1 && wd <= 5) uteis++;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Card SEM due_date é invisível pra vigilância de fluxo (a query filtra due_date não-nulo) — a
// demanda confirmada apodreceria sem cobrança. Prazo pela urgência, alinhado ao SLA da taxonomy.
// SÓ para tipos de produção (arte/ajuste): due_date em card de dúvida/reclamação geraria cobrança
// falsa de "faltou marcar A fazer" e sujaria o relatório de pauta.
const TIPOS_COM_PRAZO = new Set(["arte_nova", "ajuste_arte"]);
function dueDatePorUrgencia(tipo: string | undefined, urgencia: string): string | null {
  if (!tipo || !TIPOS_COM_PRAZO.has(tipo)) return null;
  if (urgencia === "alta") return emDiasUteis(1);
  if (urgencia === "media") return emDiasUteis(2);
  return emDiasUteis(3);
}

export async function criarCardDemanda(opts: {
  clientId: string; clienteNome: string; responsavel?: string | null;
  titulo: string; urgencia: string; briefing: string; tipo?: string;
  /** Data de postagem explícita (YYYY-MM-DD) — ex.: item de pauta. Sobrepõe a heurística. */
  dueDate?: string | null;
  /** Se é ajuste_arte de uma arte JÁ existente: roteia a correção pro card em vez de criar novo. */
  ajusteCardId?: string | null;
  /** Decisão estratégica (Fase 3): grava pilar/objetivo/ângulo/por que agora no card (loop de aprendizado). */
  decisao?: { pilar?: string; objetivo?: string; posicao_funil?: string; angulo?: string; dor_alvo?: string; por_que_agora?: string } | null;
}): Promise<string | null> {
  // Edição de arte existente: não abre card novo — aplica o ajuste no card que o cliente está corrigindo.
  if (opts.tipo === "ajuste_arte" && opts.ajusteCardId) {
    const ok = await aplicarAjusteNoCard({ cardId: opts.ajusteCardId, correcao: opts.briefing, clientId: opts.clientId, clienteNome: opts.clienteNome });
    return ok ? opts.ajusteCardId : null;
  }
  const pilot = csIsPilot();

  // GUARDA DE DUPLICATA — protege os 4 caminhos de criação (inbound, decide, calendário, pauta) de
  // uma vez. Sintoma real em produção: "SEG 27" da Madereira criado 4× no mesmo dia (16:28/17:27/
  // 17:53/17:54), Tindaro 2×. Se já existe card não-arquivado do mesmo cliente, com o mesmo título e
  // a mesma data de postagem, criado nas últimas 48h, devolve o existente em vez de duplicar.
  const tituloNorm = opts.titulo.trim().toLowerCase();
  const dueAlvo = opts.dueDate !== undefined ? opts.dueDate : dueDatePorUrgencia(opts.tipo, opts.urgencia);
  const { data: recentes } = await supabaseAdmin
    .from("content_cards")
    .select("id, title, due_date")
    .eq("client_id", opts.clientId)
    .is("archived_at", null)
    .gte("created_at", new Date(Date.now() - 48 * 3600_000).toISOString());
  const gemeo = (recentes ?? []).find(
    (c) => ((c.title as string) || "").trim().toLowerCase().replace(/^\[teste\]\s*/, "") === tituloNorm
      && (c.due_date ?? null) === (dueAlvo ?? null),
  );
  if (gemeo) {
    console.warn(`[CS] card duplicado evitado: "${opts.titulo}" (${opts.clienteNome}) → reusa ${gemeo.id}`);
    return gemeo.id as string;
  }

  const { data: cli } = await supabaseAdmin.from("clients").select("assigned_social").eq("id", opts.clientId).maybeSingle();
  const dono = ((cli?.assigned_social as string) || opts.responsavel || "").trim() || null;
  const { data: card, error } = await supabaseAdmin
    .from("content_cards")
    .insert({
      title: (pilot ? "[TESTE] " : "") + opts.titulo.slice(0, 80),
      client_id: opts.clientId,
      client_name: opts.clienteNome,
      social_media: dono,
      status: "ideas",
      priority: PRIO[opts.urgencia] ?? "medium",
      due_date: dueAlvo,
      briefing: opts.briefing,
      requested_by_traffic: pilot ? "🤖 Agente CS (teste)" : "🤖 Agente CS",
      status_changed_at: new Date().toISOString(),
      column_entered_at: { ideas: new Date().toISOString() },
      ...(opts.decisao ? {
        pilar: opts.decisao.pilar ?? null, objetivo: opts.decisao.objetivo ?? null,
        posicao_funil: opts.decisao.posicao_funil ?? null, angulo: opts.decisao.angulo ?? null,
        dor_alvo: opts.decisao.dor_alvo ?? null, por_que_agora: opts.decisao.por_que_agora ?? null,
      } : {}),
    })
    .select("id")
    .maybeSingle();
  if (error) { console.error("[CS] criar card:", error.message); return null; }
  // Deixa o RESPONSÁVEL do cliente ciente: notificação por client_id (quem atende o cliente vê no
  // painel/sino). Ex.: card da WT → Carlos; card da Farmácia → Pedro. Falha aqui não quebra o card.
  if (card?.id) {
    await supabaseAdmin.from("notifications").insert({
      type: "content",
      title: "🤖 Nova demanda do Agente CS",
      body: `"${opts.titulo.slice(0, 60)}" (${opts.clienteNome}) já está no seu board.`,
      client_id: opts.clientId,
      card_id: card.id,
    });
  }
  return (card?.id as string) ?? null;
}

/** Roteia um AJUSTE pra uma arte JÁ EXISTENTE (em vez de criar card novo): anexa a correção ao
 *  briefing, comenta no card, volta pra produção (limpa designer_delivered_at → o designer refaz e a
 *  vigilância cobra) e notifica. Retorna false se o card sumiu. */
export async function aplicarAjusteNoCard(opts: {
  cardId: string; correcao: string; clientId: string; clienteNome: string;
}): Promise<boolean> {
  const { data: card } = await supabaseAdmin
    .from("content_cards").select("briefing, title").eq("id", opts.cardId).is("archived_at", null).maybeSingle();
  if (!card) return false;
  const nowIso = new Date().toISOString();
  const briefingNovo = `${(card.briefing as string) || ""}\n\n---\n✏️ AJUSTE DO CLIENTE (via Agente CS): ${opts.correcao}`.slice(0, 6000);
  const { error } = await supabaseAdmin.from("content_cards").update({
    briefing: briefingNovo,
    status: "in_production",       // volta pra produção pro designer refazer
    designer_delivered_at: null,   // "não entregue" de novo → a vigilância cobra o designer
    status_changed_at: nowIso,
    column_entered_at: { in_production: nowIso },
  }).eq("id", opts.cardId);
  if (error) { console.error("[CS] aplicar ajuste no card:", error.message); return false; }
  // Reabre a demanda do designer. Sem isto o board do DESIGNER continuava mostrando "Concluído"
  // enquanto o card voltava pra produção — ele não via que tinha trabalho pra refazer. (O caminho de
  // reprovação pelo social já fazia isso; o do cliente, não.)
  await supabaseAdmin.from("design_requests")
    .update({ status: "in_progress" })
    .eq("content_card_id", opts.cardId).neq("status", "in_progress")
    .then(() => {}, () => {});
  await supabaseAdmin.from("card_comments").insert({
    card_id: opts.cardId, author: "🤖 Agente CS", role: "system", text: `✏️ Ajuste do cliente: ${opts.correcao.slice(0, 400)}`,
  }).then(() => {}, () => {});
  await supabaseAdmin.from("notifications").insert({
    type: "content", title: "✏️ Ajuste na arte (Agente CS)",
    body: `"${(card.title as string) || "arte"}" (${opts.clienteNome}) — o cliente pediu ajuste. Voltou pra produção.`,
    client_id: opts.clientId, card_id: opts.cardId,
  }).then(() => {}, () => {});
  return true;
}

/** Cria os cards de uma PAUTA confirmada (1 por item, com a data do item). Retorna os ids criados. */
export async function criarCardsPauta(opts: {
  clientId: string; clienteNome: string; responsavel?: string | null;
  itens: Array<{ dia: string; titulo: string; descricao: string; formato: string }>;
  /** Nota humana (ex.: ajuste da equipe) anexada ao briefing de cada card. */
  notaExtra?: string | null;
}): Promise<string[]> {
  const ids: string[] = [];
  for (const item of opts.itens) {
    const briefing = `${item.descricao}\n\n_Formato: ${item.formato}_${opts.notaExtra ? `\n\n---\n✏️ ${opts.notaExtra}` : ""}`;
    const id = await criarCardDemanda({
      clientId: opts.clientId, clienteNome: opts.clienteNome, responsavel: opts.responsavel,
      titulo: item.titulo, urgencia: "media", briefing, tipo: "arte_nova", dueDate: item.dia,
    });
    if (id) ids.push(id);
  }
  return ids;
}
