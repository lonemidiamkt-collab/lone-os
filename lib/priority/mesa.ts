// lib/priority/mesa.ts — a MESA DO GESTOR de tráfego (etapa 2 do plano de tráfego, 26/10/2026).
//
// O motor de prioridades já existia, com nota explicável — e nenhuma das 441 recomendações de tráfego de 45 dias
// foi decidida por uma pessoa. O feed era uma lista de 91 itens abertos em outra tela, e "Feito" fazia o item
// voltar na hora seguinte. A Mesa é a mesma fila, no lugar onde o gestor trabalha (Tráfego), com o que cabe num
// dia: no máximo 10 itens, o que tem mais dinheiro em jogo primeiro, três decisões de um toque e a conferência
// automática de que o "Já fiz" resolveu.
//
// Aqui: as contas puras (resumo da semana). A leitura do banco está em carregarMesa, logo abaixo.

import { supabaseAdmin } from "@/lib/supabase/server";
import type { ResultadoConferencia } from "./conferencia";

export const ITENS_NA_MESA = 10;

export interface LinhaSemana {
  created_at: string;
  estado: string;
  decidido_em: string | null;
  resultado: string | null;
}

export interface ResumoSemana {
  recebidos: number;
  decididos: number;
  /** % decididos dos recebidos na semana (a meta é 60%). null sem nada recebido. */
  taxa: number | null;
  /** Mediana de horas entre o item aparecer e alguém decidir. */
  horasAteDecidir: number | null;
  feitos: number;
  resolvidos: number;
  voltaram: number;
}

const DECIDIDOS = new Set(["executada", "ignorada", "incorreta", "aceita"]);

function mediana(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** O resumo da semana de um gestor (ou da equipe). Pura. */
export function resumoDaSemana(linhas: LinhaSemana[]): ResumoSemana {
  const decididas = linhas.filter((l) => DECIDIDOS.has(l.estado) && l.decidido_em);
  const horas = decididas
    .map((l) => (Date.parse(l.decidido_em!) - Date.parse(l.created_at)) / 3_600_000)
    .filter((h) => Number.isFinite(h) && h >= 0);
  const feitas = linhas.filter((l) => l.estado === "executada");
  const med = mediana(horas);
  return {
    recebidos: linhas.length,
    decididos: decididas.length,
    taxa: linhas.length ? Math.round((decididas.length / linhas.length) * 100) : null,
    horasAteDecidir: med === null ? null : Math.round(med * 10) / 10,
    feitos: feitas.length,
    resolvidos: feitas.filter((l) => l.resultado === "resolvido").length,
    voltaram: feitas.filter((l) => l.resultado === "voltou").length,
  };
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export interface ItemMesa {
  id: string; fingerprint: string; client_id: string | null; cliente: string; titulo: string; motivo: string;
  fato: string[]; recomendacao: string; score: number; exposicao_rs: number | null; confianca: number;
  owner: string | null; estado: string; created_at: string; primeira_vez: string | null;
  acao_proposta: Record<string, unknown> | null;
  /** Já foi marcado "Já fiz" antes e a conferência viu o problema voltar. */
  voltou: boolean;
}

export interface FeitoMesa {
  id: string; cliente: string; titulo: string; decidido_em: string; decidido_por: string | null;
  resultado: ResultadoConferencia | null;
}

export interface Mesa {
  gestor: string | null;
  itens: ItemMesa[];
  /** Abertos além dos que cabem na Mesa (continuam na fila, aparecem quando a Mesa esvazia). */
  alemDaMesa: number;
  adiados: number;
  feitos: FeitoMesa[];
  semana: ResumoSemana;
  gestores: string[];
}

const ABERTAS = ["nova", "vista", "aceita"];
const limparNome = (n: string) => n.replace(/[,.()%_*]/g, " ").trim();

/** A Mesa de um gestor de tráfego (ou de todos, com gestor = null). Lança se não conseguir ler. */
export async function carregarMesa(gestor: string | null, agora: Date = new Date()): Promise<Mesa> {
  const agoraIso = agora.toISOString();
  const seteDias = new Date(agora.getTime() - 7 * 864e5).toISOString();
  const quatorze = new Date(agora.getTime() - 14 * 864e5).toISOString();
  const doGestor = <T extends { ilike: (c: string, v: string) => T }>(q: T): T => (gestor ? q.ilike("owner", limparNome(gestor)) : q);

  const [abertos, adiados, feitos, semana, donos] = await Promise.all([
    doGestor(supabaseAdmin.from("recommendations")
      .select("id, fingerprint, client_id, cliente, titulo, motivo, fato, recomendacao, score, exposicao_rs, confianca, owner, estado, created_at, primeira_vez, acao_proposta", { count: "exact" })
      .eq("fonte", "trafego").in("estado", ABERTAS)
      .or(`adiada_ate.is.null,adiada_ate.lte.${agoraIso}`))
      .order("score", { ascending: false }).limit(ITENS_NA_MESA),
    doGestor(supabaseAdmin.from("recommendations").select("id", { count: "exact", head: true })
      .eq("fonte", "trafego").in("estado", ABERTAS).gt("adiada_ate", agoraIso)),
    doGestor(supabaseAdmin.from("recommendations")
      .select("id, cliente, titulo, decidido_em, decidido_por, resultado")
      .eq("fonte", "trafego").eq("estado", "executada").gte("decidido_em", seteDias))
      .order("decidido_em", { ascending: false }).limit(30),
    doGestor(supabaseAdmin.from("recommendations").select("created_at, estado, decidido_em, resultado")
      .eq("fonte", "trafego").gte("created_at", seteDias)),
    supabaseAdmin.from("recommendations").select("owner").eq("fonte", "trafego").in("estado", ABERTAS).not("owner", "is", null),
  ]);
  const erro = abertos.error ?? adiados.error ?? feitos.error ?? semana.error ?? donos.error;
  if (erro) throw new Error(`recommendations: ${erro.message}`);

  const lista = (abertos.data ?? []) as Omit<ItemMesa, "voltou">[];
  // "Voltou": o mesmo problema já foi marcado como feito e a conferência viu reaparecer.
  const fps = lista.map((i) => i.fingerprint);
  let voltaram = new Set<string>();
  if (fps.length) {
    const { data: ant, error: eAnt } = await supabaseAdmin.from("recommendations").select("fingerprint")
      .in("fingerprint", fps).eq("estado", "executada").eq("resultado", "voltou").gte("decidido_em", quatorze);
    if (eAnt) throw new Error(`recommendations: ${eAnt.message}`);
    voltaram = new Set((ant ?? []).map((a) => a.fingerprint as string));
  }

  return {
    gestor,
    itens: lista.map((i) => ({ ...i, voltou: voltaram.has(i.fingerprint) })),
    alemDaMesa: Math.max(0, (abertos.count ?? lista.length) - lista.length),
    adiados: adiados.count ?? 0,
    feitos: (feitos.data ?? []) as FeitoMesa[],
    semana: resumoDaSemana((semana.data ?? []) as LinhaSemana[]),
    gestores: [...new Set((donos.data ?? []).map((d) => String(d.owner)).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
  };
}
