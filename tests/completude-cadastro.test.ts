import { describe, it, expect } from "vitest";
import { completude, preencherDoCliente, type LinhaCliente } from "@/lib/clients/completude";

const cheio: LinhaCliente = {
  nome_fantasia: "Armazém do Ferro", razao_social: "Armazém LTDA", cnpj: "11.111.111/0001-11",
  nicho: "Construção", contact_name: "João", phone: "22999990000", company_phone: "2222220000",
  contact_phone: "22988880000", email: "joao@a.com", instagram_user: "armazemdoferro",
  endereco_rua: "Rua A, 10", endereco_bairro: "Centro", endereco_cidade: "Araruama",
  endereco_estado: "RJ", endereco_cep: "28970-000",
  doc_logo: "logos/a.png", doc_contrato_social: "docs/a.pdf",
};

describe("o que falta", () => {
  it("cadastro cheio não falta nada", () => {
    const c = completude(cheio);
    expect(c.faltando).toHaveLength(0);
    expect(c.percentual).toBe(100);
    expect(c.completo).toBe(true);
  });

  it("cadastro vazio falta tudo", () => {
    const c = completude({});
    expect(c.percentual).toBe(0);
    expect(c.completo).toBe(false);
    expect(c.faltandoEssencial.length).toBeGreaterThan(0);
  });

  it("faltar só o que NÃO é essencial ainda conta como completo", () => {
    // Cobrar o cliente por causa do bairro gasta a única chance de resposta com o que não trava
    // nada. Falta bairro, estado e telefone da empresa — nada disso impede contrato nem operação.
    const c = completude({ ...cheio, endereco_bairro: null, endereco_estado: null, company_phone: null });
    expect(c.completo).toBe(true);
    expect(c.faltando).toHaveLength(3);
    expect(c.faltandoEssencial).toHaveLength(0);
  });

  it("faltar CNPJ derruba: sem ele não sai contrato", () => {
    const c = completude({ ...cheio, cnpj: null });
    expect(c.completo).toBe(false);
    expect(c.faltandoEssencial.map((f) => f.campo)).toContain("cnpj");
  });

  it("string só com espaço é vazio", () => {
    expect(completude({ ...cheio, contact_name: "   " }).faltandoEssencial.map((f) => f.campo))
      .toContain("contact_name");
  });

  it("os rótulos são legíveis por gente, não nomes de coluna", () => {
    const rotulos = completude({}).faltando.map((f) => f.rotulo);
    expect(rotulos).toContain("Nome do responsável");
    expect(rotulos.join(" ")).not.toMatch(/_/);
  });
});

describe("pré-preencher o link de completar", () => {
  it("leva o que existe, com o nome de coluna da submissão", () => {
    const p = preencherDoCliente({ ...cheio, cpf_cnpj: "123.456.789-00" });
    expect(p.contact_whatsapp).toBe("22999990000");   // clients.phone → submissão
    expect(p.contact_cpf).toBe("123.456.789-00");     // clients.cpf_cnpj → submissão
    expect(p.nome_fantasia).toBe("Armazém do Ferro");
  });

  it("NÃO leva chave vazia — pré-preencher com nada sobrescreveria com nada", () => {
    const p = preencherDoCliente({ ...cheio, cnpj: null, endereco_bairro: "  " });
    expect("cnpj" in p).toBe(false);
    expect("endereco_bairro" in p).toBe(false);
  });

  it("leva os documentos: cliente de um ano não reenvia contrato social", () => {
    const p = preencherDoCliente(cheio);
    expect(p.doc_contrato_social).toBe("docs/a.pdf");
    expect(p.doc_logo).toBe("logos/a.png");
  });
});
