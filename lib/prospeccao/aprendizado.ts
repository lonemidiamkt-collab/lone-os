// lib/prospeccao/aprendizado.ts — "lojas de pisos com 2+ unidades convertem 3x mais" (§35).
//
// Sem modelo estatístico: contagem honesta por corte (segmento, cidade, CNAE, faixa de score,
// variante da abordagem, dia/hora do primeiro contato, distância, modalidade), sempre com o `n`
// ao lado. Um corte com 2 abordagens não ensina nada e a tela diz isso.

import { supabaseAdmin } from "@/lib/supabase/server";
import type { ProspectRow } from "./tipos";
import { componentesSP } from "./tempo";

export interface Corte { chave: string; abordados: number; respostas: number; reunioes: number; realizadas: number; vendas: number; taxa: string; n_ok: boolean }
export interface Cruzamentos {
  segmento: Corte[]; cidade: Corte[]; cnae: Corte[]; faixa_score: Corte[]; abordagem: Corte[];
  dia_semana: Corte[]; hora: Corte[]; distancia: Corte[]; modalidade: Corte[];
  objecoes: { chave: string; n: number }[];
  n_minimo: number;
}

export const N_MINIMO = 5;
const REUNIAO = new Set(["reuniao_agendada", "handoff", "reuniao_realizada", "no_show", "proposta", "cliente"]);
const REALIZADA = new Set(["reuniao_realizada", "proposta", "cliente"]);

function faixaScore(s: number | null): string {
  if (s === null) return "sem score";
  if (s >= 90) return "90–100";
  if (s >= 80) return "80–89";
  if (s >= 70) return "70–79";
  if (s >= 60) return "60–69";
  return "< 60";
}
function faixaDistancia(km: number | null): string {
  if (km === null) return "sem distância";
  if (km <= 30) return "até 30 km";
  if (km <= 80) return "31–80 km";
  if (km <= 150) return "81–150 km";
  return "> 150 km";
}
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function agrupar(ps: ProspectRow[], respondeu: Set<string>, chaveDe: (p: ProspectRow) => string | null, nMin = N_MINIMO): Corte[] {
  const m = new Map<string, Corte>();
  for (const p of ps) {
    const k = chaveDe(p);
    if (!k) continue;
    const c = m.get(k) ?? { chave: k, abordados: 0, respostas: 0, reunioes: 0, realizadas: 0, vendas: 0, taxa: "—", n_ok: false };
    c.abordados++;
    if (respondeu.has(p.id)) c.respostas++;
    if (REUNIAO.has(p.estagio) || p.reuniao_em) c.reunioes++;
    if (REALIZADA.has(p.estagio)) c.realizadas++;
    if (p.estagio === "cliente") c.vendas++;
    m.set(k, c);
  }
  return Array.from(m.values()).map((c) => ({
    ...c, taxa: c.abordados ? `${Math.round((c.reunioes / c.abordados) * 100)}%` : "—", n_ok: c.abordados >= nMin,
  })).sort((a, b) => (b.n_ok === a.n_ok ? (b.reunioes / Math.max(1, b.abordados)) - (a.reunioes / Math.max(1, a.abordados)) || b.abordados - a.abordados : b.n_ok ? 1 : -1));
}

export async function cruzamentos(deIso: string, ateIso: string): Promise<Cruzamentos> {
  const { data: ps } = await supabaseAdmin.from("prospects").select("*").not("primeira_abordagem_em", "is", null)
    .gte("primeira_abordagem_em", deIso).lt("primeira_abordagem_em", ateIso).limit(5000);
  const abordados = (ps ?? []) as ProspectRow[];
  const ids = abordados.map((p) => p.id);
  const respondeu = new Set<string>();
  if (ids.length) {
    const { data: ms } = await supabaseAdmin.from("prospect_messages").select("prospect_id").eq("direcao", "in").in("prospect_id", ids).limit(50000);
    for (const m of (ms ?? []) as { prospect_id: string }[]) respondeu.add(m.prospect_id);
  }
  const objecoes = new Map<string, number>();
  for (const p of abordados) for (const o of p.objecoes ?? []) objecoes.set(o, (objecoes.get(o) ?? 0) + 1);
  return {
    segmento: agrupar(abordados, respondeu, (p) => p.segmento),
    cidade: agrupar(abordados, respondeu, (p) => p.cidade),
    cnae: agrupar(abordados, respondeu, (p) => (p.cnae ? `${p.cnae}${p.cnae_descricao ? ` ${p.cnae_descricao.slice(0, 40)}` : ""}` : null)),
    faixa_score: agrupar(abordados, respondeu, (p) => faixaScore(p.score)),
    abordagem: agrupar(abordados, respondeu, (p) => p.variante_abordagem),
    dia_semana: agrupar(abordados, respondeu, (p) => (p.primeira_abordagem_em ? DIAS[componentesSP(new Date(p.primeira_abordagem_em)).diaSemana] : null)),
    hora: agrupar(abordados, respondeu, (p) => (p.primeira_abordagem_em ? `${String(componentesSP(new Date(p.primeira_abordagem_em)).hora).padStart(2, "0")}h` : null)),
    distancia: agrupar(abordados, respondeu, (p) => faixaDistancia(p.distancia_km)),
    modalidade: agrupar(abordados.filter((p) => p.reuniao_tipo), respondeu, (p) => (p.reuniao_tipo === "visita" ? "presencial" : "online"), 1),
    objecoes: Array.from(objecoes.entries()).map(([chave, n]) => ({ chave, n })).sort((a, b) => b.n - a.n).slice(0, 10),
    n_minimo: N_MINIMO,
  };
}
