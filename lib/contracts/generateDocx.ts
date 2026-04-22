import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import extenso from "extenso";

// ─── Template files (bundled in contract-templates/) ─────────────────
const TEMPLATE_BY_SERVICE: Record<string, string> = {
  assessoria_social: "Contrato - Social Media.docx",
  assessoria_trafego: "Contrato - Tráfego Pago.docx",
  lone_growth: "Contrato - Lone Growth.docx",
};

// Lucas e Roberto sempre assinam juntos — fica fixo no template preenchido.
const LM_REPRESENTANTES = "Lucas Bueno Dos Santos e Roberto Lino Machado Neto";

const MESES_EXTENSO = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export interface ContractMergeData {
  // Dados do cliente (vem do cadastro)
  cliente_razao_social: string;
  cliente_cnpj: string;
  cliente_endereco: string;
  cliente_numero: string;
  cliente_bairro: string;
  cliente_cidade: string;
  cliente_cep: string;
  cliente_representante_nome: string;
  cliente_representante_cpf: string;
  cliente_email: string;
  cliente_nicho?: string; // obrigatório em Tráfego e Lone Growth

  // Dados comerciais (preenchidos no form)
  valor_mensal_numero: number; // em reais (ex: 2500.00)
  duracao_meses_numero: number; // em meses (ex: 6)
  dia_pagamento_numero: number; // dia do mês (ex: 10)

  // Reajuste opcional (cláusula 2.7 condicional)
  has_renewal?: boolean;
  renewal_value?: number | null;

  // Meta
  service_type: "assessoria_social" | "assessoria_trafego" | "lone_growth";
  version?: number; // aparece no filename (default = 1)
  data_assinatura?: Date; // default = hoje
}

// Formata R$ 2.500,00 → "dois mil e quinhentos reais"
//         R$ 2.500,50 → "dois mil e quinhentos reais e cinquenta centavos"
//         R$ 1,00     → "um real"
// O template escreve só `({{valor_mensal_extenso}})` — todo o texto (reais/real/centavos)
// vem pronto da lib `extenso`, respeitando singular/plural e presença de centavos.
function currencyToWords(value: number): string {
  const brFormat = value.toFixed(2).replace(".", ",");
  return extenso(brFormat, { mode: "currency", currency: { type: "BRL" } });
}

// Formata número → "seis" / "doze"
function numberToWords(value: number): string {
  return extenso(String(value));
}

function buildTemplateData(input: ContractMergeData): Record<string, string> {
  const today = input.data_assinatura ?? new Date();
  const valorFormatado = input.valor_mensal_numero.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Cláusula de reajuste: só aparece se admin habilitou na geração do contrato.
  // Sem reajuste → placeholder fica vazio (parágrafo some no .docx).
  let clausulaReajuste = "";
  if (input.has_renewal && input.renewal_value && input.renewal_value > 0) {
    const novoFormatado = input.renewal_value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const novoExtenso = currencyToWords(input.renewal_value);
    clausulaReajuste =
      `2.7. Após o término do período inicial de ${input.duracao_meses_numero} (${numberToWords(input.duracao_meses_numero)}) meses, ` +
      `o valor mensal será reajustado para R$ ${novoFormatado} (${novoExtenso}), mantendo-se todas as demais condições contratuais vigentes, salvo manifestação expressa em contrário por qualquer das partes.`;
  }

  return {
    cliente_razao_social: input.cliente_razao_social,
    cliente_cnpj: input.cliente_cnpj,
    cliente_endereco: input.cliente_endereco,
    cliente_numero: input.cliente_numero,
    cliente_bairro: input.cliente_bairro,
    cliente_cidade: input.cliente_cidade,
    cliente_cep: input.cliente_cep,
    cliente_representante_nome: input.cliente_representante_nome,
    cliente_representante_cpf: input.cliente_representante_cpf,
    cliente_email: input.cliente_email,
    cliente_nicho: input.cliente_nicho ?? "",

    valor_mensal_numero: valorFormatado,
    valor_mensal_extenso: currencyToWords(input.valor_mensal_numero),
    duracao_meses_numero: String(input.duracao_meses_numero),
    duracao_meses_extenso: numberToWords(input.duracao_meses_numero),
    dia_pagamento_numero: String(input.dia_pagamento_numero),
    dia_pagamento_extenso: numberToWords(input.dia_pagamento_numero),

    data_dia: String(today.getDate()).padStart(2, "0"),
    data_mes_extenso: MESES_EXTENSO[today.getMonth()],
    data_ano: String(today.getFullYear()),

    lm_representante_nome: LM_REPRESENTANTES,
    clausula_reajuste: clausulaReajuste,
  };
}

export interface GenerateDocxResult {
  buffer: Buffer;
  filename: string;
}

/**
 * Gera o .docx preenchido com os dados do cliente.
 * Lê o template bundled em `contract-templates/`, substitui {{placeholders}},
 * e retorna o buffer pronto pra download/upload.
 *
 * Fontes de truth:
 *   - Templates: /contract-templates/*.docx (gerados via `node convert.js`)
 *   - Delimitadores: {{ }} (configurado explicitamente pra casar com os .docx)
 *
 * Erros esperados:
 *   - Template não encontrado → lança erro com service_type
 *   - Placeholder sem valor → docxtemplater deixa em branco (nullGetter)
 *   - Placeholder quebrado (ex: {{cliente_nome` sem fechar) → throw TemplateError
 */
export function generateContractDocx(input: ContractMergeData): GenerateDocxResult {
  const templateFile = TEMPLATE_BY_SERVICE[input.service_type];
  if (!templateFile) {
    throw new Error(`service_type inválido: ${input.service_type}`);
  }

  const templatePath = path.join(process.cwd(), "contract-templates", templateFile);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template não encontrado: ${templatePath}. Rode \`cd contract-templates && node convert.js\` pra gerar os .docx.`);
  }

  const templateBuffer = fs.readFileSync(templatePath);
  const zip = new PizZip(templateBuffer);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    nullGetter: () => "", // placeholders sem valor viram string vazia (não travam)
  });

  doc.render(buildTemplateData(input));

  const buffer = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
  const safeName = input.cliente_razao_social.replace(/[^a-zA-Z0-9À-ÿ\s-]/g, "").trim();
  const versionTag = input.version && input.version > 1 ? ` V${input.version}` : "";
  const filename = `${safeName}${versionTag} - ${templateFile}`;

  return { buffer, filename };
}
