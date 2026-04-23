// Smoke test do merge engine dos contratos.
// Roda: `npx tsx scripts/test-merge-docx.ts`
// Verifica:
//   - Todos os placeholders são substituídos (nenhum `{{campo}}` residual no XML)
//   - Valores por extenso corretos pra inteiros, centavos, singular/plural
//   - Cláusula de reajuste aparece SÓ quando has_renewal=true
//   - Version > 1 aparece no filename
//
// Exit 0 = tudo ok. Exit 1 = algum caso falhou.

import PizZip from "pizzip";
import { generateContractDocx, type ContractMergeData } from "../lib/contracts/generateDocx";

const base: Omit<ContractMergeData, "valor_mensal_numero"> = {
  cliente_razao_social: "ACME Ltda",
  cliente_cnpj: "12.345.678/0001-90",
  cliente_endereco: "Rua Teste",
  cliente_numero: "1",
  cliente_bairro: "Centro",
  cliente_cidade: "São Paulo",
  cliente_cep: "01000-000",
  cliente_representante_nome: "João",
  cliente_representante_cpf: "111.222.333-44",
  cliente_email: "j@acme.com",
  cliente_nicho: "construção civil",
  duracao_meses_numero: 6,
  dia_pagamento_numero: 10,
  service_type: "assessoria_trafego",
};

interface TestCase {
  name: string;
  input: Partial<ContractMergeData> & { valor_mensal_numero: number };
  assertions: Array<(xml: string, filename: string) => string | null>;
}

function xmlToText(xml: string): string {
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function assertContains(needle: string) {
  return (xml: string) => {
    const text = xmlToText(xml);
    return text.includes(needle) ? null : `expected to contain "${needle}"`;
  };
}

function assertNotContains(needle: string) {
  return (xml: string) => {
    const text = xmlToText(xml);
    return !text.includes(needle) ? null : `expected NOT to contain "${needle}"`;
  };
}

function assertFilename(needle: string) {
  return (_xml: string, filename: string) => {
    return filename.includes(needle) ? null : `filename "${filename}" missing "${needle}"`;
  };
}

const cases: TestCase[] = [
  {
    name: "Valor inteiro 2500 → dois mil e quinhentos reais",
    input: { valor_mensal_numero: 2500 },
    assertions: [
      assertContains("dois mil e quinhentos reais"),
      assertNotContains("{{"),
      assertNotContains("centavos"),
    ],
  },
  {
    name: "Valor com centavos 2500,50",
    input: { valor_mensal_numero: 2500.5 },
    assertions: [
      assertContains("dois mil e quinhentos reais"),
      assertContains("cinquenta centavos"),
      assertNotContains("{{"),
    ],
  },
  {
    name: "Singular 1 real (não 'reais')",
    input: { valor_mensal_numero: 1 },
    assertions: [
      assertContains("um real"),
      assertNotContains("um reais"),
    ],
  },
  {
    name: "Só centavos 0,50",
    input: { valor_mensal_numero: 0.5 },
    assertions: [
      assertContains("cinquenta centavos"),
    ],
  },
  {
    name: "Cláusula de reajuste SEM renovação → vazio",
    input: { valor_mensal_numero: 2500, has_renewal: false },
    assertions: [
      assertNotContains("2.7."),
      assertNotContains("reajustado"),
    ],
  },
  {
    name: "Cláusula de reajuste COM renovação 3500",
    input: { valor_mensal_numero: 2500, has_renewal: true, renewal_value: 3500 },
    assertions: [
      assertContains("2.7."),
      assertContains("reajustado"),
      assertContains("três mil e quinhentos reais"),
    ],
  },
  {
    name: "Version=1 não aparece no filename",
    input: { valor_mensal_numero: 2500, version: 1 },
    assertions: [
      (_x, f) => f.includes(" V1 ") ? "V1 should not appear" : null,
      assertFilename("Contrato"),
    ],
  },
  {
    name: "Version=2 aparece no filename",
    input: { valor_mensal_numero: 2500, version: 2 },
    assertions: [
      assertFilename(" V2 "),
    ],
  },
  {
    name: "Nicho customizado aparece no texto",
    input: { valor_mensal_numero: 2500, cliente_nicho: "odontologia estética" },
    assertions: [
      assertContains("odontologia estética"),
    ],
  },
];

let failed = 0;
for (const tc of cases) {
  const input: ContractMergeData = { ...base, ...tc.input };
  try {
    const { buffer, filename } = generateContractDocx(input);
    const zip = new PizZip(buffer);
    const xml = zip.file("word/document.xml")!.asText();
    const errors = tc.assertions
      .map((fn) => fn(xml, filename))
      .filter((e): e is string => e !== null);
    if (errors.length > 0) {
      console.error(`✗ ${tc.name}`);
      for (const err of errors) console.error(`    ${err}`);
      failed++;
    } else {
      console.log(`✓ ${tc.name}`);
    }
  } catch (err) {
    console.error(`✗ ${tc.name} (threw)`);
    console.error(err);
    failed++;
  }
}

console.log("---");
if (failed > 0) {
  console.error(`${failed}/${cases.length} falharam`);
  process.exit(1);
}
console.log(`${cases.length}/${cases.length} passaram`);
