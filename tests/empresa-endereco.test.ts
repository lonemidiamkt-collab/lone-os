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
    expect(enderecoPelaReceita({ ...vazia, endereco: "Loja no centro, CEP 28970-000" }, receita)).toMatchObject({ acao: "preencher" });
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
