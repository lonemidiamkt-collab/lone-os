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
    "enderecoCep", "enderecoRua", "enderecoNumero", "enderecoBairro", "enderecoCidade",
  ],
  documentos: ["docLogo", "docContrato"],
  // Login e senha em par (24/10/2026, item 1.6): só vira falta quando o cliente começou o acesso e
  // deixou metade (lib/onboarding/acessos.ts, faltaNoAcesso). Em branco ou "Não tenho" não trava.
  acessos: ["senhaMeta", "loginMeta", "senhaInstagram", "loginInstagram", "senhaGoogle", "loginGoogle"],
  review: [],
};

export const ROTULO_CAMPO: Record<string, string> = {
  cnpj: "CNPJ", nomeFantasia: "Nome fantasia", faturamentoFaixa: "Faturamento médio por mês",
  contactName: "Nome do responsável", contactEmail: "E-mail", contactWhatsapp: "WhatsApp",
  enderecoCep: "CEP", enderecoRua: "Rua", enderecoNumero: "Número do endereço", enderecoBairro: "Bairro", enderecoCidade: "Cidade",
  docLogo: "Logo da empresa", docContrato: "Contrato social ou cartão CNPJ",
  senhaMeta: "senha do Facebook / Meta", loginMeta: "login do Facebook / Meta",
  senhaInstagram: "senha do Instagram", loginInstagram: "login do Instagram",
  senhaGoogle: "senha do Google Ads / Gmail", loginGoogle: "login do Google Ads / Gmail",
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
