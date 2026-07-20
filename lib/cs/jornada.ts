// lib/cs/jornada.ts — a ficha de RELACIONAMENTO do CS + o risco CONSOLIDADO (junta os 5 detectores
// que hoje rodam soltos num veredito só). SEM financeiro. Alimenta o painel /jornada (8 perguntas).

import { supabaseAdmin } from "@/lib/supabase/server";
import { spNow, ymd } from "@/lib/cs/vigilancia";

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

function diasDesde(iso?: string | null): number | null {
  if (!iso) return null;
  const d = Math.floor((spNow().getTime() - new Date(iso).getTime()) / 86400000);
  return d >= 0 ? d : 0;
}

// O veredito único, a partir dos sinais que já existem no cliente + reclamação recente.
export function riscoConsolidado(c: {
  healthLevel: string | null; attentionLevel: string | null; diasSemFalar: number | null; reclamacaoRecente: boolean;
}): { nivel: NivelRisco; motivos: string[] } {
  const motivos: string[] = [];
  const h = c.healthLevel, a = c.attentionLevel, dias = c.diasSemFalar;

  if (h === "critical") motivos.push("health crítico");
  if (a === "critical") motivos.push("atenção crítica (feedback grave)");
  if (h === "high") motivos.push("health alto (risco)");
  if (c.reclamacaoRecente) motivos.push("reclamação nos últimos 14 dias");
  if (dias != null && dias >= 14) motivos.push(`sumido há ${dias} dias`);
  else if (dias != null && dias >= 7) motivos.push(`sem falar há ${dias} dias`);
  if (h === "attention") motivos.push("health em atenção");
  if (a === "high") motivos.push("atenção alta");

  let nivel: NivelRisco = "saudavel";
  if (h === "critical" || a === "critical") nivel = "critico";
  else if (h === "high" || c.reclamacaoRecente || (dias != null && dias >= 14)) nivel = "risco";
  else if (h === "attention" || a === "high" || (dias != null && dias >= 7)) nivel = "atencao";
  return { nivel, motivos };
}

export async function montarJornada(): Promise<FichaJornada[]> {
  const hoje = ymd(spNow());
  const há14 = new Date(spNow().getTime() - 14 * 86400000).toISOString();

  const [{ data: clients }, { data: journeys }, { data: cardsAtras }, { data: recl }] = await Promise.all([
    supabaseAdmin.from("clients")
      .select("id, name, nome_fantasia, status, current_health_level, current_health_score, attention_level, last_client_msg_at, assigned_social")
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
    if (st === "published" || st === "scheduled") continue;
    const k = c.client_id as string;
    atrasoMap.set(k, (atrasoMap.get(k) ?? 0) + 1);
  }
  const reclSet = new Set((recl ?? []).map((r) => r.client_id as string));

  return (clients ?? []).map((c) => {
    const nome = (c.nome_fantasia as string) || (c.name as string);
    const j = jMap.get(c.id as string);
    const dias = diasDesde(c.last_client_msg_at as string);
    const risco = riscoConsolidado({
      healthLevel: c.current_health_level as string, attentionLevel: c.attention_level as string,
      diasSemFalar: dias, reclamacaoRecente: reclSet.has(c.id as string),
    });
    // Estado: override manual OU derivado
    const estadoDerivado = (c.status === "onboarding") ? "onboarding"
      : risco.nivel === "critico" || risco.nivel === "risco" ? "risco"
      : risco.nivel === "atencao" ? "atenção" : "ativo";
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
