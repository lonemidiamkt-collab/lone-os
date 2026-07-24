// lib/cs/reuniao.ts — Fase 4 da Jornada CS: preparo e RESUMO de reunião com o cliente.
// ANTES: reunião era ponto cego — o time entrava sem contexto e o que se decidia se perdia (a ficha
// tinha os campos ultima_reuniao/proxima_reuniao mas nada os preenchia). AGORA:
//  • PREPARO ("Lone, prepara a reunião do X"): monta um briefing do estado do cliente (risco
//    consolidado, entregas atrasadas, pendências, dias sem falar, percebe valor) + pontos pra puxar.
//  • RESUMO ("Lone, resumo da reunião do X: <notas>"): a IA extrai decisões, próximas ações e
//    pendências das notas e ISSO ALIMENTA A FICHA (client_journey) — fecha o loop.
// montarPrepReuniao e formatResumoReuniao são PUROS (testáveis). SEM financeiro (não fala preço/pagamento).

import { chatJson, isOpenAIConfigured, type OpenAiResult } from "@/lib/ai/openai";

export interface FichaPrep {
  nome: string;
  estado: string;
  risco: { nivel: string; motivos: string[] };
  healthLevel: string | null;
  healthScore: number | null;
  cardsAtrasados: number;
  pendenciasCliente: { item: string; impacto?: string }[];
  proximaAcao: string | null;
  diasSemFalar: number | null;
  percebeValor: boolean;
  ultimaReuniao: string | null;
}

const NIVEL_EMOJI: Record<string, string> = { saudavel: "🟢", atencao: "🟡", risco: "🟠", critico: "🔴" };
const dataBR = (iso?: string | null): string => {
  if (!iso) return "";
  try { return new Date(iso.length <= 10 ? iso + "T12:00:00Z" : iso).toLocaleDateString("pt-BR"); } catch { return ""; }
};

/** Briefing de preparo (determinístico) a partir da ficha da jornada + pontos sugeridos pela IA. */
export function montarPrepReuniao(f: FichaPrep, pontos: string[] = []): string {
  const l: string[] = [`📅 *Preparo da reunião — ${f.nome}*`];
  l.push(`${NIVEL_EMOJI[f.risco.nivel] || "⚪"} Estado: *${f.estado}*${f.risco.motivos.length ? ` — ${f.risco.motivos.join("; ")}` : ""}`);
  if (f.healthLevel || f.healthScore != null) l.push(`❤️ Saúde: ${f.healthLevel ?? "—"}${f.healthScore != null ? ` (${f.healthScore})` : ""}`);
  if (f.diasSemFalar != null) l.push(`💬 ${f.diasSemFalar === 0 ? "Falou hoje" : `Sem falar há ${f.diasSemFalar} dia${f.diasSemFalar === 1 ? "" : "s"}`}`);
  if (!f.percebeValor) l.push(`⚠️ Sinais de que *não percebe valor* (participação/sentimento)`);
  if (f.cardsAtrasados) l.push(`⏰ ${f.cardsAtrasados} entrega${f.cardsAtrasados === 1 ? "" : "s"} nossa${f.cardsAtrasados === 1 ? "" : "s"} atrasada${f.cardsAtrasados === 1 ? "" : "s"}`);
  if (f.pendenciasCliente.length) {
    l.push(`\n📌 *Pendências do cliente:*`);
    f.pendenciasCliente.forEach((p) => l.push(`• ${p.item}${p.impacto ? ` — _${p.impacto}_` : ""}`));
  }
  if (f.proximaAcao) l.push(`\n👉 Próxima ação registrada: ${f.proximaAcao}`);
  const ult = dataBR(f.ultimaReuniao);
  if (ult) l.push(`🗓️ Última reunião: ${ult}`);
  if (pontos.length) {
    l.push(`\n🎯 *Pra puxar na reunião:*`);
    pontos.forEach((p) => l.push(`• ${p}`));
  }
  l.push(`\n_Depois: "Lone, resumo da reunião do ${f.nome}: ..." que eu registro decisões e pendências na ficha._`);
  return l.join("\n");
}

/** IA: 3-4 pontos objetivos pra puxar na reunião (relacionamento/valor/destravar), sem financeiro. */
export async function pontosPraReuniao(nome: string, nicho: string | undefined, contexto: string): Promise<string[]> {
  if (!isOpenAIConfigured()) return [];
  const r = await chatJson<{ pontos: string[] }>({
    model: "gpt-4o-mini",
    system:
      "Você é o CS de uma agência de marketing. Dado o ESTADO do cliente, sugira 3 a 4 PONTOS objetivos pra " +
      "puxar numa reunião de acompanhamento — foco em relacionamento, reforçar percepção de valor e destravar " +
      "pendências. Cada ponto: uma frase curta e acionável. NUNCA fale de preço, pagamento, desconto ou contrato.",
    user: `Cliente: ${nome}${nicho ? ` (${nicho})` : ""}\nEstado atual:\n${contexto}`,
    schema: { type: "object", additionalProperties: false, required: ["pontos"], properties: { pontos: { type: "array", items: { type: "string" } } } },
    schemaName: "pontos_reuniao",
    maxTokens: 500,
  });
  return r.ok && r.data ? r.data.pontos.slice(0, 4) : [];
}

export interface ResumoReuniao {
  resumo: string;
  decisoes: string[];
  proximas_acoes: { acao: string; responsavel: string | null; prazo: string | null }[];
  pendencias_cliente: { item: string; impacto: string | null }[];
  proxima_reuniao: string | null; // YYYY-MM-DD só se explicitada
}

/** IA: extrai o essencial das NOTAS da reunião (não inventa). Alimenta a ficha da jornada. */
export async function resumirReuniao(nome: string, nicho: string | undefined, notas: string): Promise<OpenAiResult<ResumoReuniao>> {
  return chatJson<ResumoReuniao>({
    model: "gpt-4o",
    system:
      "Você é o CS de uma agência de marketing. Recebe as NOTAS de uma reunião com o cliente e extrai o " +
      "essencial. NÃO invente — use SÓ o que está nas notas. Distinção importante: `proximas_acoes` = o que a " +
      "AGÊNCIA/o time vai fazer (com responsável e prazo se ditos, senão null). `pendencias_cliente` = o que o " +
      "CLIENTE ficou de fazer/enviar (com o impacto de não fazer, se der pra inferir; senão null). " +
      "`proxima_reuniao` = data YYYY-MM-DD só se explicitada nas notas, senão null. `resumo` = 1-2 frases do que " +
      "rolou. NÃO trate de preço/pagamento/desconto/contrato.",
    user: `Cliente: ${nome}${nicho ? ` (${nicho})` : ""}\n\nNOTAS DA REUNIÃO:\n${notas}`,
    schema: {
      type: "object", additionalProperties: false,
      required: ["resumo", "decisoes", "proximas_acoes", "pendencias_cliente", "proxima_reuniao"],
      properties: {
        resumo: { type: "string" },
        decisoes: { type: "array", items: { type: "string" } },
        proximas_acoes: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["acao", "responsavel", "prazo"],
            properties: { acao: { type: "string" }, responsavel: { type: ["string", "null"] }, prazo: { type: ["string", "null"] } },
          },
        },
        pendencias_cliente: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["item", "impacto"],
            properties: { item: { type: "string" }, impacto: { type: ["string", "null"] } },
          },
        },
        proxima_reuniao: { type: ["string", "null"] },
      },
    },
    schemaName: "resumo_reuniao",
    maxTokens: 1200,
  });
}

/** Formata o resumo pra postar no grupo interno (confirma o que foi registrado na ficha). */
export function formatResumoReuniao(nome: string, r: ResumoReuniao): string {
  const l: string[] = [`📝 *Resumo da reunião — ${nome}*`, r.resumo.trim()];
  if (r.decisoes.length) {
    l.push(`\n✅ *Decisões:*`);
    r.decisoes.forEach((d) => l.push(`• ${d}`));
  }
  if (r.proximas_acoes.length) {
    l.push(`\n👉 *Próximas ações (nossas):*`);
    r.proximas_acoes.forEach((a) => l.push(`• ${a.acao}${a.responsavel ? ` — *${a.responsavel}*` : ""}${a.prazo ? ` (${a.prazo})` : ""}`));
  }
  if (r.pendencias_cliente.length) {
    l.push(`\n📌 *Pendências do cliente:*`);
    r.pendencias_cliente.forEach((p) => l.push(`• ${p.item}${p.impacto ? ` — _${p.impacto}_` : ""}`));
  }
  const px = dataBR(r.proxima_reuniao);
  if (px) l.push(`\n🗓️ Próxima reunião: ${px}`);
  l.push(`\n_Registrei na ficha (aba *Jornada CS*): última reunião = hoje, próxima ação e pendências atualizadas._`);
  return l.join("\n");
}

/** Extrai as notas da reunião do comando ("Lone, resumo da reunião do X: <notas>"). "" se não achar. */
export function extrairNotasReuniao(text: string): string {
  const i = text.indexOf(":");
  if (i < 0) return "";
  return text.slice(i + 1).trim();
}
