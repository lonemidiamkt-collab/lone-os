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

export interface EnderecoDaFicha {
  endereco_cep: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
}

/** O que gravar na ficha (só campos vazios, só com o mesmo CEP). Objeto vazio = nada a fazer. */
export function numeroPelaReceita(ficha: EnderecoDaFicha, e: Pick<EmpresaReceita, "endereco">): { endereco_numero?: string; endereco_complemento?: string } {
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
//   • texto antigo que bate com o CNPJ (tem o CEP da Receita ou o nome da rua sem o tipo) → preenche os campos;
//   • texto antigo com outro endereço (a loja, não a sede) → não mexe; fica na lista para conferir.
// O texto antigo nunca é apagado.

const TIPOS_DE_RUA = new Set(["rua", "r", "avenida", "av", "estrada", "est", "rodovia", "rod", "travessa", "tv", "alameda", "al", "praca", "pca", "quadra", "largo", "via", "beco", "servidao", "ladeira", "loteamento"]);
const normalizar = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** "Rua Pedro Luiz Souza" → "pedro luiz souza" (sem o tipo, sem acento) — o que se procura no texto antigo. */
export function nucleoDaRua(rua: string | null | undefined): string {
  const partes = normalizar(rua).split(" ").filter(Boolean);
  if (partes.length > 1 && TIPOS_DE_RUA.has(partes[0])) partes.shift();
  return partes.join(" ");
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
  | { acao: "nada"; motivo: "ficha já tem endereço" | "Receita sem endereço completo" | "texto antigo com outro endereço" };

export function enderecoPelaReceita(ficha: FichaSemEndereco, e: Pick<EmpresaReceita, "endereco">): DecisaoEndereco {
  if ([ficha.endereco_cep, ficha.endereco_rua, ficha.endereco_cidade].some((v) => v?.trim())) return { acao: "nada", motivo: "ficha já tem endereço" };
  const r = e.endereco;
  if (!r.cep || !r.rua || !r.cidade) return { acao: "nada", motivo: "Receita sem endereço completo" };
  const antigo = ficha.endereco?.trim() ?? "";
  let motivo: "ficha vazia" | "texto antigo bate com o CNPJ" = "ficha vazia";
  if (antigo) {
    const nucleo = nucleoDaRua(r.rua);
    const bateCep = digitos(antigo).includes(digitos(r.cep));
    const bateRua = nucleo.length >= 5 && ` ${normalizar(antigo)} `.includes(` ${nucleo} `);
    if (!bateCep && !bateRua) return { acao: "nada", motivo: "texto antigo com outro endereço" };
    motivo = "texto antigo bate com o CNPJ";
  }
  const campos: Record<string, string> = { endereco_cep: r.cep, endereco_rua: r.rua, endereco_cidade: r.cidade };
  if (r.numero && !ficha.endereco_numero?.trim()) campos.endereco_numero = r.numero;
  if (r.complemento && !ficha.endereco_complemento?.trim()) campos.endereco_complemento = r.complemento;
  if (r.bairro && !ficha.endereco_bairro?.trim()) campos.endereco_bairro = r.bairro;
  if (r.uf && !ficha.endereco_estado?.trim()) campos.endereco_estado = r.uf;
  return { acao: "preencher", motivo, campos };
}
