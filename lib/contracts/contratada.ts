// lib/contracts/contratada.ts — quem é a CONTRATADA em todo contrato da casa.
//
// Estava espalhado: o gerador .docx tinha os signatários em código, o `agency_settings` tinha as
// colunas (razao_social, cnpj, endereco…) TODAS VAZIAS, e o PDF novo não tinha nada — saía
// "CONTRATADA: Lone Mídia — Assessoria de Marketing para Vendas", sem CNPJ e sem sede. Contrato
// sem qualificação da contratada é defeito de forma, não detalhe de layout.
//
// Os dados vêm dos contratos assinados de verdade (UNAFER, Veneza, Arte em Manipulação).
// Se mudarem — endereço, sócio, razão social — muda AQUI e vale pra todo documento.

export const CONTRATADA = {
  razaoSocial: "LM ASSESSORIA E MARKETING LTDA",
  nomeFantasia: "Lone Mídia",
  cnpj: "62.074.361/0001-30",
  endereco: "Avenida Getúlio Vargas, nº 221, sala 403, Centro, Araruama/RJ, CEP 28.979-129",
  email: "lonemidiamkt@gmail.com",
  /** Qualificação que vai na abertura, com CPF — é o que identifica quem assina pela empresa. */
  representantes:
    "Lucas Bueno dos Santos, inscrito no CPF sob o nº 149.208.747-58, e Roberto Lino Machado Neto, inscrito no CPF sob o nº 184.165.597-08",
  /** Versão curta, pro bloco de assinatura. */
  representantesNomes: "Lucas Bueno dos Santos e Roberto Lino Machado Neto",
  comarca: "Araruama/RJ",
} as const;
