// lib/onboarding/sincronia.ts — o que o cliente já digitou no link de cadastro vai para a FICHA, sem
// esperar o "Enviar".
//
// POR QUE (19/10/2026). Roberto: "os clientes estão mandando o endereço, CNPJ, e lá no cadastro
// dentro do Lone OS não está aparecendo". O rascunho do formulário (client_onboarding_submissions)
// era salvo a cada 3 s, mas só passava para clients no envio final — e o envio trava sem logo e
// contrato social. Armazém dos Fios preencheu CNPJ, endereço e e-mail, parou nos documentos, e a
// ficha continuou vazia; o contrato não tinha de onde sair.
//
// Regra: só campos de cadastro (nunca senha — essas seguem pelo cofre, no envio). Cliente ainda em
// cadastro (draft_status preenchido) recebe a versão mais nova do rascunho; cliente já ativo só tem
// o VAZIO preenchido — um rascunho pela metade não sobrescreve dado bom da ficha.
//
// Puro (sem banco). Testado em tests/onboarding-sincronia.test.ts.

/** coluna do rascunho → coluna(s) da ficha (o mesmo mapa do envio final em app/api/onboarding). */
export const RASCUNHO_PARA_FICHA: Record<string, string[]> = {
  nome_fantasia: ["nome_fantasia"],
  razao_social: ["razao_social"],
  cnpj: ["cnpj"],
  nicho: ["nicho"],
  faturamento_faixa: ["faturamento_faixa"],
  contact_name: ["contact_name"],
  contact_cpf: ["cpf_cnpj"],
  contact_whatsapp: ["phone"],
  contact_email: ["email", "email_corporativo"],
  company_phone: ["company_phone"],
  contact_phone: ["contact_phone"],
  instagram_user: ["instagram_user"],
  endereco_rua: ["endereco_rua"],
  endereco_numero: ["endereco_numero"],
  endereco_complemento: ["endereco_complemento"],
  endereco_bairro: ["endereco_bairro"],
  endereco_cidade: ["endereco_cidade"],
  endereco_estado: ["endereco_estado"],
  endereco_cep: ["endereco_cep"],
  doc_logo: ["doc_logo"],
  doc_contrato_social: ["doc_contrato_social"],
  doc_identidade: ["doc_identidade"],
  // O que a Receita disse (gravado no servidor pela consulta do CNPJ).
  porte_receita: ["porte_receita"],
  cnae_principal: ["cnae_principal"],
  cnae_descricao: ["cnae_descricao"],
  cnaes_secundarios: ["cnaes_secundarios"],
  capital_social: ["capital_social"],
  situacao_cadastral: ["situacao_cadastral"],
  receita_consultada_em: ["receita_consultada_em"],
};

/** Colunas da ficha que a sincronia lê para decidir (select do cliente). */
export const COLUNAS_FICHA = [...new Set(Object.values(RASCUNHO_PARA_FICHA).flat())];

const vazio = (v: unknown) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

/**
 * O que gravar na ficha a partir do rascunho. Devolve só as colunas que mudam ({} = nada a fazer).
 * `emCadastro`: o cliente ainda não foi ativado (draft_status preenchido).
 */
export function patchDoRascunho(
  rascunho: Record<string, unknown>,
  ficha: Record<string, unknown>,
  emCadastro: boolean,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [origem, destinos] of Object.entries(RASCUNHO_PARA_FICHA)) {
    let valor = rascunho[origem];
    if (vazio(valor)) continue;
    if (typeof valor === "string") valor = valor.trim();
    if (origem === "instagram_user" && typeof valor === "string") valor = valor.replace(/^@+/, "");
    if (origem === "contact_email" && typeof valor === "string") valor = valor.toLowerCase();
    for (const destino of destinos) {
      const atual = ficha[destino];
      const igual = JSON.stringify(atual) === JSON.stringify(valor);
      if (igual) continue;
      if (vazio(atual) || emCadastro) patch[destino] = valor;
    }
  }
  return patch;
}
