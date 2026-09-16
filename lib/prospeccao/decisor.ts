// lib/prospeccao/decisor.ts — quem manda na empresa (§9). Prioridade: proprietário > sócio
// administrador > diretor > gerente comercial > marketing. Fontes: QSA do CNPJ (BrasilAPI) e o
// que a busca web mostrou. Sem IA: a consolidação é regra, e a confiança vem da quantidade e
// da qualidade das fontes — nunca de um palpite.

import { nomeProprio, primeiraPessoa } from "./normalizar";

export interface Socio { nome: string; qualificacao?: string | null }

export interface DecisorAchado {
  nome: string | null;
  cargo: string | null;
  confianca: number;
  fontes: string[];
  /** Outros nomes vistos (para o Roberto conferir). */
  alternativas: { nome: string; cargo: string | null; fonte: string }[];
}

const PESO_QUALIFICACAO: { rx: RegExp; cargo: string; peso: number }[] = [
  { rx: /titular|empres[aá]rio individual|propriet/i, cargo: "Proprietário", peso: 5 },
  { rx: /s[oó]cio[- ]administrador|administrador/i, cargo: "Sócio administrador", peso: 4 },
  { rx: /diretor|presidente/i, cargo: "Diretor", peso: 3 },
  { rx: /s[oó]ci[oa]/i, cargo: "Sócio", peso: 2 },
  { rx: /gerente comercial|comercial/i, cargo: "Gerente comercial", peso: 2 },
  { rx: /marketing/i, cargo: "Responsável pelo marketing", peso: 1 },
];

function classificar(qualificacao: string | null | undefined): { cargo: string; peso: number } {
  const q = qualificacao ?? "";
  for (const r of PESO_QUALIFICACAO) if (r.rx.test(q)) return { cargo: r.cargo, peso: r.peso };
  return { cargo: q ? nomeProprio(q)! : "Sócio", peso: 1 };
}

const ehPessoaJuridica = (nome: string) => /\b(ltda|s\/?a|eireli|holding|participa[cç][oõ]es|me\b|epp)\b/i.test(nome);

/** "Marcelo Ferreira" e "Marcelo Ferreira da Silva" são a mesma pessoa: mesmo primeiro nome e um
 *  é prefixo do outro (ou compartilham dois nomes). "Marcelo Silva" ≠ "Marcelo Ferreira". */
export function mesmaPessoa(a: string, b: string): boolean {
  const pa = a.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter((w) => !["da", "de", "do", "das", "dos", "e"].includes(w));
  const pb = b.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter((w) => !["da", "de", "do", "das", "dos", "e"].includes(w));
  if (!pa.length || !pb.length || pa[0] !== pb[0]) return false;
  const [curto, longo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  if (curto.every((w, i) => longo[i] === w)) return true;
  return curto.filter((w) => longo.includes(w)).length >= 2;
}

export function consolidarDecisor(p: {
  qsa?: Socio[] | null;
  webNome?: string | null; webCargo?: string | null; webFonte?: string | null;
  conversaNome?: string | null;
}): DecisorAchado {
  const alternativas: DecisorAchado["alternativas"] = [];
  const candidatos: { nome: string; cargo: string; pontos: number; fontes: Set<string> }[] = [];
  const add = (nome: string | null | undefined, cargo: string, pontos: number, fonte: string) => {
    const n = nomeProprio(primeiraPessoa(nome?.trim()));
    if (!n || n.length < 4 || ehPessoaJuridica(n)) return;
    const existente = candidatos.find((c) => mesmaPessoa(c.nome, n));
    if (existente) { existente.pontos += pontos; existente.fontes.add(fonte); if (n.length > existente.nome.length) existente.nome = n; if (cargo && pontos > 2) existente.cargo = cargo; return; }
    candidatos.push({ nome: n, cargo, pontos, fontes: new Set([fonte]) });
  };
  for (const s of p.qsa ?? []) {
    const { cargo, peso } = classificar(s.qualificacao);
    add(s.nome, cargo, peso, "CNPJ");
    alternativas.push({ nome: nomeProprio(s.nome) ?? s.nome, cargo, fonte: "CNPJ (QSA)" });
  }
  if (p.webNome) {
    const { cargo, peso } = classificar(p.webCargo ?? "proprietário");
    add(p.webNome, p.webCargo ? nomeProprio(p.webCargo)! : cargo, Math.max(peso, 3), p.webFonte ? `web (${p.webFonte})` : "web");
    alternativas.push({ nome: nomeProprio(p.webNome) ?? p.webNome, cargo: p.webCargo ?? null, fonte: p.webFonte ?? "web" });
  }
  if (p.conversaNome) add(p.conversaNome, "Decisor (informado na conversa)", 6, "conversa");
  if (!candidatos.length) return { nome: null, cargo: null, confianca: 0, fontes: [], alternativas };
  candidatos.sort((a, b) => b.pontos - a.pontos);
  const top = candidatos[0];
  // Confiança: 1 fonte fraca ≈ 0,5; QSA de sócio-administrador ≈ 0,75; duas fontes concordando ≈ 0,9+.
  let confianca = 0.35 + Math.min(0.4, top.pontos * 0.08) + (top.fontes.size - 1) * 0.2;
  if (candidatos.length > 1 && candidatos[1].pontos === top.pontos && candidatos[1].fontes.size === top.fontes.size) confianca -= 0.15; // empate entre sócios
  confianca = Math.round(Math.max(0.2, Math.min(0.98, confianca)) * 100) / 100;
  return { nome: top.nome, cargo: top.cargo, confianca, fontes: Array.from(top.fontes), alternativas };
}
