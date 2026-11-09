// tests/drive-pasta-cliente.test.ts — as regras puras da pasta do cliente no Drive (lib/drive/pasta-cliente.ts).
//
// O que isto protege: duas cópias do mesmo documento, apagar arquivo que alguém pôs à mão, tirar acesso
// que o sistema não deu, dar acesso à conta dona ou a quem saiu da equipe, e erro do Google virando
// frase que ninguém sabe resolver.

import { describe, it, expect } from "vitest";
import {
  arquivosDoCadastro, planoDeDocumentos, chaveDoArquivo, extensaoDe, mimePorExtensao, nomeDaPasta, linkDaPasta,
  acessoDasFotos, acessoDaRaiz, planoDeAcessos, concedidosDepois, fraseDoErroDoGoogle,
  mensagemPastaCriada, mensagemPastaFalhou, type MembroEquipe,
} from "@/lib/drive/pasta-cliente";
import { resolveRef } from "@/lib/storage/ref";

const ID = "9465f845-0c5c-4f27-b787-507bfcb2cbca";

describe("documentos do cadastro", () => {
  it("dá nome legível a cada arquivo e numera quando o campo tem vários", () => {
    const a = arquivosDoCadastro({
      doc_contrato_social: `legal://${ID}/contrato_social-1793754669756.jpg\nlegal://${ID}/contrato_social-1793754669999.pdf`,
      doc_identidade: `legal://${ID}/identidade-1793754688567.jpg`,
      doc_logo: `https://painel.lonemidia.com/supabase/storage/v1/object/public/brand-assets/${ID}/logo-1793739034828.jpg`,
    });
    expect(a.map((x) => x.nome)).toEqual(["Contrato social 1.jpg", "Contrato social 2.pdf", "Documento de identidade.jpg", "Logo.jpg"]);
    expect(new Set(a.map((x) => x.chave)).size).toBe(4);
  });

  it("campo vazio não vira arquivo, e a mesma referência em dois campos entra uma vez", () => {
    const ref = `legal://${ID}/identidade-1.jpg`;
    expect(arquivosDoCadastro({ doc_contrato_social: null, doc_identidade: "", doc_logo: undefined })).toEqual([]);
    expect(arquivosDoCadastro({ doc_contrato_social: ref, doc_identidade: ref })).toHaveLength(1);
  });

  it("manda só o que falta, tira o que saiu da ficha e a cópia repetida — nunca o que foi posto à mão", () => {
    const [contrato, rg] = arquivosDoCadastro({ doc_contrato_social: "legal://x/c-1.pdf", doc_identidade: "legal://x/i-1.jpg" });
    const plano = planoDeDocumentos([contrato, rg], [
      { id: "a", chave: contrato.chave },
      { id: "b", chave: contrato.chave },          // cópia repetida (duas sincronias juntas)
      { id: "c", chave: chaveDoArquivo("legal://x/i-ANTIGO.jpg") }, // RG trocado: sai
      { id: "d", chave: null },                    // posto à mão: fica
    ]);
    expect(plano.enviar.map((x) => x.nome)).toEqual(["Documento de identidade.jpg"]);
    expect(plano.remover.sort()).toEqual(["b", "c"]);
  });

  it("extensão e tipo do arquivo pela referência", () => {
    expect(extensaoDe("legal://a/b-123.PDF")).toBe("pdf");
    expect(extensaoDe("https://x/y/logo.png?token=abc")).toBe("png");
    expect(extensaoDe("legal://a/sem-extensao")).toBe("");
    expect(mimePorExtensao("jpeg")).toBe("image/jpeg");
    expect(mimePorExtensao("xyz")).toBe("application/octet-stream");
  });

  it("acha o arquivo no Storage pela mesma regra do link assinado", () => {
    expect(resolveRef(`legal://${ID}/identidade-1.jpg`)).toEqual({ bucket: "legal-docs", path: `${ID}/identidade-1.jpg` });
    expect(resolveRef(`https://painel.lonemidia.com/supabase/storage/v1/object/public/brand-assets/${ID}/logo-1.jpg?v=2`))
      .toEqual({ bucket: "brand-assets", path: `${ID}/logo-1.jpg` });
  });
});

describe("nome e link da pasta", () => {
  it("usa o nome fantasia, sem espaço sobrando", () => {
    expect(nomeDaPasta({ name: "SANTIAGO LOCACOES", nome_fantasia: "  Mestre   da Obra " })).toBe("Mestre da Obra");
    expect(nomeDaPasta({ name: "Gk Pneus", nome_fantasia: null })).toBe("Gk Pneus");
    expect(nomeDaPasta({})).toBe("Cliente sem nome");
  });
  it("link só quando há pasta", () => {
    expect(linkDaPasta("abc")).toBe("https://drive.google.com/drive/folders/abc");
    expect(linkDaPasta(null)).toBeNull();
  });
});

const EQUIPE: MembroEquipe[] = [
  { name: "Roberto Lino", email: "lonemidiamkt@gmail.com", role: "admin" },
  { name: "Lucas Bueno", email: "Lucas@lonemidia.com", role: "admin" },
  { name: "Carlos Augusto", email: "carlos@lonemidia.com", role: "social" },
  { name: "Thiago", email: "thiago@lonemidia.com", role: "social" },
  { name: "Gabriel Sodre", email: "jgabriel.sodre.santos@gmail.com", role: "designer" },
  { name: "Maria Luiza", email: "marialuiza@lonemidia.com", role: "comercial", is_active: false, deleted_at: "2026-10-01" },
  { name: "Ex Admin", email: "ex@lonemidia.com", role: "admin", is_active: false },
];
const DONO = "lonemidiamkt@gmail.com";

describe("quem acessa", () => {
  it("Fotos e Vídeos: o social e o designer do cliente, pelo nome (sem acento e caixa)", () => {
    const r = acessoDasFotos({ assigned_social: "carlos augusto", assigned_designer: "Gabriel Sodré" }, EQUIPE, DONO);
    expect(r.emails).toEqual(["carlos@lonemidia.com", "jgabriel.sodre.santos@gmail.com"]);
    expect(r.semEmail).toEqual([]);
  });

  it("nome que não acha ninguém ativo vira aviso; a conta dona não entra; repetido entra uma vez", () => {
    const r = acessoDasFotos({ assigned_social: "Maria Luiza", assigned_designer: "Fulano" }, EQUIPE, DONO);
    expect(r.emails).toEqual([]);
    expect(r.semEmail).toEqual(["Maria Luiza", "Fulano"]);
    expect(acessoDasFotos({ assigned_social: "Roberto Lino" }, EQUIPE, DONO).emails).toEqual([]);
    expect(acessoDasFotos({ assigned_social: "Thiago", assigned_designer: "Thiago" }, EQUIPE, DONO).emails).toEqual(["thiago@lonemidia.com"]);
    expect(acessoDasFotos({ assigned_social: "", assigned_designer: null }, EQUIPE, DONO)).toEqual({ emails: [], pessoas: [], semEmail: [] });
  });

  it("pasta de cima (com Documentos): admins ativos, menos a conta dona", () => {
    expect(acessoDaRaiz(EQUIPE, DONO)).toEqual(["lucas@lonemidia.com"]);
  });

  it("dá a quem falta e tira só o que o sistema deu", () => {
    const plano = planoDeAcessos(
      ["thiago@lonemidia.com", "jgabriel.sodre.santos@gmail.com"], // social trocou de Carlos para Thiago
      ["carlos@lonemidia.com", "jgabriel.sodre.santos@gmail.com"],
      [
        { id: "p1", email: "carlos@lonemidia.com" },
        { id: "p2", email: "jgabriel.sodre.santos@gmail.com" },
        { id: "p3", email: "cliente@gmail.com" }, // compartilhado à mão: fica
      ],
    );
    expect(plano.adicionar).toEqual(["thiago@lonemidia.com"]);
    expect(plano.remover).toEqual([{ id: "p1", email: "carlos@lonemidia.com" }]);
  });

  it("quem já tinha acesso à mão antes de virar social não fica registrado como dado pelo sistema", () => {
    const atuais = [{ email: "thiago@lonemidia.com" }, { email: "carlos@lonemidia.com" }];
    const plano = planoDeAcessos(["thiago@lonemidia.com"], [], atuais.map((a, i) => ({ id: String(i), ...a })));
    expect(plano.adicionar).toEqual([]);
    expect(concedidosDepois([], atuais, plano.adicionar, [])).toEqual([]);
    expect(concedidosDepois(["carlos@lonemidia.com"], [{ email: "carlos@lonemidia.com" }], ["thiago@lonemidia.com"], ["carlos@lonemidia.com"]))
      .toEqual(["thiago@lonemidia.com"]);
  });
});

describe("erros do Google em frase de quem resolve", () => {
  it("sem o Drive liberado manda reconectar no Comercial", () => {
    const f = fraseDoErroDoGoogle({ status: 403, motivo: "insufficientPermissions ACCESS_TOKEN_SCOPE_INSUFFICIENT", mensagem: "Request had insufficient authentication scopes." });
    expect(f).toContain("Reconectar Google");
    expect(f).toContain("Sistema › Integrações");
  });
  it("API desligada, sem conexão, cota, instabilidade", () => {
    const desligada = fraseDoErroDoGoogle({ status: 403, motivo: "accessNotConfigured SERVICE_DISABLED", mensagem: "Google Drive API has not been used in project 922295894505 before or it is disabled." });
    expect(desligada).toContain("Google Drive API");
    expect(desligada).toContain("drive.googleapis.com?project=922295894505");
    expect(fraseDoErroDoGoogle({ motivo: "sem_token" })).toContain("não está conectado");
    expect(fraseDoErroDoGoogle({ status: 429, motivo: "userRateLimitExceeded" })).toContain("esperar");
    expect(fraseDoErroDoGoogle({ status: 503 })).toContain("não respondeu");
    expect(fraseDoErroDoGoogle({ motivo: "rede", mensagem: "fetch failed" })).toContain("não respondeu");
    expect(fraseDoErroDoGoogle({ status: 400, mensagem: "Invalid field" })).toBe("O Google Drive recusou: Invalid field");
  });
});

describe("mensagens do grupo de cadastro", () => {
  it("pasta criada traz os dois links, quem edita, e lembra que senha não vai para o Drive", () => {
    const m = mensagemPastaCriada({ cliente: "JP Beauty", fotos: "https://f", documentos: "https://d", quemEdita: ["Thiago"], documentosCopiados: 3, avisos: ["Logo não copiado"] });
    expect(m).toContain("https://f");
    expect(m).toContain("https://d");
    expect(m).toContain("editam: Thiago");
    expect(m).toContain("3 arquivos do cadastro");
    expect(m).toContain("cofre do Lone OS");
    expect(m).toContain("⚠️ Logo não copiado");
  });
  it("falha diz o motivo e onde tentar de novo", () => {
    const m = mensagemPastaFalhou({ cliente: "X", motivo: "Falta liberar o Drive", linkFicha: "https://painel/clients/1?tab=marca" });
    expect(m.split("\n")[1]).toBe("Falta liberar o Drive");
    expect(m).toContain("Marca & Briefing › Pasta do Drive");
    expect(m).toContain("https://painel/clients/1?tab=marca");
  });
});
