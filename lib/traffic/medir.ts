// lib/traffic/medir.ts — FILHO × PAI. Função pura. O veredito da variação, pela régua do cliente.
//
// Brief do Roberto: "o desempenho da variação é comparado ao criativo pai; o Lone OS registra o
// resultado e atualiza o aprendizado daquele cliente". Régua: gasto mínimo de decisão (3× a meta ou
// R$ 50, o que for maior) e conversas mínimas; sem isso, "inconclusiva" — e continua medindo.
// validada = filho ≥ 15% melhor em CPL; refutada = ≥ 15% pior; entre os dois, inconclusiva.

export interface JanelaMedida { spend: number; conversions: number; impressions: number; clicks: number }

export interface Veredito {
  veredito: "validada" | "refutada" | "inconclusiva";
  motivo: string;
  cplPai: number | null; cplFilho: number | null; ctrPai: number | null; ctrFilho: number | null;
  variacaoCpl: number | null; // filho/pai − 1 (negativo = melhor)
  gastoFilho: number; conversasFilho: number; suficiente: boolean;
}

export function medirFilhoContraPai(p: { pai: JanelaMedida; filho: JanelaMedida; cplMeta?: number | null; convMin?: number | null }): Veredito {
  const cpl = (j: JanelaMedida) => (j.conversions > 0 ? j.spend / j.conversions : null);
  const ctr = (j: JanelaMedida) => (j.impressions > 0 ? (j.clicks / j.impressions) * 100 : null);
  const gastoMin = Math.max(50, (p.cplMeta ?? 10) * 3);
  const convMin = Math.max(3, Math.min(p.convMin ?? 5, 8));
  const base = { cplPai: cpl(p.pai), cplFilho: cpl(p.filho), ctrPai: ctr(p.pai), ctrFilho: ctr(p.filho), gastoFilho: p.filho.spend, conversasFilho: p.filho.conversions };
  const suficiente = p.filho.spend >= gastoMin && (p.filho.conversions >= convMin || p.filho.spend >= gastoMin * 2);
  if (!suficiente) return { ...base, veredito: "inconclusiva", suficiente: false, variacaoCpl: null, motivo: `Ainda sem amostra: R$ ${p.filho.spend.toFixed(0)} e ${p.filho.conversions} conversas (precisa de R$ ${gastoMin.toFixed(0)} e ${convMin} conversas)` };
  if (base.cplPai == null) return { ...base, veredito: "inconclusiva", suficiente: true, variacaoCpl: null, motivo: "Pai sem conversas na janela comparável — não há régua" };
  if (base.cplFilho == null) {
    // gastou o suficiente e não converteu: pior que o pai, com folga
    return { ...base, veredito: "refutada", suficiente: true, variacaoCpl: null, motivo: `Filho gastou R$ ${p.filho.spend.toFixed(0)} sem conversa; o pai fazia R$ ${base.cplPai.toFixed(2)} por conversa` };
  }
  const v = base.cplFilho / base.cplPai - 1;
  if (v <= -0.15) return { ...base, veredito: "validada", suficiente: true, variacaoCpl: v, motivo: `Filho ${Math.round(-v * 100)}% mais barato por conversa (R$ ${base.cplFilho.toFixed(2)} × R$ ${base.cplPai.toFixed(2)})` };
  if (v >= 0.15) return { ...base, veredito: "refutada", suficiente: true, variacaoCpl: v, motivo: `Filho ${Math.round(v * 100)}% mais caro por conversa (R$ ${base.cplFilho.toFixed(2)} × R$ ${base.cplPai.toFixed(2)})` };
  return { ...base, veredito: "inconclusiva", suficiente: true, variacaoCpl: v, motivo: `Diferença de ${Math.round(v * 100)}% — dentro do ruído; segue medindo` };
}
