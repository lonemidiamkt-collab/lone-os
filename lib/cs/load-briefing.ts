// lib/cs/load-briefing.ts — carrega o briefing atual de um cliente e mapeia pro formato do
// Agente Criativo (BriefingCliente). Compartilhado entre o inbound (on-demand) e as rotas.

import { supabaseAdmin } from "@/lib/supabase/server";
import type { BriefingCliente } from "@/lib/cs/criativo";

export const BRIEFING_COLS =
  "resumo_estrategico, produtos, publico_alvo, posicionamento, dores, ganchos, ctas, tom_voz, produtos_destaque_atual, palavras_proibidas, concorrentes_evitar_mencionar";

export async function loadBriefingForClient(opts: {
  clientId: string; nome: string; nicho?: string;
}): Promise<{ briefing: BriefingCliente; temBriefing: boolean }> {
  const { data: b } = await supabaseAdmin
    .from("client_briefings").select(BRIEFING_COLS)
    .eq("client_id", opts.clientId).eq("is_current", true).maybeSingle();
  return {
    temBriefing: !!b,
    briefing: {
      nome: opts.nome,
      nicho: opts.nicho,
      resumoEstrategico: (b?.resumo_estrategico as string) || undefined,
      produtos: (b?.produtos as string[]) || undefined,
      publicoAlvo: (b?.publico_alvo as string[]) || undefined,
      posicionamento: (b?.posicionamento as string) || undefined,
      dores: (b?.dores as string[]) || undefined,
      ganchos: (b?.ganchos as string[]) || undefined,
      ctas: (b?.ctas as string[]) || undefined,
      tomVoz: (b?.tom_voz as string) || undefined,
      produtosDestaque: (b?.produtos_destaque_atual as string[]) || undefined,
      palavrasProibidas: (b?.palavras_proibidas as string[]) || undefined,
      concorrentesEvitar: (b?.concorrentes_evitar_mencionar as string[]) || undefined,
    },
  };
}
