// tests/onboarding-acessos-par.test.ts — 24/10/2026, auditoria de erro recuperável, item 1.6.
// O cliente digitava só o login, a Revisão dizia "Preenchido" e o time recebia login sem senha.

import { describe, it, expect } from "vitest";
import { faltaNoAcesso, faltasNosAcessosDoEnvio, fraseDaFalta } from "@/lib/onboarding/acessos";
import { faltandoNaEtapa, destinoPermitido } from "@/lib/onboarding/etapas";

describe("login e senha andam em par", () => {
  it("login sem senha falta a senha; senha sem login falta o login", () => {
    expect(faltaNoAcesso({ status: "fill_now", login: "loja@x.com", senha: "", senhaRecebida: false })).toBe("senha");
    expect(faltaNoAcesso({ status: "fill_now", login: "", senha: "abc123", senhaRecebida: false })).toBe("login");
  });
  it("par completo, ou senha que já chegou antes, fecha", () => {
    expect(faltaNoAcesso({ status: "fill_now", login: "loja@x.com", senha: "abc123", senhaRecebida: false })).toBeNull();
    expect(faltaNoAcesso({ status: "fill_now", login: "loja@x.com", senha: "", senhaRecebida: true })).toBeNull();
  });
  it("'Não tenho' e 'Convite' não exigem nada; acesso todo em branco não trava", () => {
    expect(faltaNoAcesso({ status: "waiting_client", login: "loja@x.com", senha: "", senhaRecebida: false })).toBeNull();
    expect(faltaNoAcesso({ status: "partner_invite", login: "", senha: "x", senhaRecebida: false })).toBeNull();
    expect(faltaNoAcesso({ status: "fill_now", login: "  ", senha: "", senhaRecebida: false })).toBeNull();
  });
  it("frase para a Revisão e para o servidor", () => {
    expect(fraseDaFalta("Instagram", "senha")).toBe("Instagram: falta a senha");
    expect(fraseDaFalta("Instagram", "login")).toBe("Instagram: falta o login");
  });
});

describe("a etapa Acessos não deixa passar o par pela metade", () => {
  it("o Próximo para e diz o que falta", () => {
    expect(faltandoNaEtapa("acessos", { senhaInstagram: true })).toEqual(["senha do Instagram"]);
    expect(faltandoNaEtapa("acessos", { loginMeta: true, senhaGoogle: true })).toEqual(["login do Facebook / Meta", "senha do Google Ads / Gmail"]);
  });
  it("a aba do topo não pula para a Revisão", () => {
    expect(destinoPermitido("acessos", "review", { senhaInstagram: true })).toBe("acessos");
    expect(destinoPermitido("dados", "review", { senhaInstagram: true })).toBe("acessos");
  });
  it("o número do endereço (obrigatório na tela) também é conferido na etapa Dados", () => {
    expect(faltandoNaEtapa("dados", { enderecoNumero: true })).toEqual(["Número do endereço"]);
  });
});

describe("o envio no servidor confere de novo (aba antiga)", () => {
  const linhaVazia = {};
  it("login sem senha no corpo e sem senha guardada → recusa com a frase", () => {
    expect(faltasNosAcessosDoEnvio({ instagramLogin: "loja", instagramStatus: "fill_now" }, linhaVazia, true))
      .toEqual(["Instagram: falta a senha"]);
  });
  it("senha guardada antes (rascunho) completa o par", () => {
    expect(faltasNosAcessosDoEnvio({ instagramLogin: "loja", instagramStatus: "fill_now" }, { instagram_password: "v1:..." }, true)).toEqual([]);
  });
  it("aba antiga (sem restaurar): login vazio usa o guardado, e 'Preencher' não sobrescreve 'Não tenho'", () => {
    expect(faltasNosAcessosDoEnvio({ metaStatus: "fill_now" }, { meta_login: "a@b.com", meta_status: "waiting_client" }, false)).toEqual([]);
    expect(faltasNosAcessosDoEnvio({ metaStatus: "fill_now" }, { meta_login: "a@b.com" }, false)).toEqual(["Facebook / Meta: falta a senha"]);
  });
  it("tudo em branco ou 'Não tenho' passa", () => {
    expect(faltasNosAcessosDoEnvio({ metaStatus: "fill_now", instagramStatus: "waiting_client", googleStatus: "partner_invite" }, linhaVazia, true)).toEqual([]);
  });
});
