// lib/onboarding/etapas.ts — o que cada etapa do link de cadastro exige antes do "Próximo".
//
// POR QUE (21/10/2026). Um cliente (DOMINOS) mandou ao Roberto: "apesar dos campos serem
// obrigatórios, consigo clicar em Próximo e passar"; e "na última etapa descubro que aquele campo
// que eu passei é obrigatório — a verificação deveria estar na etapa certa". O Próximo só trocava de
// etapa; a conferência existia só no fim. Agora cada etapa confere o que é dela, e a aba do topo
// não pula etapa incompleta.
//
// Puro. Testado em tests/onboarding-etapas.test.ts.

export type Etapa = "dados" | "documentos" | "acessos" | "review";

/** Campos obrigatórios por etapa (as chaves de `missingRequired` na página), na ordem da tela. */
export const OBRIGATORIOS_POR_ETAPA: Record<Etapa, string[]> = {
  dados: [
    "cnpj", "nomeFantasia", "faturamentoFaixa", "contactName", "contactEmail", "contactWhatsapp",
    "enderecoCep", "enderecoRua", "enderecoBairro", "enderecoCidade",
  ],
  documentos: ["docLogo", "docContrato"],
  acessos: [],
  review: [],
};

export const ROTULO_CAMPO: Record<string, string> = {
  cnpj: "CNPJ", nomeFantasia: "Nome fantasia", faturamentoFaixa: "Faturamento médio por mês",
  contactName: "Nome do responsável", contactEmail: "E-mail", contactWhatsapp: "WhatsApp",
  enderecoCep: "CEP", enderecoRua: "Rua", enderecoBairro: "Bairro", enderecoCidade: "Cidade",
  docLogo: "Logo da empresa", docContrato: "Contrato social ou cartão CNPJ",
};

export const ORDEM_ETAPAS: Etapa[] = ["dados", "documentos", "acessos", "review"];

/** Rótulos do que falta NESTA etapa (vazio = pode seguir). */
export function faltandoNaEtapa(etapa: Etapa, faltando: Record<string, boolean>): string[] {
  return OBRIGATORIOS_POR_ETAPA[etapa].filter((c) => faltando[c]).map((c) => ROTULO_CAMPO[c] ?? c);
}

/**
 * Até onde o cliente pode ir: a etapa pedida, ou a primeira ANTERIOR a ela que ainda tem
 * obrigatório faltando. Voltar é sempre livre.
 */
export function destinoPermitido(atual: Etapa, pedida: Etapa, faltando: Record<string, boolean>): Etapa {
  const iPedida = ORDEM_ETAPAS.indexOf(pedida);
  if (iPedida <= ORDEM_ETAPAS.indexOf(atual)) return pedida;
  for (let i = 0; i < iPedida; i++) {
    const e = ORDEM_ETAPAS[i];
    if (faltandoNaEtapa(e, faltando).length) return e;
  }
  return pedida;
}

// ── Tamanho dos arquivos ────────────────────────────────────────────────────
// Contrato social escaneado passa fácil de 10 MB (o da DOMINOS passava). O storage aceita 50 MB nos
// documentos (bucket onboarding-docs) e 10 MB no logo (brand-assets, público).
export const MB = 1024 * 1024;
export const LIMITE_POR_DOCUMENTO: Record<string, number> = { logo: 10 * MB, contrato_social: 30 * MB, identidade: 30 * MB };
export const limiteDoDocumento = (docType: string) => LIMITE_POR_DOCUMENTO[docType] ?? 10 * MB;
