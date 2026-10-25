import { describe, expect, it } from "vitest";
import { enderecoPelaReceita, nucleoDaRua, numeroPelaReceita, separarNumeroDaRua } from "@/lib/empresa/endereco";
import { empresaDaBrasilApi } from "@/lib/empresa/receita";

// DADOS SINTÉTICOS (o repositório é público).
describe("número grudado na rua", () => {
  it("separa vírgula, nº e s/n; rua sem número fica como está", () => {
    expect(separarNumeroDaRua("Avenida Exemplo, 221")).toEqual({ rua: "Avenida Exemplo", numero: "221" });
    expect(separarNumeroDaRua("Rua das Flores nº 12a")).toEqual({ rua: "Rua das Flores", numero: "12A" });
    expect(separarNumeroDaRua("Estrada Velha, s/n")).toEqual({ rua: "Estrada Velha", numero: "S/N" });
    expect(separarNumeroDaRua("Rua 7 de Setembro")).toBeNull();
    expect(separarNumeroDaRua("Rodovia RJ 106")).toBeNull(); // número que é parte do nome, sem vírgula
    expect(separarNumeroDaRua("")).toBeNull();
  });
});

describe("número pela Receita para cliente antigo", () => {
  const receita = empresaDaBrasilApi({ cep: "28970000", logradouro: "RUA EXEMPLO", descricao_tipo_de_logradouro: "RUA", numero: "172", complemento: "LOJA 2", municipio: "ARARUAMA", uf: "RJ" });
  it("mesmo CEP: completa número e complemento vazios", () => {
    expect(numeroPelaReceita({ endereco_cep: "28970-000", endereco_numero: null, endereco_complemento: "" }, receita)).toEqual({ endereco_numero: "172", endereco_complemento: "Loja 2" });
  });
  it("nunca sobrescreve o que a ficha já tem", () => {
    expect(numeroPelaReceita({ endereco_cep: "28970000", endereco_numero: "50", endereco_complemento: "Sala 1" }, receita)).toEqual({});
  });
  it("CEP diferente (o cliente deu outro endereço) ou ficha sem CEP: não mexe", () => {
    expect(numeroPelaReceita({ endereco_cep: "28900-000", endereco_numero: null, endereco_complemento: null }, receita)).toEqual({});
    expect(numeroPelaReceita({ endereco_cep: null, endereco_numero: null, endereco_complemento: null }, receita)).toEqual({});
  });
});

describe("endereço inteiro pela Receita (ficha sem os campos)", () => {
  const receita = empresaDaBrasilApi({ cep: "28970000", logradouro: "PEDRO LUIZ SOUZA", descricao_tipo_de_logradouro: "RUA", numero: "172", bairro: "CENTRO", municipio: "ARARUAMA", uf: "RJ" });
  const vazia = { endereco: null, endereco_cep: null, endereco_rua: null, endereco_numero: null, endereco_complemento: null, endereco_bairro: null, endereco_cidade: null, endereco_estado: null };

  it("ficha vazia de verdade: preenche tudo que a Receita tem", () => {
    expect(enderecoPelaReceita(vazia, receita)).toEqual({
      acao: "preencher", motivo: "ficha vazia",
      campos: { endereco_cep: "28970-000", endereco_rua: "Rua Pedro Luiz Souza", endereco_numero: "172", endereco_bairro: "Centro", endereco_cidade: "Araruama", endereco_estado: "RJ" },
    });
  });
  it("texto antigo que bate (pela rua, sem o tipo e sem acento, ou pelo CEP): preenche e não apaga o texto", () => {
    expect(enderecoPelaReceita({ ...vazia, endereco: "Av. Pedro Luíz Souza 172 - Centro" }, receita)).toMatchObject({ acao: "preencher", motivo: "texto antigo bate com o CNPJ" });
    const comCepProprio = empresaDaBrasilApi({ cep: "28979192", logradouro: "PEDRO LUIZ SOUZA", descricao_tipo_de_logradouro: "RUA", municipio: "ARARUAMA", uf: "RJ" });
    expect(enderecoPelaReceita({ ...vazia, endereco: "Loja no centro, CEP 28979-192" }, comCepProprio)).toMatchObject({ acao: "preencher" });
  });
  it("texto antigo com outro endereço (a loja, não a sede) ou ficha já preenchida: não mexe", () => {
    expect(enderecoPelaReceita({ ...vazia, endereco: "Rua das Flores, 10, Cabo Frio" }, receita)).toEqual({ acao: "nada", motivo: "texto antigo com outro endereço" });
    expect(enderecoPelaReceita({ ...vazia, endereco_cidade: "Araruama" }, receita)).toEqual({ acao: "nada", motivo: "ficha já tem endereço" });
    expect(enderecoPelaReceita(vazia, empresaDaBrasilApi({ cep: "28970000" }))).toEqual({ acao: "nada", motivo: "Receita sem endereço completo" });
  });
  it("núcleo da rua tira o tipo e o acento", () => {
    expect(nucleoDaRua("Avenida Getúlio Vargas")).toBe("getulio vargas");
    expect(nucleoDaRua("Rua 7")).toBe("7");
  });
});

describe("endereço pelo CNPJ: casos achados na revisão de 25/10", () => {
  const vazia = { endereco: null, endereco_cep: null, endereco_rua: null, endereco_numero: null, endereco_complemento: null, endereco_bairro: null, endereco_cidade: null, endereco_estado: null };
  const rx = (p: Record<string, unknown>) => empresaDaBrasilApi({ cep: "28960514", municipio: "IGUABA GRANDE", uf: "RJ", bairro: "CENTRO", ...p });

  it("mesma rua com outro número escrito pelo cliente: não preenche (a loja não é a sede)", () => {
    const e = rx({ descricao_tipo_de_logradouro: "RUA", logradouro: "CAPITAO EXEMPLO SOARES", numero: "29" });
    expect(enderecoPelaReceita({ ...vazia, endereco: "R. Capitão Exemplo Soares, 102 – Loja A" }, e)).toEqual({ acao: "nada", motivo: "mesma rua, outro número" });
    expect(enderecoPelaReceita({ ...vazia, endereco: "R. Capitão Exemplo Soares, 29 – Loja A" }, e)).toMatchObject({ acao: "preencher" });
  });
  it("inicial e abreviação de título: 'Paulino P. Pinheiro' e 'Coronel'/'Cel' são a mesma rua", () => {
    const e1 = rx({ descricao_tipo_de_logradouro: "AVENIDA", logradouro: "PAULINO PINTO PINHEIRO", numero: "130" });
    expect(enderecoPelaReceita({ ...vazia, endereco: "Av. Paulino P. Pinheiro, 130, Centro" }, e1)).toMatchObject({ acao: "preencher" });
    const e2 = rx({ descricao_tipo_de_logradouro: "RUA", logradouro: "CEL EXEMPLO SOBRINHO", numero: "80" });
    expect(enderecoPelaReceita({ ...vazia, endereco: "Rua Coronel Exemplo Sobrinho, 80" }, e2)).toMatchObject({ acao: "preencher" });
  });
  it("Km, lote e loja não são número de casa; ponto de milhar não atrapalha", () => {
    const e = rx({ descricao_tipo_de_logradouro: "RODOVIA", logradouro: "AMARAL PEIXOTO", numero: "90114" });
    expect(enderecoPelaReceita({ ...vazia, endereco: "Rod. Amaral Peixoto, Km 85, ao lado do café" }, e)).toMatchObject({ acao: "preencher" });
    const e2 = rx({ descricao_tipo_de_logradouro: "RUA", logradouro: "TEIXEIRA E SOUZA", numero: "1.610" });
    expect(enderecoPelaReceita({ ...vazia, endereco: "Av. Teixeira e Souza, 1610, Centro" }, e2)).toMatchObject({ acao: "preencher", campos: { endereco_numero: "1610" } });
  });
  it("CEP genérico da cidade (…-000) não prova o endereço sozinho", () => {
    const e = rx({ cep: "28970000", descricao_tipo_de_logradouro: "RUA", logradouro: "BENTO EXEMPLO", numero: "20" });
    expect(enderecoPelaReceita({ ...vazia, endereco: "Estrada Velha, km 30, CEP 28970-000" }, e)).toEqual({ acao: "nada", motivo: "texto antigo com outro endereço" });
  });
});

describe("CNPJ não ativo não serve de fonte", () => {
  it("filial baixada: nem endereço inteiro nem número", () => {
    const e = empresaDaBrasilApi({ descricao_situacao_cadastral: "BAIXADA", cep: "28985618", descricao_tipo_de_logradouro: "ESTRADA", logradouro: "EXEMPLO GRANDE", numero: "10", municipio: "ARARUAMA", uf: "RJ" });
    const vazia = { endereco: "Estrada Exemplo Grande, 10", endereco_cep: null, endereco_rua: null, endereco_numero: null, endereco_complemento: null, endereco_bairro: null, endereco_cidade: null, endereco_estado: null };
    expect(enderecoPelaReceita(vazia, e)).toEqual({ acao: "nada", motivo: "CNPJ não ativo" });
    expect(numeroPelaReceita({ endereco_cep: "28985-618", endereco_numero: null, endereco_complemento: null }, e)).toEqual({});
  });
});
