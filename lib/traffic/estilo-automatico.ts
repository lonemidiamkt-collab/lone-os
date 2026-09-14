// lib/traffic/estilo-automatico.ts — ESTILO VISUAL sem ninguém subir print (Roberto, 14/09):
// as artes que a Lone já entregou ao cliente são o retrato mais fiel da marca — e já estão no
// sistema (card_attachments). Este módulo é PURO: escolhe quais artes representam o cliente e
// decide se está na hora de reler. Quem grava é lib/traffic/estilo-ler.ts.

export interface ArteCandidata { url: string; tipo: string | null; status: string; criadoEm: string; posicao: number | null }
export interface LeituraAnterior { fonte: string; criadoEm: string; imagens: string[] }

export const MAX_ARTES = 6;
export const DIAS_VALIDADE = 45;
export const NOVAS_PARA_RELER = 6;

// Preferência: publicada > agendada > aprovada pelo cliente > em aprovação. Referência do cliente
// (foto que ele mandou) NUNCA entra — não é arte nossa. Anexo sem tipo (anteriores à separação)
// só conta se o card já passou da aprovação interna.
const PESO: Record<string, number> = { published: 4, scheduled: 3, client_approval: 2, approval: 1 };
const ehImagem = (u: string) => /\.(png|jpe?g|webp)(\?|$)/i.test(u);

export function escolherArtes(cands: ArteCandidata[], max = MAX_ARTES): string[] {
  const ok = cands.filter((c) => ehImagem(c.url) && c.tipo !== "referencia" && (c.tipo === "entrega" || (c.tipo == null && (PESO[c.status] ?? 0) >= 2)) && (PESO[c.status] ?? 0) >= 1);
  ok.sort((a, b) => (PESO[b.status] ?? 0) - (PESO[a.status] ?? 0) || b.criadoEm.localeCompare(a.criadoEm) || (a.posicao ?? 0) - (b.posicao ?? 0));
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const c of ok) { if (vistos.has(c.url)) continue; vistos.add(c.url); out.push(c.url); if (out.length >= max) break; }
  return out;
}

export type Motivo = "sem_leitura" | "vencida" | "artes_novas" | "print_recente" | "poucas_artes" | "em_dia";

/** Decide se relê. Print subido por gente vale mais que a leitura automática enquanto estiver válido. */
export function decidirReleitura(p: { ultima: LeituraAnterior | null; artesNovasDesde: number; totalArtes: number; agora: Date }): { reler: boolean; motivo: Motivo } {
  if (p.totalArtes < 2) return { reler: false, motivo: "poucas_artes" };
  if (!p.ultima) return { reler: true, motivo: "sem_leitura" };
  const idadeDias = (p.agora.getTime() - new Date(p.ultima.criadoEm).getTime()) / 86_400_000;
  if (p.ultima.fonte === "print" && idadeDias <= DIAS_VALIDADE) return { reler: false, motivo: "print_recente" };
  if (idadeDias > DIAS_VALIDADE) return { reler: true, motivo: "vencida" };
  if (p.artesNovasDesde >= NOVAS_PARA_RELER) return { reler: true, motivo: "artes_novas" };
  return { reler: false, motivo: "em_dia" };
}
