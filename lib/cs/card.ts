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
}): Promise<string | null> {
  const pilot = csIsPilot();
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
      due_date: dueDatePorUrgencia(opts.tipo, opts.urgencia),
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
