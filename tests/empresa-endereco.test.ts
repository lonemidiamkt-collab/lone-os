import { describe, expect, it } from "vitest";
import { numeroPelaReceita, separarNumeroDaRua } from "@/lib/empresa/endereco";
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
