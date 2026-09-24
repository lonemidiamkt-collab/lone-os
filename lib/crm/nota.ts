// lib/crm/nota.ts — NOTA A/B/C DO LEAD MANUAL (Leva 7C, N28). Módulo PURO.
//
// O Piloto SDR já dá a cada prospect uma classe A/B/C/NP pela régua do ICP (lib/prospeccao/score.ts:
// segmento, porte, faturamento estimado, presença digital, Google, anúncio, unidades, decisor, site,
// distância). O lead que o comercial cadastrou à mão não tinha nota nenhuma — e o funil misturava a
// indicação quente com o contato frio sem diferença.
//
// Aqui a MESMA régua (os mesmos pesos, editáveis na Configuração da prospecção) é aplicada a uma
// qualificação rápida que o SDR preenche no lead. Nada é inventado: o que ficou em branco pontua como
// "não confirmado", exatamente como na prospecção. Lead que veio da prospecção herda a classe do
// prospect (a leitura dele é mais completa que a qualificação à mão).

import { calcularScore, rotuloClasse } from "@/lib/prospeccao/score";
import type { ProspectConfig } from "@/lib/prospeccao/config";
import type { Classe, ProspectRow } from "@/lib/prospeccao/tipos";

export type Porte = "MEI" | "ME" | "EPP" | "DEMAIS";

export interface QualificacaoLead {
  /** Nome de um segmento do ICP (config.segmentos[].nome) ou texto livre. */
  segmento?: string | null;
  porte?: Porte | null;
  seguidores?: number | null;
  postsPorSemana?: number | null;
  /** true/false quando verificado; null = não verificado. */
  anuncia?: boolean | null;
  googleNota?: number | null;
  googleAvaliacoes?: number | null;
  unidades?: number | null;
  /** Falamos com quem decide? */
  decisor?: boolean | null;
  site?: boolean | null;
  uf?: string | null;
  distanciaKm?: number | null;
  temInstagram?: boolean | null;
}

export const PORTES: readonly { id: Porte; rotulo: string }[] = [
  { id: "MEI", rotulo: "MEI" },
  { id: "ME", rotulo: "Microempresa" },
  { id: "EPP", rotulo: "Pequena (EPP)" },
  { id: "DEMAIS", rotulo: "Média ou maior" },
];

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const bool = (v: unknown): boolean | null => (v === true || v === false ? v : null);

/** Limpa o que veio da tela (ou do banco) para a forma que a régua espera. */
export function normalizarQualificacao(q: unknown): QualificacaoLead {
  const o = (q && typeof q === "object" ? q : {}) as Record<string, unknown>;
  const porte = PORTES.some((p) => p.id === o.porte) ? (o.porte as Porte) : null;
  const seg = typeof o.segmento === "string" && o.segmento.trim() ? o.segmento.trim().slice(0, 80) : null;
  const uf = typeof o.uf === "string" && /^[a-z]{2}$/i.test(o.uf.trim()) ? o.uf.trim().toUpperCase() : null;
  return {
    segmento: seg, porte, seguidores: num(o.seguidores), postsPorSemana: num(o.postsPorSemana),
    anuncia: bool(o.anuncia), googleNota: num(o.googleNota) !== null && (o.googleNota as number) <= 5 ? (o.googleNota as number) : null,
    googleAvaliacoes: num(o.googleAvaliacoes), unidades: num(o.unidades), decisor: bool(o.decisor), site: bool(o.site),
    uf, distanciaKm: num(o.distanciaKm), temInstagram: bool(o.temInstagram),
  };
}

/** A qualificação vista como um prospect — só os campos que a régua lê; o resto fica nulo. */
export function comoProspect(q: QualificacaoLead): ProspectRow {
  const temInsta = q.temInstagram ?? (q.seguidores != null ? true : null);
  return {
    cnae: null, segmento: q.segmento ?? null, porte: q.porte ?? null, capital_social: null, abertura: null,
    google_avaliacoes: q.googleAvaliacoes ?? null, google_nota: q.googleNota ?? null, unidades: q.unidades ?? null,
    instagram: temInsta ? "informado" : null, site: q.site ? "informado" : null,
    presenca: { instagram_followers: q.seguidores ?? null, posts_por_semana: q.postsPorSemana ?? null, anuncia: q.anuncia ?? null, anuncia_fonte: q.anuncia != null ? "informado pelo comercial" : null },
    decisor_nome: q.decisor ? "informado" : null, decisor_confianca: q.decisor ? 1 : null,
    distancia_km: q.distanciaKm ?? null, uf: q.uf ?? null,
  } as unknown as ProspectRow;
}

export interface NotaLead { nota: Classe; score: number; detalhe: Record<string, { pontos: number; max: number; motivo: string }> }

/** A nota pela régua da prospecção. */
export function notaDoLead(q: QualificacaoLead, cfg: ProspectConfig, agora = new Date()): NotaLead {
  const r = calcularScore(comoProspect(q), cfg, agora);
  return { nota: r.classe, score: r.score, detalhe: r.detalhe };
}

/** Quantos campos a pessoa respondeu — nota com 1 resposta de 13 é chute, e a tela diz. */
export function camposRespondidos(q: QualificacaoLead): number {
  return Object.values(q).filter((v) => v !== null && v !== undefined && v !== "").length;
}

export const rotuloNota = (n: Classe | null | undefined) => rotuloClasse(n);
