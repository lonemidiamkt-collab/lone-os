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
