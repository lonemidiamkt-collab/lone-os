import { describe, it, expect } from "vitest";
import {
  empresaDaBrasilApi, nichoPorCnae, porteDaReceita, formatarCnae, capitalizar,
  faixaValida, rotuloFaixa, FAIXAS_FATURAMENTO,
} from "@/lib/empresa/receita";
import { normalizarNicho, ROTULO_NICHO, type Nicho } from "@/lib/cs/nicho";

// Formato real de GET brasilapi.com.br/api/cnpj/v1/{cnpj} (campos conferidos em 18/10/2026).
const loja = {
  cnpj: "12345678000190",
  razao_social: "MATERIAIS DE CONSTRUCAO EXEMPLO LTDA",
  nome_fantasia: "EXEMPLO CONSTRUCAO",
  descricao_situacao_cadastral: "ATIVA",
  cnae_fiscal: 4744099,
  cnae_fiscal_descricao: "Comércio varejista de materiais de construção em geral",
  cnaes_secundarios: [{ codigo: 4741500, descricao: "Comércio varejista de tintas e materiais para pintura" }],
  porte: "EMPRESA DE PEQUENO PORTE",
  opcao_pelo_mei: false,
  capital_social: 150000,
  data_inicio_atividade: "2012-03-01",
  ddd_telefone_1: "2226651234",
  cep: "28970000",
  descricao_tipo_de_logradouro: "RUA",
  logradouro: "PEDRO LUIZ SOUZA",
  numero: "172",
  bairro: "CENTRO",
  municipio: "ARARUAMA",
  uf: "RJ",
};

describe("empresaDaBrasilApi — a resposta da Receita, limpa", () => {
  it("preenche o que o cadastro usa, em caixa normal", () => {
    const e = empresaDaBrasilApi(loja);
    expect(e.razaoSocial).toBe("MATERIAIS DE CONSTRUCAO EXEMPLO LTDA");
    expect(e.nomeFantasia).toBe("EXEMPLO CONSTRUCAO");
    expect(e.ativa).toBe(true);
    expect(e.cnaePrincipal).toBe("4744-0/99");
    expect(e.cnaesSecundarios).toEqual([{ codigo: "4741-5/00", descricao: "Comércio varejista de tintas e materiais para pintura" }]);
    expect(e.porte).toBe("EPP");
    expect(e.capitalSocial).toBe(150000);
    expect(e.telefone).toBe("(22) 2665-1234");
    // Número e complemento separados da rua (vão para os campos próprios do cadastro).
    expect(e.endereco).toEqual({ cep: "28970-000", rua: "Rua Pedro Luiz Souza", numero: "172", complemento: null, bairro: "Centro", cidade: "Araruama", uf: "RJ" });
    expect(e.nicho).toBe("construcao");
    expect(e.nichoRotulo).toBe("Construção e materiais");
  });

  it("empresa baixada não passa por ativa; sem número vira s/n; sem nome fantasia fica nulo", () => {
    const e = empresaDaBrasilApi({ ...loja, descricao_situacao_cadastral: "BAIXADA", numero: "SN", nome_fantasia: "" });
    expect(e.ativa).toBe(false);
    expect(e.situacao).toBe("BAIXADA");
    expect(e.endereco).toMatchObject({ rua: "Rua Pedro Luiz Souza", numero: "S/N" });
    expect(e.nomeFantasia).toBeNull();
  });

  it("logradouro que já traz o tipo não repete ('QUADRA SAUN' com tipo QUADRA)", () => {
    const e = empresaDaBrasilApi({ ...loja, descricao_tipo_de_logradouro: "QUADRA", logradouro: "QUADRA 5 BLOCO B" });
    expect(e.endereco).toMatchObject({ rua: "Quadra 5 Bloco B", numero: "172" });
  });
});

describe("nichoPorCnae — sugestão a partir das atividades", () => {
  const caso = (codigo: number, descricao: string, sec: { codigo: number; descricao: string }[] = []) =>
    nichoPorCnae({ codigo, descricao }, sec);

  it("atividades comuns da carteira", () => {
    expect(caso(4530705, "Comércio a varejo de pneumáticos e câmaras-de-ar")).toBe("automotivo");
    expect(caso(4774100, "Comércio varejista de artigos de óptica")).toBe("otica");
    expect(caso(5611201, "Restaurantes e similares")).toBe("alimentacao");
    expect(caso(9602501, "Cabeleireiros, manicure e pedicure")).toBe("beleza");
    expect(caso(6920601, "Atividades de contabilidade")).toBe("servicos_profissionais");
    expect(caso(4754701, "Comércio varejista de móveis")).toBe("movelaria");
    expect(caso(7500100, "Atividades veterinárias")).toBe("pet");
    expect(caso(9313100, "Atividades de condicionamento físico")).toBe("fitness");
  });

  it("corretora de seguros de saúde é SEGUROS, não saúde (a descrição sozinha erraria)", () => {
    expect(caso(6622300, "Corretores e agentes de seguros, de planos de previdência complementar e de saúde")).toBe("seguros");
  });

  it("instalação elétrica não chuta (é onde a maioria das empresas de energia solar está registrada)", () => {
    expect(caso(4321500, "Instalação e manutenção elétrica")).toBeNull();
    expect(caso(4321500, "Instalação e manutenção elétrica", [{ codigo: 3511501, descricao: "Geração de energia elétrica" }])).toBe("energia_solar");
  });

  it("principal genérica: a primeira secundária específica decide", () => {
    expect(caso(4713002, "Lojas de variedades, exceto lojas de departamentos ou magazines",
      [{ codigo: 4744099, descricao: "Comércio varejista de materiais de construção em geral" }])).toBe("construcao");
    expect(caso(4713002, "Lojas de variedades, exceto lojas de departamentos ou magazines")).toBe("varejo");
  });

  it("sem palpite útil não sugere 'Outro' (o campo fica vazio para o cliente escolher)", () => {
    expect(caso(8130300, "Atividades paisagísticas")).toBeNull();
  });
});

describe("porte e faixa", () => {
  it("porte da Receita, com MEI pela flag", () => {
    expect(porteDaReceita("MICRO EMPRESA")).toBe("ME");
    expect(porteDaReceita("MICRO EMPRESA", true)).toBe("MEI");
    expect(porteDaReceita("EMPRESA DE PEQUENO PORTE")).toBe("EPP");
    expect(porteDaReceita("DEMAIS")).toBe("DEMAIS");
    expect(porteDaReceita("")).toBeNull();
  });
  it("faixa de faturamento", () => {
    expect(FAIXAS_FATURAMENTO).toHaveLength(7);
    expect(faixaValida("100k_200k")).toBe(true);
    expect(faixaValida("R$ 100 mil")).toBe(false);
    expect(rotuloFaixa("acima_500k")).toBe("Acima de R$ 500 mil");
    expect(rotuloFaixa("nada")).toBeNull();
  });
  it("formatos", () => {
    expect(formatarCnae(4744099)).toBe("4744-0/99");
    expect(formatarCnae("123")).toBeNull();
    expect(capitalizar("RUA DOS PINHEIROS DE CIMA")).toBe("Rua dos Pinheiros de Cima");
  });
});

describe("a lista oficial de nichos reconhece os próprios rótulos e chaves", () => {
  it("todo rótulo e toda chave voltam ao mesmo nicho", () => {
    for (const [chave, rotulo] of Object.entries(ROTULO_NICHO) as [Nicho, string][]) {
      if (chave === "outro") continue;
      expect(normalizarNicho(rotulo), rotulo).toBe(chave);
      expect(normalizarNicho(chave), chave).toBe(chave);
    }
  });
});
