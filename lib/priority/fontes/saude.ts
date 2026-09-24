// Saúde do cliente: client_health_scores já traz o breakdown com MOTIVOS em frase — é a evidência.
// Escala do escritor único (/api/scores): 100 = saudável; níveis saudavel | atencao | risco | sem_dado.
// Só risco e atenção viram recomendação; sem_dado não é evidência de nada.

import { supabaseAdmin } from "@/lib/supabase/server";
import type { ItemBruto } from "../tipos";
import { ACAO_SAUDE } from "@/lib/clientes/proxima-acao";
import type { ClienteRef } from "./index";

interface Breakdown { motivos?: string[]; cobertura?: number; sinais_loninho?: { dias_sem_contato?: number; reclamacoes_30d?: number; sem_resposta_no_dia?: number } }

export async function itensDaSaude(clientes: { porId: Map<string, ClienteRef> }): Promise<ItemBruto[]> {
  const { data: ultimo, error: e0 } = await supabaseAdmin.from("client_health_scores").select("computed_for_date").order("computed_for_date", { ascending: false }).limit(1).maybeSingle();
  if (e0) throw new Error(`client_health_scores: ${e0.message}`);
  if (!ultimo) return [];
  const { data, error } = await supabaseAdmin.from("client_health_scores")
    .select("client_id, score, level, breakdown").eq("computed_for_date", ultimo.computed_for_date as string)
    .in("level", ["risco", "atencao"]);
  if (error) throw new Error(`client_health_scores: ${error.message}`);

  const out: ItemBruto[] = [];
  for (const h of data ?? []) {
    const c = clientes.porId.get(h.client_id as string);
    if (!c) continue;
    const b = (h.breakdown ?? {}) as Breakdown;
    const motivos = (b.motivos ?? []).filter(Boolean).slice(0, 4);
    if (!motivos.length) continue; // score sem motivo não é evidência
    const critico = h.level === "risco";
    const cobertura = b.cobertura ?? 100;
    out.push({
      fonte: "saude", clientId: c.id, cliente: c.nome,
      entityRef: null, motivo: `saude_${h.level}`,
      titulo: `${c.nome}: saúde ${critico ? "em risco" : "em atenção"} (${h.score}/100)`,
      fato: motivos,
      inferencia: [`Saúde ${h.score}/100 (100 = saudável) com ${cobertura}% dos sinais medidos`],
      // O mesmo texto que a próxima ação sugerida usa quando não há recomendação (lib/clientes/proxima-acao.ts).
      recomendacao: critico ? ACAO_SAUDE.risco : ACAO_SAUDE.atencao,
      acaoProposta: { tipo: "ver_cliente", clientId: c.id },
      severidade: critico ? 90 : 70,
      urgencia: critico ? 85 : 55,
      confianca: Math.max(0.5, Math.min(0.95, cobertura / 100)),
      exposicaoRs: null,
      reversivel: !critico,
      ownerRole: critico ? "manager" : "social",
      owner: critico ? null : c.assignedSocial,
      nivelPolicy: "D",
    });
  }
  return out;
}
