// lib/crm/cidade.ts — cidade escrita de um jeito só (23/10/2026: a tela mostrava "rio das ostras" e "Rio das Ostras" como
// cidades diferentes). Maiúscula inicial, conectores (de, da, do, das, dos, e) em minúscula, espaços limpos. Não troca
// nome nem completa abreviação: "campos" vira "Campos" — quem sabe se é Campos dos Goytacazes é quem cadastrou.

const CONECTORES = new Set(["de", "da", "do", "das", "dos", "e", "d'"]);

export function normalizarCidade(bruto: string | null | undefined): string | null {
  const t = (bruto ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((p, i) => (i > 0 && CONECTORES.has(p) ? p : p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1)))
    .join(" ");
}
