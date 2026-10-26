// tests/contratos-arquivo-mes.test.ts — o arquivo de contratos por mês (lib/contracts/arquivo-d4sign.ts).
//
// Roberto, 26/10/2026: "uma área de arquivos para vermos contratos de cada mês, e podermos baixar eles
// também". O que importa: cada contrato aparece UMA vez, no mês certo (fuso de Brasília), com o PDF que
// existir; o .zip não repete nome; a fila baixa o mais recente primeiro e para no teto de tentativas.

import { describe, it, expect } from "vitest";
import {
  juntarArquivo, mesesDoArquivo, nomesNoZip, filaDeDownload, mesDe, nomeDoMes, PDF_TENTATIVAS,
  type DocArquivo, type ContratoArquivo,
} from "@/lib/contracts/arquivo-d4sign";

const nomes = new Map([["cli-boali", "Boali"], ["cli-dominos", "Dominos"], ["cli-raki", "Óticas Raki"]]);
const doc = (o: Partial<DocArquivo>): DocArquivo => ({
  document_uuid: "d-1", nome: "CONTRATO - LONE GROWTH - BOALI.pdf", tipo: "contrato", client_id: "cli-boali",
  contract_id: null, assinado_em: "2026-10-21T19:35:00Z", pdf_path: null, pdf_erro: null, ...o,
});
const contrato = (o: Partial<ContratoArquivo>): ContratoArquivo => ({
  id: "k-1", client_id: "cli-raki", version: 1, signed_at: "2026-09-10T12:00:00Z",
  signed_pdf_path: "legal://contracts-signed/cli-raki/k-1.pdf", d4sign_document_uuid: null, ...o,
});

describe("mês do contrato", () => {
  it("no fuso de Brasília: 31/10 às 22h é outubro", () => {
    expect(mesDe("2026-11-01T01:00:00Z")).toBe("2026-10");
    expect(mesDe("2026-11-01T03:30:00Z")).toBe("2026-11");
    expect(nomeDoMes("2026-10")).toBe("outubro de 2026");
  });
});

describe("juntar D4Sign e Lone OS", () => {
  it("cada contrato uma vez; o subido à mão sem documento da D4Sign também entra", () => {
    const itens = juntarArquivo([doc({})], [contrato({})], nomes);
    expect(itens.map((i) => [i.cliente, i.origem])).toEqual([["Boali", "d4sign"], ["Óticas Raki", "lone"]]);
  });

  it("documento ligado a contrato com PDF subido: um item só, com o PDF do contrato enquanto a D4Sign não entrega", () => {
    const itens = juntarArquivo([doc({ contract_id: "k-1", client_id: "cli-raki" })], [contrato({})], nomes);
    expect(itens).toHaveLength(1);
    expect(itens[0].pdf).toBe("legal://contracts-signed/cli-raki/k-1.pdf");
    expect(itens[0].pdfErro).toBeNull();
  });

  it("contrato que aponta para o documento da D4Sign não duplica", () => {
    const itens = juntarArquivo([doc({ document_uuid: "d-9" })], [contrato({ d4sign_document_uuid: "d-9" })], nomes);
    expect(itens).toHaveLength(1);
  });

  it("sem data de assinatura não entra (não dá para dizer o mês); sem cadastro usa o nome do arquivo", () => {
    expect(juntarArquivo([doc({ assinado_em: null })], [], nomes)).toEqual([]);
    const [i] = juntarArquivo([doc({ client_id: null, nome: "CONTRATO - DOMINOS - LONE GROWTH 1.pdf" })], [], nomes);
    expect(i.cliente).toMatch(/DOMINOS/i);
  });

  it("meses do mais recente ao mais antigo, com quantos já têm PDF", () => {
    const itens = juntarArquivo([doc({}), doc({ document_uuid: "d-2", pdf_path: "legal://x.pdf" })], [contrato({})], nomes);
    expect(mesesDoArquivo(itens)).toEqual([{ mes: "2026-10", total: 2, comPdf: 1 }, { mes: "2026-09", total: 1, comPdf: 1 }]);
  });
});

describe(".zip do mês", () => {
  it("data, cliente e documento no nome, sem acento estranho e sem repetir", () => {
    const n = nomesNoZip([
      { assinadoEm: "2026-10-21T19:35:00Z", cliente: "Óticas Raki", documento: "Contrato V1" },
      { assinadoEm: "2026-10-21T20:00:00Z", cliente: "Óticas Raki", documento: "Contrato V1" },
    ]);
    expect(n).toEqual(["2026-10-21 - Oticas Raki - Contrato V1.pdf", "2026-10-21 - Oticas Raki - Contrato V1 (2).pdf"]);
  });
});

describe("fila de download", () => {
  it("mais recente primeiro, sem data por último, para no teto de tentativas", () => {
    const f = filaDeDownload([
      { id: "a", assinado_em: "2026-09-01T00:00:00Z", pdf_path: null, pdf_tentativas: 0 },
      { id: "b", assinado_em: null, pdf_path: null, pdf_tentativas: 0 },
      { id: "c", assinado_em: "2026-10-01T00:00:00Z", pdf_path: null, pdf_tentativas: 1 },
      { id: "d", assinado_em: "2026-10-05T00:00:00Z", pdf_path: "legal://ok.pdf", pdf_tentativas: 1 },
      { id: "e", assinado_em: "2026-10-09T00:00:00Z", pdf_path: null, pdf_tentativas: PDF_TENTATIVAS },
    ]);
    expect(f.map((x) => x.id)).toEqual(["c", "a", "b"]);
  });
});
