import { describe, it, expect } from "vitest";
import { patchDoRascunho, COLUNAS_FICHA } from "@/lib/onboarding/sincronia";

// O caso real de 19/10: Armazém dos Fios preencheu CNPJ, endereço e e-mail, parou no logo e no
// contrato social, e a ficha ficou vazia.
const rascunhoFios = {
  nome_fantasia: "Armazém dos Fios", razao_social: "ARMAZEM DOS FIOS LTDA", cnpj: "12.345.678/0001-90",
  contact_email: "Contato@ArmazemDosFios.com.br ", contact_whatsapp: "(22) 99999-0000",
  endereco_rua: "Rua das Flores, 10", endereco_bairro: "Centro", endereco_cidade: "Araruama", endereco_estado: "RJ", endereco_cep: "28970-000",
  instagram_user: "@armazemdosfios", meta_password: "segredo", doc_logo: null, doc_contrato_social: null,
};

describe("patchDoRascunho — o rascunho chega à ficha sem esperar o Enviar", () => {
  it("cliente em cadastro com ficha vazia recebe tudo o que já foi digitado", () => {
    const p = patchDoRascunho(rascunhoFios, { cnpj: "12.345.678/0001-90" }, true);
    expect(p).toMatchObject({
      nome_fantasia: "Armazém dos Fios", razao_social: "ARMAZEM DOS FIOS LTDA",
      email: "contato@armazemdosfios.com.br", email_corporativo: "contato@armazemdosfios.com.br",
      phone: "(22) 99999-0000", endereco_rua: "Rua das Flores, 10", endereco_cep: "28970-000",
      instagram_user: "armazemdosfios",
    });
    expect(p).not.toHaveProperty("cnpj"); // já igual na ficha
    expect(p).not.toHaveProperty("doc_logo"); // vazio no rascunho não apaga
  });

  it("nunca leva senha", () => {
    const p = patchDoRascunho(rascunhoFios, {}, true);
    expect(Object.keys(p).some((k) => /password|senha/.test(k))).toBe(false);
    expect(COLUNAS_FICHA.some((k) => /password/.test(k))).toBe(false);
  });

  it("cliente já ativo: só preenche o vazio, não sobrescreve dado bom com rascunho pela metade", () => {
    const p = patchDoRascunho({ endereco_rua: "Rua A", endereco_cep: "28970-000" }, { endereco_rua: "Rua Pedro Luiz Souza, 172", endereco_cep: null }, false);
    expect(p).toEqual({ endereco_cep: "28970-000" });
  });

  it("cliente em cadastro: a versão mais nova do rascunho vale", () => {
    const p = patchDoRascunho({ endereco_rua: "Rua das Flores, 10" }, { endereco_rua: "Rua das Flo" }, true);
    expect(p).toEqual({ endereco_rua: "Rua das Flores, 10" });
  });

  it("nada novo = nada a gravar", () => {
    expect(patchDoRascunho({ cnpj: "1", nicho: "" }, { cnpj: "1" }, true)).toEqual({});
  });
});
