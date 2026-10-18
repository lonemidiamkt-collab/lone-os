// lib/crm/graficos.ts — a matemática dos gráficos do Comercial (anel e rosca). Módulo PURO, testado.
// Os componentes (components/crm/graficos) só desenham o que sai daqui.
//
// Regras de mercado que valem aqui (pesquisa de 17/10/2026, ver PROMPT-DESIGN-COMERCIAL.md):
//   • rosca é para COMPOSIÇÃO com até 5 partes: o resto vira "Outros"; ordem decrescente a partir das 12h;
//   • a legenda sempre leva valor E porcentagem (o olho não mede ângulo) — porcentagens que somam 100;
//   • anel é para PROGRESSO; passar de 100% não estoura o desenho: vira selo.

export interface Fatia { chave: string; rotulo: string; valor: number }
export interface FatiaDesenhada extends Fatia {
  pct: number;     // inteiro, a soma das fatias dá 100
  inicio: number;  // 0..100, onde a fatia começa no círculo (0 = 12h)
  tamanho: number; // 0..100, tamanho real (sem arredondar) — o desenho usa este
  outros: boolean;
}

/** Porcentagens inteiras que somam 100 (maior resto). Tudo zero → tudo zero. */
export function porcentagensInteiras(valores: number[]): number[] {
  const total = valores.reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0) return valores.map(() => 0);
  const brutos = valores.map((v) => (Math.max(0, v) / total) * 100);
  const base = brutos.map(Math.floor);
  let falta = 100 - base.reduce((s, v) => s + v, 0);
  const ordem = brutos.map((b, i) => ({ i, resto: b - Math.floor(b) })).sort((a, b) => b.resto - a.resto);
  for (const { i } of ordem) { if (falta <= 0) break; base[i] += 1; falta -= 1; }
  return base;
}

/** Fatias da rosca: só valores > 0, em ordem decrescente, no máximo `max` (a última vira "Outros"). */
export function montarFatias(fatias: Fatia[], max = 5): FatiaDesenhada[] {
  const positivas = fatias.filter((f) => f.valor > 0).sort((a, b) => b.valor - a.valor);
  let lista: (Fatia & { outros: boolean })[] = positivas.map((f) => ({ ...f, outros: false }));
  if (positivas.length > max) {
    const resto = positivas.slice(max - 1);
    lista = [...positivas.slice(0, max - 1).map((f) => ({ ...f, outros: false })),
      { chave: "outros", rotulo: "Outros", valor: resto.reduce((s, f) => s + f.valor, 0), outros: true }];
  }
  const total = lista.reduce((s, f) => s + f.valor, 0);
  const pcts = porcentagensInteiras(lista.map((f) => f.valor));
  let inicio = 0;
  return lista.map((f, i) => {
    const tamanho = total ? (f.valor / total) * 100 : 0;
    const d = { ...f, pct: pcts[i], inicio, tamanho };
    inicio += tamanho;
    return d;
  });
}

/** Quanto do anel pintar (0..100) e se passou da meta (selo "112%"). */
export function arcoDoAnel(pct: number | null | undefined): { pintar: number; texto: string; passou: boolean } {
  if (pct == null || !Number.isFinite(pct)) return { pintar: 0, texto: "—", passou: false };
  const p = Math.max(0, pct);
  return { pintar: Math.min(100, p), texto: `${Math.round(p)}%`, passou: p > 100 };
}

export type Tom = "primary" | "success" | "warning" | "danger" | "muted";

/**
 * Cor da meta pelo RITMO, não pelo valor absoluto: no dia 5 ter 10% está ótimo; no dia 25, não.
 * progresso e fracaoDoMes em 0..1. À frente do ritmo → verde; até 10 pontos atrás → âmbar; mais → vermelho.
 */
export function tomDoRitmo(progresso: number | null, fracaoDoMes: number): Tom {
  if (progresso == null) return "muted";
  if (progresso >= 1) return "success";
  const atraso = fracaoDoMes - progresso;
  if (atraso <= 0) return "success";
  if (atraso <= 0.1) return "warning";
  return "danger";
}

/** Cor de uma taxa com limites (ex.: follow-up em dia: ≥ 80% bom, ≥ 50% atenção). */
export function tomDaTaxa(pct: number | null, bom = 80, atencao = 50): Tom {
  if (pct == null) return "muted";
  return pct >= bom ? "success" : pct >= atencao ? "warning" : "danger";
}
