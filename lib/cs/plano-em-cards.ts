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

import { supabaseAdmin } from "@/lib/supabase/server";
import { criarCardDemanda } from "@/lib/cs/card";
import { pecaParaTexto, type PecaFinal } from "@/lib/cs/motor";
import type { DecisaoDeConteudo } from "@/lib/cs/pipeline";

export interface PlanoPendente {
  clientId: string;
  clienteNome: string;
  periodo: string;
  decisoes: DecisaoDeConteudo[];
  pecas: PecaFinal[];
}

/** Janela pra "cria" valer. Passou disso, a pessoa provavelmente fala de outra coisa. */
// A janela curta servia pro "gera um plano" → "cria" na mesma conversa. Mas o calendário MENSAL
// sai dia 1º e o social aprova quando o cliente responde — pode ser horas ou dias depois. Com 60
// min a aprovação chegava e não achava plano nenhum.
const JANELA_MIN = 60;
/** Plano de período (mês/quinzena) fica de pé por uma semana: é o tempo real de o cliente responder. */
const JANELA_PLANO_MIN = 7 * 24 * 60;

/**
 * Guarda o plano recém-montado esperando o "cria" do time. Usa `content_calendar_jobs`, que já
 * existe pra isso — nada de tabela nova pra uma fila de um item.
 */
export async function guardarPendente(groupJid: string, p: PlanoPendente): Promise<void> {
  try {
    await supabaseAdmin.from("content_calendar_jobs").insert({
      client_id: p.clientId, modo: "pendente", status: "aguardando_ok",
      contexto: groupJid,
      result: { clienteNome: p.clienteNome, periodo: p.periodo, decisoes: p.decisoes, pecas: p.pecas },
    });
  } catch { /* se não guardar, o time ainda tem o PDF e o botão da plataforma */ }
}

/**
 * O último plano que este grupo montou e ainda não virou card.
 *
 * @param dePeriodo true quando a mensagem fala de PLANEJAMENTO/CALENDÁRIO (mensal ou quinzenal) —
 *   aí a janela é de uma semana, porque o social só aprova depois do cliente responder. A janela
 *   curta continua valendo pro "gera um plano" → "cria" na mesma conversa.
 */
export async function planoPendenteDe(groupJid: string, dePeriodo = false): Promise<(PlanoPendente & { jobId: string }) | null> {
  try {
    const janela = dePeriodo ? JANELA_PLANO_MIN : JANELA_MIN;
    const desde = new Date(Date.now() - janela * 60_000).toISOString();
    const { data } = await supabaseAdmin
      .from("content_calendar_jobs")
      .select("id, client_id, result, created_at")
      .eq("status", "aguardando_ok").eq("contexto", groupJid)
      .gte("created_at", desde)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!data?.result) return null;
    const r = data.result as Record<string, unknown>;
    return {
      jobId: data.id as string,
      clientId: data.client_id as string,
      clienteNome: (r.clienteNome as string) || "Cliente",
      periodo: (r.periodo as string) || "",
      decisoes: (r.decisoes as DecisaoDeConteudo[]) || [],
      pecas: (r.pecas as PecaFinal[]) || [],
    };
  } catch { return null; }
}

export interface ResultadoCriacao {
  criados: number;
  total: number;
  /** Datas que não viraram card — o time precisa saber o que ficou de fora. */
  falharam: string[];
}

/** Cria um card por peça planejada. Cada card já nasce com o briefing da peça e a data. */
export async function criarCardsDoPlano(p: PlanoPendente): Promise<ResultadoCriacao> {
  const pecaDe = (data: string) => p.pecas.find((x) => x.data === data);
  let criados = 0;
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
    if (id) criados++; else falharam.push(d.data);
  }
  return { criados, total: p.decisoes.length, falharam };
}

/** Marca como resolvido pra o mesmo plano não virar card duas vezes. */
export async function fecharPendente(jobId: string): Promise<void> {
  try {
    await supabaseAdmin.from("content_calendar_jobs").update({ status: "done" }).eq("id", jobId);
  } catch { /* pior caso, a janela de 60min expira sozinha */ }
}

/** "cria", "pode criar", "abre os cards", "manda pro board" — e o "ok" seco logo depois do plano. */
export function pediuParaCriar(texto: string): boolean {
  const t = (texto || "").toLowerCase().trim();
  if (/^(ok|isso|show|perfeito|pode ser|fechou)\b/.test(t) && t.length <= 24) return true;

  // "O PLANEJAMENTO DO CLIENTE X ESTÁ APROVADO" — é assim que o time fala de verdade (Roberto,
  // 03/08). Antes só entendia o imperativo ("cria os cards"), então a aprovação do calendário
  // mensal/quinzenal não virava nada e alguém tinha que abrir card a card na mão.
  const aprovou = /\b(aprovad[oa]|aprovei|aprovamos|aprovou|liberad[oa]|pode seguir|pode subir|t[áa] ok|est[áa] ok)\b/.test(t);
  const sobrePlano = /\b(planejamento|calend[áa]rio|linha editorial|pauta[s]? do m[êe]s|quinzenal?|mensal)\b/.test(t);
  if (aprovou && sobrePlano) return true;

  return /\b(cria|criar|abre|abrir|manda|mandar|joga|jogar|sobe|subir)\b/.test(t)
    && /\b(card|cards|board|quadro|demanda|demandas|pro social|no social)\b/.test(t);
}
