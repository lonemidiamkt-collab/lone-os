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

export async function criarCardDemanda(opts: {
  clientId: string; clienteNome: string; responsavel?: string | null;
  titulo: string; urgencia: string; briefing: string;
}): Promise<string | null> {
  const pilot = csIsPilot();
  const { data: cli } = await supabaseAdmin.from("clients").select("assigned_social").eq("id", opts.clientId).maybeSingle();
  const dono = ((cli?.assigned_social as string) || opts.responsavel || "").trim() || null;
  const { data: card, error } = await supabaseAdmin
    .from("content_cards")
    .insert({
      title: (pilot ? "[TESTE] " : "") + opts.titulo,
      client_id: opts.clientId,
      client_name: opts.clienteNome,
      social_media: dono,
      status: "ideas",
      priority: PRIO[opts.urgencia] ?? "medium",
      briefing: opts.briefing,
      requested_by_traffic: pilot ? "🤖 Agente CS (teste)" : "🤖 Agente CS",
      status_changed_at: new Date().toISOString(),
      column_entered_at: { ideas: new Date().toISOString() },
    })
    .select("id")
    .maybeSingle();
  if (error) { console.error("[CS] criar card:", error.message); return null; }
  return (card?.id as string) ?? null;
}
