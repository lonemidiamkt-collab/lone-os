// tests/ficha-documentos-item-a-item.test.ts — documentos legais na ficha, arquivo a arquivo
// (auditoria de erro recuperável, 21/10/2026, item 3.4).
//
// O que acontecia: o campo guarda "url\nurl" (várias páginas), mas a ficha tratava como um arquivo:
// "Visualizar" mandava as duas urls juntas e quebrava, "Substituir" deixava só o arquivo novo (as outras
// páginas sumiam da ficha) e não havia como remover só a página errada.

import { describe, it, expect } from "vitest";
import { listaDocs, adicionarDoc, removerDocDaLista } from "@/lib/onboarding/docs";
import { trocarDocNaLista, cabeMaisUmDoc, descreverDoc, rotuloDoc, LIMITE_CAMPO_DOC } from "@/lib/clients/documentos-legais";

const CLIENTE = "11111111-2222-3333-4444-555555555555";
const P1 = `legal://${CLIENTE}/contrato_social-1761055200000.pdf`;
const P2 = `legal://${CLIENTE}/contrato_social-1761058800000.jpg`;
const P3 = `legal://${CLIENTE}/contrato_social-1761062400000.png`;
const NOVA = `legal://${CLIENTE}/contrato_social-1761066000000.pdf`;
const tres = [P1, P2, P3].join("\n");

describe("trocar UMA página", () => {
  it("troca só a escolhida e mantém as outras no mesmo lugar (antes sumiam)", () => {
    expect(listaDocs(trocarDocNaLista(tres, P2, NOVA))).toEqual([P1, NOVA, P3]);
  });

  it("se a escolhida já não está lá, acrescenta em vez de perder o arquivo novo", () => {
    expect(listaDocs(trocarDocNaLista(P1, P2, NOVA))).toEqual([P1, NOVA]);
  });

  it("cadastro antigo com uma url só continua funcionando", () => {
    expect(trocarDocNaLista(P1, P1, NOVA)).toBe(NOVA);
  });
});

describe("remover e adicionar item a item", () => {
  it("remover tira só aquela; a última sai e o campo fica vazio (pendente)", () => {
    expect(listaDocs(removerDocDaLista(tres, P2))).toEqual([P1, P3]);
    expect(removerDocDaLista(P1, P1)).toBeNull();
  });

  it("cada item abre sozinho: a lista vira urls separadas, nunca as duas grudadas", () => {
    for (const url of listaDocs(tres)) expect(url).not.toContain("\n");
  });
});

describe("cabe mais um?", () => {
  it("confere antes de enviar — a rota de upload sobrescreve a coluna, então descobrir depois perderia as outras", () => {
    expect(cabeMaisUmDoc(tres, CLIENTE, "contrato_social")).toBe(true);
    let cheio = "";
    while (cabeMaisUmDoc(cheio, CLIENTE, "contrato_social")) cheio = adicionarDoc(cheio, NOVA);
    expect(cheio.length).toBeLessThanOrEqual(LIMITE_CAMPO_DOC);
    expect(adicionarDoc(cheio, NOVA).length).toBeGreaterThan(LIMITE_CAMPO_DOC);
  });
});

describe("cada arquivo diz o que é", () => {
  it("tipo, nome e data do envio saem do próprio nome do arquivo", () => {
    const d = descreverDoc(P1);
    expect(d).toMatchObject({ nome: "contrato_social-1761055200000.pdf", tipo: "pdf", rotuloTipo: "PDF", privado: true });
    expect(d.enviadoEm?.toISOString()).toBe("2025-10-21T14:00:00.000Z");
    expect(descreverDoc(P2)).toMatchObject({ tipo: "imagem", rotuloTipo: "Imagem JPG" });
  });

  it("url pública antiga, sem data no nome", () => {
    expect(descreverDoc("https://x.com/storage/v1/object/public/brand-assets/rg%20frente.jpeg?t=1")).toMatchObject({
      nome: "rg frente.jpeg", tipo: "imagem", enviadoEm: null, privado: false,
    });
  });

  it("rótulo diz a posição quando há mais de um", () => {
    expect(rotuloDoc(P2, 1, 3)).toMatch(/^Arquivo 2 de 3 · Imagem JPG · enviado em /);
    expect(rotuloDoc(P1, 0, 1)).toMatch(/^Arquivo · PDF/);
  });
});
