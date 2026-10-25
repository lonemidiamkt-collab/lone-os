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
export async function parseAusencia(text: string, hojeISO: string): Promise<{ nome: string | null; disponivel: boolean; ate: string | null; falhou?: boolean }> {
  const res = await chatJson<{ nome: string | null; disponivel: boolean; ate: string | null }>({
    model: "gpt-4o-mini", schemaName: "cs_ausencia", schema: SCHEMA, maxTokens: 120, temperature: 0,
    system:
      `Hoje é ${hojeISO}. Extraia da mensagem da equipe quem da equipe está saindo de FÉRIAS/AUSÊNCIA ou ` +
      `VOLTANDO. disponivel=false se está saindo (férias/ausente/folga/licença); disponivel=true se voltou/` +
      `está de volta. ate = data de retorno em ISO (YYYY-MM-DD) se houver ("até dia 15" → calcule a partir de hoje; ` +
      `"semana que vem" → estime); null se não disser. nome = só o primeiro nome basta.`,
    user: text,
  });
  // 25/10/2026: IA que não respondeu não vira "faltou o nome" — o inbound diz que não conseguiu ler.
  return res.ok && res.data ? res.data : { nome: null, disponivel: false, ate: null, falhou: true };
}

// ─── Quem é a pessoa citada (25/10/2026, onda 5) ───────────────────────────
// Antes: `ilike %nome%` com limit(1) — "a Ana está de férias" podia marcar a Juliana, e o "✅ Anotado" saía
// do mesmo jeito. Agora: o nome inteiro que bate vence; depois o primeiro nome; depois quem contém o nome.
// Com mais de um candidato no mesmo nível, o agente pergunta em vez de escolher.
export interface MembroEquipe { id: string; name: string }

const normNome = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function escolherMembroAusente(nome: string, membros: MembroEquipe[]):
  { tipo: "um"; membro: MembroEquipe } | { tipo: "varios"; nomes: string[] } | { tipo: "nenhum" } {
  const alvo = normNome(nome);
  if (!alvo) return { tipo: "nenhum" };
  const exatos = membros.filter((m) => normNome(m.name) === alvo);
  const primeiroNome = membros.filter((m) => normNome(m.name).split(/\s+/)[0] === alvo.split(/\s+/)[0]);
  const contem = membros.filter((m) => normNome(m.name).includes(alvo));
  for (const lista of [exatos, primeiroNome, contem]) {
    if (lista.length === 1) return { tipo: "um", membro: lista[0] };
    if (lista.length > 1) return { tipo: "varios", nomes: lista.map((m) => m.name) };
  }
  return { tipo: "nenhum" };
}
