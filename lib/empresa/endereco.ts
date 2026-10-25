// lib/empresa/endereco.ts — o NÚMERO do endereço no lugar certo (out/2026).
//
// O link de cadastro não tinha o campo Número até 23/10/2026, e a busca pelo CNPJ grudava o número na rua
// ("Avenida X, 221"). Resultado: 3 de 20 clientes com número na ficha. Aqui ficam as duas regras que arrumam isso:
//   • separarNumeroDaRua — "Rua X, 123" vira { rua: "Rua X", numero: "123" } (o mesmo padrão da migration 20261023110000);
//   • numeroPelaReceita — completa número/complemento VAZIOS pelo CNPJ, só quando o CEP da ficha é o mesmo da Receita
//     (o cliente pode ter informado outro endereço — a loja, não a sede — e aí o número da Receita estaria errado).
// Puro (sem banco, sem rede).

import type { EmpresaReceita } from "@/lib/empresa/receita";

const NUMERO_NO_FIM = /\s*(?:,|\snº|\sn°|\sno\.)\s*(\d+[A-Za-z]?|s\/?n)\s*$/i;

/** "Rua X, 123" → { rua: "Rua X", numero: "123" }; "Rua X, s/n" → numero "S/N". Sem número no fim → null. */
export function separarNumeroDaRua(rua: string | null | undefined): { rua: string; numero: string } | null {
  const t = (rua ?? "").trim();
  const m = t.match(NUMERO_NO_FIM);
  if (!m || m.index === undefined || m.index === 0) return null;
  const numero = /^s\/?n$/i.test(m[1]) ? "S/N" : m[1].toUpperCase();
  return { rua: t.slice(0, m.index).trim(), numero };
}

const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
/** CNPJ baixado/inapto não serve de fonte de endereço (pode ser a filial que fechou). */
const naoAtiva = (e: Pick<EmpresaReceita, "situacao">) => !!e.situacao && e.situacao !== "ATIVA";

export interface EnderecoDaFicha {
  endereco_cep: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
}

/** O que gravar na ficha (só campos vazios, só com o mesmo CEP). Objeto vazio = nada a fazer. */
export function numeroPelaReceita(ficha: EnderecoDaFicha, e: Pick<EmpresaReceita, "endereco" | "situacao">): { endereco_numero?: string; endereco_complemento?: string } {
  if (naoAtiva(e)) return {};
  const cep = digitos(ficha.endereco_cep);
  if (cep.length !== 8 || cep !== digitos(e.endereco.cep)) return {};
  const out: { endereco_numero?: string; endereco_complemento?: string } = {};
  if (!ficha.endereco_numero?.trim() && e.endereco.numero) out.endereco_numero = e.endereco.numero;
  if (!ficha.endereco_complemento?.trim() && e.endereco.complemento) out.endereco_complemento = e.endereco.complemento;
  return out;
}

// ─── Endereço inteiro pela Receita (ficha sem os campos de endereço) ──────────────────────────────────────────────
// Roberto autorizou em 25/10/2026: completar pelo CNPJ quem não tem endereço nos campos da ficha, sem sobrescrever nada.
// Achado: 33 de 36 desses clientes têm o endereço no campo ANTIGO de texto livre (clients.endereco). Por isso a regra:
//   • texto antigo vazio → preenche (ficha vazia de verdade);
//   • texto antigo que bate com o CNPJ (o mesmo CEP — não o genérico da cidade — ou a mesma rua, aceitando inicial e
//     abreviação de título) → preenche os campos; mesma rua com OUTRO número escrito → não mexe;
//   • texto antigo com outro endereço (a loja, não a sede) → não mexe; fica na lista para conferir.
// O texto antigo nunca é apagado.

const TIPOS_DE_RUA = new Set(["rua", "r", "avenida", "av", "estrada", "est", "rodovia", "rod", "travessa", "tv", "alameda", "al", "praca", "pca", "quadra", "largo", "via", "beco", "servidao", "ladeira", "loteamento"]);
const CONECTIVOS = new Set(["de", "da", "do", "das", "dos", "e", "d"]);
/** Abreviações de título em nome de rua ("Cel Ribeiro" na Receita, "Coronel Ribeiro" no texto do cliente). */
const ABREVIACOES: Record<string, string> = {
  cel: "coronel", dr: "doutor", cap: "capitao", capt: "capitao", gal: "general", gen: "general", pres: "presidente", prof: "professor",
  sta: "santa", sto: "santo", sen: "senador", dep: "deputado", ten: "tenente", mal: "marechal", alm: "almirante", eng: "engenheiro",
  pe: "padre", maj: "major", sgt: "sargento", gov: "governador", ver: "vereador", cmte: "comandante", dna: "dona",
};
/** Tira acento, pontuação, CEP ("28941-140") e o ponto de milhar ("1.610" → "1610") antes de comparar. */
const normalizar = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/\b\d{5}-?\d{3}\b/g, " ")
    .replace(/(\d)\.(\d{3})\b/g, "$1$2")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (s: string | null | undefined) => normalizar(s).split(" ").filter(Boolean).map((t) => ABREVIACOES[t] ?? t);

/** "Rua Pedro Luiz Souza" → "pedro luiz souza" (sem o tipo, sem acento) — o que se procura no texto antigo. */
export function nucleoDaRua(rua: string | null | undefined): string {
  const partes = normalizar(rua).split(" ").filter(Boolean);
  if (partes.length > 1 && TIPOS_DE_RUA.has(partes[0])) partes.shift();
  return partes.join(" ");
}

/**
 * Procura a rua da Receita dentro do texto antigo, palavra a palavra, aceitando inicial ("Paulino P. Pinheiro") e
 * abreviação de título ("Cel"/"Coronel"), sem ligar para "de/do/da". Achou → devolve o NÚMERO escrito logo depois
 * (ou null se o que vem depois não é número de casa: "Km 85", "Lt. 11", "Loja 3"). Não achou → undefined.
 */
function procurarRua(ruaReceita: string, antigo: string): { numero: string | null } | undefined {
  const r = tokens(ruaReceita);
  if (r.length > 1 && TIPOS_DE_RUA.has(r[0])) r.shift();
  const alvo = r.filter((t) => !CONECTIVOS.has(t));
  if (alvo.join("").length < 5) return undefined; // "Rua 7" não prova nada
  const todos = tokens(antigo);
  const idx = todos.map((t, i) => ({ t, i })).filter((x) => !CONECTIVOS.has(x.t));
  for (let k = 0; k + alvo.length <= idx.length; k++) {
    const casa = alvo.every((a, j) => {
      const t = idx[k + j].t;
      return t === a || (t.length === 1 && a.startsWith(t));
    });
    if (!casa) continue;
    let p = idx[k + alvo.length - 1].i + 1;
    if (["n", "no", "numero"].includes(todos[p] ?? "")) p++;
    const depois = todos[p] ?? "";
    return { numero: /^\d+[a-z]?$/.test(depois) ? depois.replace(/^0+(?=\d)/, "") : null };
  }
  return undefined;
}

export interface FichaSemEndereco extends EnderecoDaFicha {
  endereco: string | null;
  endereco_rua: string | null;
  endereco_bairro: string | null;
  endereco_cidade: string | null;
  endereco_estado: string | null;
}

export type DecisaoEndereco =
  | { acao: "preencher"; motivo: "ficha vazia" | "texto antigo bate com o CNPJ"; campos: Record<string, string> }
  | { acao: "nada"; motivo: "ficha já tem endereço" | "CNPJ não ativo" | "Receita sem endereço completo" | "texto antigo com outro endereço" | "mesma rua, outro número" };

export function enderecoPelaReceita(ficha: FichaSemEndereco, e: Pick<EmpresaReceita, "endereco" | "situacao">): DecisaoEndereco {
  if ([ficha.endereco_cep, ficha.endereco_rua, ficha.endereco_cidade].some((v) => v?.trim())) return { acao: "nada", motivo: "ficha já tem endereço" };
  if (naoAtiva(e)) return { acao: "nada", motivo: "CNPJ não ativo" };
  const r = e.endereco;
  if (!r.cep || !r.rua || !r.cidade) return { acao: "nada", motivo: "Receita sem endereço completo" };
  const antigo = ficha.endereco?.trim() ?? "";
  let motivo: "ficha vazia" | "texto antigo bate com o CNPJ" = "ficha vazia";
  if (antigo) {
    const rua = procurarRua(r.rua, antigo);
    // CEP genérico da cidade (termina em 000) vale para muitas ruas: não prova nada sozinho.
    const cepReceita = digitos(r.cep);
    const bateCep = !cepReceita.endsWith("000") && digitos(antigo.match(/\b\d{5}-?\d{3}\b/)?.[0]) === cepReceita;
    if (!rua && !bateCep) return { acao: "nada", motivo: "texto antigo com outro endereço" };
    // O cliente escreveu outro número na mesma rua (a loja não é a sede): o número da Receita estaria errado.
    const numReceita = r.numero && r.numero !== "S/N" ? r.numero.toLowerCase().replace(/^0+(?=\d)/, "") : null;
    if (rua?.numero && numReceita && rua.numero !== numReceita) return { acao: "nada", motivo: "mesma rua, outro número" };
    motivo = "texto antigo bate com o CNPJ";
  }
  const campos: Record<string, string> = { endereco_cep: r.cep, endereco_rua: r.rua, endereco_cidade: r.cidade };
  if (r.numero && !ficha.endereco_numero?.trim()) campos.endereco_numero = r.numero;
  if (r.complemento && !ficha.endereco_complemento?.trim()) campos.endereco_complemento = r.complemento;
  if (r.bairro && !ficha.endereco_bairro?.trim()) campos.endereco_bairro = r.bairro;
  if (r.uf && !ficha.endereco_estado?.trim()) campos.endereco_estado = r.uf;
  return { acao: "preencher", motivo, campos };
}
