import { describe, it, expect } from "vitest";
import {
  paraPaginaPublica, lerAcessos, acessosDoRascunho, acessosParaFicha, statusDeAcesso, COLUNAS_SENHA,
} from "@/lib/onboarding/acessos";
import { fichaDoEnvio, observacaoDoCliente, COLUNAS_DO_ENVIO } from "@/lib/onboarding/envio";

// Cifra de mentira: o teste só precisa saber que a senha passou por ela.
const cifrar = (s: string) => `v1:fake:${s}`;

// O que o banco tinha antes de o cliente recarregar a página (auditoria 21/10/2026, 1.1).
const rascunhoGravado: Record<string, unknown> = {
  id: "sub-1", client_id: "cli-1", token: "ob-x", status: "pending",
  nome_fantasia: "Domino Araruama",
  meta_login: "loja@domino.com", meta_password: "v1:iv:tag:ct", meta_status: "fill_now",
  instagram_login: null, instagram_password: null, instagram_status: "waiting_client",
  google_login: null, google_password: null, google_status: "partner_invite",
};

/** O corpo que a página manda no auto_save, montado a partir do que ela restaurou. */
function corpoDaPaginaRestaurada(resposta: Record<string, unknown>) {
  const a = lerAcessos(resposta);
  return {
    metaLogin: a.meta.login, metaPassword: "", metaStatus: a.meta.status ?? "fill_now",
    instagramLogin: a.instagram.login, instagramPassword: "", instagramStatus: a.instagram.status ?? "fill_now",
    googleLogin: a.google.login, googlePassword: "", googleStatus: a.google.status ?? "fill_now",
  };
}

describe("GET público do cadastro — acessos voltam, senha não", () => {
  it("devolve login e status, e só 'senha já recebida' no lugar da senha", () => {
    const r = paraPaginaPublica(rascunhoGravado);
    expect(r.meta_login).toBe("loja@domino.com");
    expect(r.instagram_status).toBe("waiting_client");
    expect(r.senhas_recebidas).toEqual({ meta: true, instagram: false, google: false });
    for (const col of COLUNAS_SENHA) expect(r).not.toHaveProperty(col);
    expect(JSON.stringify(r)).not.toContain("v1:iv:tag:ct");
  });

  it("qualquer coluna de senha que entrar no select por engano também não sai", () => {
    const r = paraPaginaPublica({ ...rascunhoGravado, facebook_password: "abc", senha_extra: "x" });
    expect(Object.keys(r).filter((k) => /password/.test(k))).toEqual([]);
    expect(r).not.toHaveProperty("senha_extra");
  });

  it("a página lê o status conhecido; 'pending' (padrão antigo do envio) vira null", () => {
    expect(statusDeAcesso("partner_invite")).toBe("partner_invite");
    expect(statusDeAcesso("pending")).toBeNull();
    expect(statusDeAcesso(undefined)).toBeNull();
    const a = lerAcessos(paraPaginaPublica({ ...rascunhoGravado, meta_status: "pending" }));
    expect(a.meta).toEqual({ login: "loja@domino.com", status: null, senhaRecebida: true });
    expect(a.instagram).toEqual({ login: "", status: "waiting_client", senhaRecebida: false });
  });
});

describe("auto_save depois de recarregar não apaga os acessos (o bug de 21/10)", () => {
  it("recarregar → restaurar → salvar mantém login, 'Não tenho' e 'Convite', e não toca na senha", () => {
    const corpo = corpoDaPaginaRestaurada(paraPaginaPublica(rascunhoGravado));
    const patch = acessosDoRascunho(corpo, { restaurados: true, cifrar });
    const depois = { ...rascunhoGravado, ...patch };
    expect(depois.meta_login).toBe("loja@domino.com");
    expect(depois.meta_password).toBe("v1:iv:tag:ct");
    expect(depois.instagram_status).toBe("waiting_client");
    expect(depois.google_status).toBe("partner_invite");
    expect(patch).not.toHaveProperty("meta_password");
  });

  it("aba aberta numa versão antiga (não restaurou): campo vazio e 'Preencher' não sobrescrevem nada", () => {
    const corpoAntigo = {
      metaLogin: "", metaPassword: "", metaStatus: "fill_now",
      instagramLogin: "", instagramPassword: "", instagramStatus: "fill_now",
      googleLogin: "", googlePassword: "", googleStatus: "fill_now",
    };
    expect(acessosDoRascunho(corpoAntigo, { restaurados: false, cifrar })).toEqual({});
  });

  it("aba antiga ainda grava o que o cliente escolheu ou digitou", () => {
    const p = acessosDoRascunho({ metaLogin: " novo@loja.com ", instagramStatus: "waiting_client", googleStatus: "fill_now" },
      { restaurados: false, cifrar });
    expect(p).toEqual({ meta_login: "novo@loja.com", instagram_status: "waiting_client" });
  });

  it("com a página restaurada, apagar o login de propósito apaga", () => {
    const p = acessosDoRascunho({ metaLogin: "", metaStatus: "fill_now" }, { restaurados: true, cifrar });
    expect(p.meta_login).toBeNull();
    expect(p.meta_status).toBe("fill_now");
  });

  it("senha só quando digitada, e sempre cifrada", () => {
    const p = acessosDoRascunho({ metaPassword: "segredo", instagramPassword: "   ", googlePassword: "" }, { restaurados: true, cifrar });
    expect(p.meta_password).toBe("v1:fake:segredo");
    expect(p).not.toHaveProperty("instagram_password");
    expect(p).not.toHaveProperty("google_password");
  });

  it("status desconhecido não é gravado", () => {
    const p = acessosDoRascunho({ metaStatus: "pending", instagramStatus: "", googleStatus: "hack" }, { restaurados: true, cifrar });
    expect(p).not.toHaveProperty("meta_status");
    expect(p).not.toHaveProperty("instagram_status");
    expect(p).not.toHaveProperty("google_status");
  });
});

describe("envio final → ficha: só o preenchido, e as notas do time ficam (item 1.2)", () => {
  const envioSemAcessos: Record<string, unknown> = {
    nome_fantasia: "Domino Araruama", cnpj: "12.345.678/0001-90", contact_name: "João",
    contact_whatsapp: "(22) 99999-0000", contact_email: "Joao@Domino.com", endereco_rua: "Rua A, 1",
    endereco_bairro: "Centro", endereco_cidade: "Araruama", endereco_cep: "28970-000",
    doc_logo: "https://x/logo.png", doc_contrato_social: "legal://c.pdf",
    razao_social: "", contact_cpf: "", company_phone: null, contact_phone: "", endereco_estado: null, doc_identidade: null,
    meta_login: null, instagram_login: "", google_login: null,
    meta_password: null, instagram_password: null, google_password: null,
    notes: "Prefiro contato depois das 14h",
  };

  it("logins vazios no envio não apagam os logins que a equipe tinha na ficha", () => {
    const p = fichaDoEnvio(envioSemAcessos);
    for (const col of ["facebook_login", "instagram_login", "google_ads_login", "facebook_password", "instagram_password", "google_ads_password"]) {
      expect(p, col).not.toHaveProperty(col);
    }
  });

  it("`notes` (nota interna do time) nunca é gravado pela observação do cliente", () => {
    expect(fichaDoEnvio(envioSemAcessos)).not.toHaveProperty("notes");
  });

  it("opcionais em branco também não apagam a ficha", () => {
    const p = fichaDoEnvio(envioSemAcessos);
    for (const col of ["razao_social", "cpf_cnpj", "company_phone", "contact_phone", "endereco_estado", "doc_identidade"]) {
      expect(p, col).not.toHaveProperty(col);
    }
    expect(p).toMatchObject({ nome_fantasia: "Domino Araruama", phone: "(22) 99999-0000", email: "joao@domino.com", email_corporativo: "joao@domino.com" });
  });

  it("o que veio preenchido vai, com o nome de coluna da ficha", () => {
    const p = fichaDoEnvio({ ...envioSemAcessos, meta_login: " loja@domino.com ", google_login: "ads@domino.com", meta_password: "v1:iv:tag:ct" });
    expect(p).toMatchObject({ facebook_login: "loja@domino.com", google_ads_login: "ads@domino.com", facebook_password: "v1:iv:tag:ct" });
    expect(p).not.toHaveProperty("meta_login");
    expect(acessosParaFicha({ instagram_login: "@loja", instagram_password: "v1:a:b:c" }))
      .toEqual({ instagram_login: "@loja", instagram_password: "v1:a:b:c" });
  });

  it("a linha final lida no envio traz acessos e a observação", () => {
    const cols = COLUNAS_DO_ENVIO.split(", ");
    for (const c of ["meta_login", "meta_password", "google_login", "notes", "doc_logo", "receita_consultada_em"]) expect(cols).toContain(c);
  });
});

describe("observação do cliente para a equipe", () => {
  it("vazia vira null; espaços e quebras viram uma linha; texto longo é cortado", () => {
    expect(observacaoDoCliente("   ")).toBeNull();
    expect(observacaoDoCliente(null)).toBeNull();
    expect(observacaoDoCliente("  Ligar\n\ndepois das 14h ")).toBe("Ligar depois das 14h");
    const longa = observacaoDoCliente("a".repeat(800), 500)!;
    expect(longa.length).toBe(500);
    expect(longa.endsWith("…")).toBe(true);
  });
});
