// lib/cs/load-briefing.ts — carrega o briefing atual de um cliente e mapeia pro formato do
// Agente Criativo (BriefingCliente). Compartilhado entre o inbound (on-demand) e as rotas.

import { supabaseAdmin } from "@/lib/supabase/server";
import type { BriefingCliente } from "@/lib/cs/criativo";

export const BRIEFING_COLS =
  "resumo_estrategico, produtos, publico_alvo, posicionamento, dores, ganchos, ctas, tom_voz, produtos_destaque_atual, palavras_proibidas, concorrentes_evitar_mencionar";

// Preferências de estilo de roteiro aprendidas do cliente (loop de feedback): regras 'roteiro' +
// as 'sempre' (do's & don'ts gerais valem p/ o roteiro também).
export async function loadRoteiroPrefs(clientId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("cs_client_rules").select("texto")
    .eq("client_id", clientId).eq("ativo", true).in("escopo", ["roteiro", "sempre"])
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`); // ignora regras expiradas (KB: validade)
  return (data ?? []).map((r) => r.texto as string).filter(Boolean);
}

/** Briefing estruturado como TEXTO compacto pros prompts (A1/A3/pauta). Na base real os campos
 *  de texto livre clients.fixed/campaign_briefing estão VAZIOS — o briefing vivo mora em
 *  client_briefings (onboarding/ficha). Sem este loader, A3 e pauta rodavam sem contexto. */
export async function loadBriefingTexto(clientId: string): Promise<string | undefined> {
  const { data: b } = await supabaseAdmin
    .from("client_briefings").select(BRIEFING_COLS)
    .eq("client_id", clientId).eq("is_current", true).maybeSingle();
  if (!b) return undefined;
  const j = (a: unknown) => (Array.isArray(a) && a.length ? (a as string[]).join(", ") : null);
  const linhas = [
    b.resumo_estrategico && `Resumo: ${b.resumo_estrategico}`,
    b.posicionamento && `Posicionamento: ${b.posicionamento}`,
    j(b.produtos) && `Produtos: ${j(b.produtos)}`,
    j(b.produtos_destaque_atual) && `Destaques do momento: ${j(b.produtos_destaque_atual)}`,
    j(b.publico_alvo) && `Público: ${j(b.publico_alvo)}`,
    j(b.dores) && `Dores do público: ${j(b.dores)}`,
    b.tom_voz && `Tom de voz: ${b.tom_voz}`,
    j(b.ganchos) && `Ganchos que funcionam: ${j(b.ganchos)}`,
    j(b.ctas) && `CTAs: ${j(b.ctas)}`,
    j(b.palavras_proibidas) && `NUNCA usar: ${j(b.palavras_proibidas)}`,
    j(b.concorrentes_evitar_mencionar) && `Concorrentes a NÃO mencionar: ${j(b.concorrentes_evitar_mencionar)}`,
  ].filter(Boolean) as string[];
  return linhas.length ? linhas.join("\n").slice(0, 2000) : undefined;
}

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
