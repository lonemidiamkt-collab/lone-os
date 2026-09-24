// lib/cs/jornada.ts — a ficha de RELACIONAMENTO do CS + o risco CONSOLIDADO. SEM financeiro.
// Alimenta o preparo e a pauta de reunião (WhatsApp e /api/reunioes/gerenciar). O painel /jornada
// virou a vista "Jornada" da Saúde da carteira (/saude) — Leva 6A; o risco vem do modelo único
// (lib/saude/carteira.ts).

import { ETAPAS_FINAIS, statusNaEtapa } from "@/lib/conteudo/etapas";
import { supabaseAdmin } from "@/lib/supabase/server";
import { spNow, ymd } from "@/lib/cs/vigilancia";
import { diasQuietoDoCliente, ESTADO_GRAVADO, etapaDaJornada, nivelDoCliente, situacaoDaSaude } from "@/lib/saude/carteira";

export type NivelRisco = "saudavel" | "atencao" | "risco" | "critico";

export interface PendenciaCliente { item: string; desde?: string; impacto?: string }

export interface FichaJornada {
  clientId: string; nome: string;
  estado: string;                 // derivado (ou override manual)
  healthLevel: string | null; healthScore: number | null;
  risco: { nivel: NivelRisco; motivos: string[] };
  cardsAtrasados: number;         // entregas da Lone atrasadas
  pendenciasCliente: PendenciaCliente[];
  proximaAcao: string | null; responsavel: string | null; prazo: string | null;
  temProximaAcao: boolean;
  percebeValor: boolean;          // proxy: participação + sentimento (NÃO financeiro)
  proximaReuniao: string | null; ultimaReuniao: string | null; notas: string | null;
  attentionLevel: string | null; diasSemFalar: number | null;
}

// O veredito, a partir do modelo ÚNICO de risco (lib/saude/carteira.ts — Leva 6A). Antes esta função
// tinha régua própria (reclamação ou 14 dias calado viravam "risco" mesmo com a saúde boa; atenção
// crítica virava "crítico" sozinha) e a Jornada discordava do Termômetro sobre o mesmo cliente.
// Agora: nível = saúde do escritor único (/api/scores); calado 7+ dias = atenção (esfriando).
// Atenção crítica e reclamação recente continuam aparecendo — como PORQUÊ, e "crítico" só sobe um
// cliente que já está em risco pela saúde.
export function riscoConsolidado(c: {
  healthLevel: string | null; attentionLevel: string | null; diasSemFalar: number | null; reclamacaoRecente: boolean;
  /** breakdown.motivos da última nota, quando a rota tiver. */
  motivosSaude?: string[];
}): { nivel: NivelRisco; motivos: string[] } {
  const sit = situacaoDaSaude({
    nivel: nivelDoCliente({ current_health_level: c.healthLevel }), score: null,
    motivos: c.motivosSaude ?? [], diasQuieto: c.diasSemFalar,
  });
  const motivos: string[] = [];
  if (c.attentionLevel === "critical") motivos.push("atenção crítica (feedback grave)");
  if (sit.nivel === "risco") motivos.push("saúde em risco");
  else if (sit.nivel === "atencao") motivos.push("saúde em atenção");
  // "sem dado" não é motivo de nada para a reunião — só o calado conta.
  if (sit.nivel !== "sem_dado" || sit.esfriando) motivos.push(...sit.motivos);
  if (c.reclamacaoRecente) motivos.push("reclamação nos últimos 14 dias");
  if (c.attentionLevel === "high") motivos.push("atenção alta");

  const nivel: NivelRisco = sit.nivel === "risco"
    ? (c.attentionLevel === "critical" ? "critico" : "risco")
    : sit.pedeAtencao ? "atencao" : "saudavel";
  return { nivel, motivos: [...new Set(motivos)] };
}

export async function montarJornada(): Promise<FichaJornada[]> {
  const hoje = ymd(spNow());
  const há14 = new Date(spNow().getTime() - 14 * 86400000).toISOString();

  const [{ data: clients }, { data: journeys }, { data: cardsAtras }, { data: recl }] = await Promise.all([
    supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, status, current_health_level, current_health_score, attention_level, last_client_msg_at, agente_ativo, assigned_social")
      .is("draft_status", null).neq("active", false).order("name"),
    supabaseAdmin.from("client_journey").select("*"),
    supabaseAdmin.from("content_cards")
      .select("client_id, status, due_date").is("archived_at", null).not("due_date", "is", null).lt("due_date", hoje),
    supabaseAdmin.from("cs_demandas").select("client_id, tipo, created_at").eq("tipo", "reclamacao").gte("created_at", há14),
  ]);

  const jMap = new Map((journeys ?? []).map((j) => [j.client_id as string, j]));
  const atrasoMap = new Map<string, number>();
  for (const c of cardsAtras ?? []) {
    const st = c.status as string;
    if (statusNaEtapa(st, ...ETAPAS_FINAIS)) continue;
    const k = c.client_id as string;
    atrasoMap.set(k, (atrasoMap.get(k) ?? 0) + 1);
  }
  const reclSet = new Set((recl ?? []).map((r) => r.client_id as string));

  return (clients ?? []).map((c) => {
    const nome = (c.nome_fantasia as string) || (c.name as string);
    const j = jMap.get(c.id as string);
    // Mesma régua de "calado" da Saúde da carteira: agente desligado no grupo = não dá para afirmar.
    const dias = diasQuietoDoCliente({ last_client_msg_at: c.last_client_msg_at as string | null, agente_ativo: c.agente_ativo as boolean | null }, spNow().getTime());
    const risco = riscoConsolidado({
      healthLevel: c.current_health_level as string, attentionLevel: c.attention_level as string,
      diasSemFalar: dias, reclamacaoRecente: reclSet.has(c.id as string),
    });
    // Estado: override manual OU derivado (a mesma etapa da vista Jornada da Saúde da carteira)
    const estadoDerivado = ESTADO_GRAVADO[etapaDaJornada({ status: c.status as string | null }, {
      nivel: risco.nivel === "critico" || risco.nivel === "risco" ? "risco" : "saudavel",
      pedeAtencao: risco.nivel !== "saudavel",
    })];
    // Percebe valor (proxy participação+sentimento): NÃO percebe se sumiu ≥7d OU atenção alta/crítica OU risco alto
    const percebeValor = !((dias != null && dias >= 7) || c.attention_level === "high" || c.attention_level === "critical" || risco.nivel === "risco" || risco.nivel === "critico");

    return {
      clientId: c.id as string, nome,
      estado: (j?.estado as string) || estadoDerivado,
      healthLevel: (c.current_health_level as string) ?? null, healthScore: (c.current_health_score as number) ?? null,
      risco,
      cardsAtrasados: atrasoMap.get(c.id as string) ?? 0,
      pendenciasCliente: (j?.pendencias_cliente as PendenciaCliente[]) ?? [],
      proximaAcao: (j?.proxima_acao as string) ?? null,
      responsavel: (j?.proxima_acao_responsavel as string) || (c.assigned_social as string) || null,
      prazo: (j?.proxima_acao_prazo as string) ?? null,
      temProximaAcao: !!(j?.proxima_acao),
      percebeValor,
      proximaReuniao: (j?.proxima_reuniao as string) ?? null, ultimaReuniao: (j?.ultima_reuniao as string) ?? null,
      notas: (j?.notas as string) ?? null,
      attentionLevel: (c.attention_level as string) ?? null, diasSemFalar: dias,
    };
  });
}
