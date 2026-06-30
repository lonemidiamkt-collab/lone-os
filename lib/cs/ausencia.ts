// lib/cs/ausencia.ts — comando de férias/ausência de membro da equipe ("Lone, o Rodrigo está
// de férias até dia 15" / "Lone, o Carlos voltou"). O agente usa pra não rotear demanda pra
// quem está fora (avisa na sugestão).

import { chatJson } from "@/lib/ai/openai";

export function ehComandoAusencia(text: string): boolean {
  const t = text.toLowerCase();
  if (!/\blone\b/.test(t)) return false;
  return /\b(f[ée]rias|ausente|aus[êe]ncia|folga|afastad|indispon[íi]vel|de licen[çc]a|voltou|de volta|dispon[íi]vel de novo|retornou)\b/.test(t);
}

const SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false, required: ["nome", "disponivel", "ate"],
  properties: {
    nome: { type: ["string", "null"] },
    disponivel: { type: "boolean" }, // true = voltou/disponível · false = de férias/ausente
    ate: { type: ["string", "null"] }, // data de retorno em ISO (YYYY-MM-DD) se mencionada
  },
};

/** Extrai {nome, disponivel, ate} da mensagem. `hojeISO` ancora datas relativas ("até dia 15"). */
export async function parseAusencia(text: string, hojeISO: string): Promise<{ nome: string | null; disponivel: boolean; ate: string | null }> {
  const res = await chatJson<{ nome: string | null; disponivel: boolean; ate: string | null }>({
    model: "gpt-4o-mini", schemaName: "cs_ausencia", schema: SCHEMA, maxTokens: 120, temperature: 0,
    system:
      `Hoje é ${hojeISO}. Extraia da mensagem da equipe quem da equipe está saindo de FÉRIAS/AUSÊNCIA ou ` +
      `VOLTANDO. disponivel=false se está saindo (férias/ausente/folga/licença); disponivel=true se voltou/` +
      `está de volta. ate = data de retorno em ISO (YYYY-MM-DD) se houver ("até dia 15" → calcule a partir de hoje; ` +
      `"semana que vem" → estime); null se não disser. nome = só o primeiro nome basta.`,
    user: text,
  });
  return res.ok && res.data ? res.data : { nome: null, disponivel: false, ate: null };
}
