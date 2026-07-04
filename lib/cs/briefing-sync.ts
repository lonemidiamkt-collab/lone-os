// lib/cs/briefing-sync.ts — auto-enriquecimento do briefing: mantém uma seção "🧠 Aprendido pelo
// agente" no clients.fixed_briefing, regenerada a partir das REGRAS aprendidas ativas do cliente.
// Preserva a parte MANUAL do briefing (tudo antes do marcador). Assim o briefing VISÍVEL cresce
// conforme o agente aprende nas conversas — sem duplicar (rebuild a partir das regras).

import { supabaseAdmin } from "@/lib/supabase/server";

const MARCADOR = "🧠 *APRENDIDO PELO AGENTE*";

export async function sincronizarBriefingAprendido(clientId: string): Promise<void> {
  const [{ data: cli }, { data: regras }] = await Promise.all([
    supabaseAdmin.from("clients").select("fixed_briefing").eq("id", clientId).maybeSingle(),
    supabaseAdmin.from("cs_client_rules").select("texto")
      .eq("client_id", clientId).eq("origem", "aprendido").eq("ativo", true).neq("escopo", "roteiro")
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("created_at", { ascending: true }),
  ]);
  const atual = (cli?.fixed_briefing as string) || "";
  const manual = atual.split(MARCADOR)[0].trimEnd(); // tudo antes do marcador = parte manual
  const fatos = (regras ?? []).map((r) => (r.texto as string)?.trim()).filter(Boolean);

  const novo = fatos.length === 0
    ? (manual || null)
    : `${manual ? `${manual}\n\n` : ""}${MARCADOR}\n${fatos.map((f) => `• ${f}`).join("\n")}`;

  if (novo !== atual) {
    const { error } = await supabaseAdmin.from("clients").update({ fixed_briefing: novo }).eq("id", clientId);
    if (error) console.error("[CS] sincronizarBriefingAprendido:", error.message);
  }
}
