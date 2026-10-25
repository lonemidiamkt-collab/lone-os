// Limites de arte/referência ditos ANTES e falha parcial dita como é (lib/upload/limites-arte.ts).
// Auditoria de erro recuperável, 24/10/2026 — itens 2.7 (anexar arte) e 2.15 (novo conteúdo).
import { describe, it, expect } from "vitest";
import {
  MAX_ARTES_POR_CARD, TEXTO_DO_LIMITE, frasesDeRecusa, problemaDoArquivo, resumoDasReferencias,
  resumoDoUploadParcial, separarArquivos,
} from "@/lib/upload/limites-arte";

const MB = 1024 * 1024;
const arq = (name: string, type = "image/png", size = 2 * MB) => ({ name, type, size });

describe("o arquivo é conferido na hora em que é escolhido", () => {
  it("print de 14 MB: diz o tamanho e o limite (antes só falhava depois de criar a demanda)", () => {
    expect(problemaDoArquivo(arq("print.png", "image/png", 14 * MB))).toBe('"print.png" tem 14,0 MB — o limite é 10 MB. Exporte menor (JPEG costuma resolver).');
  });
  it("formato fora (HEIC do iPhone, PDF): diz quais formatos servem", () => {
    expect(problemaDoArquivo(arq("foto.heic", "image/heic"))).toMatch(/não é PNG, JPEG, WebP ou GIF/);
    expect(problemaDoArquivo(arq("cartao.pdf", "application/pdf"))).toMatch(/não é PNG/);
  });
  it("arquivo vazio e arquivo bom", () => {
    expect(problemaDoArquivo(arq("x.png", "image/png", 0))).toMatch(/está vazio/);
    expect(problemaDoArquivo(arq("ok.jpg", "image/jpeg"))).toBeNull();
  });
  it("o limite fica escrito na tela", () => {
    expect(TEXTO_DO_LIMITE).toBe("PNG, JPEG, WebP ou GIF · até 10 MB cada · até 20 por card");
  });
});

describe("separar o que sobe do que não sobe", () => {
  it("um arquivo ruim não derruba o lote: os bons seguem, o ruim volta com o motivo", () => {
    const r = separarArquivos([arq("a.png"), arq("grande.png", "image/png", 11 * MB), arq("b.webp", "image/webp")]);
    expect(r.aceitos.map((f) => f.name)).toEqual(["a.png", "b.webp"]);
    expect(r.recusados).toHaveLength(1);
    expect(r.recusados[0].motivo).toMatch(/grande\.png/);
  });
  it("respeita o teto do card contando o que já está lá", () => {
    const r = separarArquivos([arq("1.png"), arq("2.png"), arq("3.png")], MAX_ARTES_POR_CARD - 2);
    expect(r.aceitos.map((f) => f.name)).toEqual(["1.png", "2.png"]);
    expect(r.recusados[0].motivo).toBe(`"3.png" passa do limite de ${MAX_ARTES_POR_CARD} artes por card.`);
  });
  it("frase de recusa: até 3 motivos e o resto contado", () => {
    expect(frasesDeRecusa([])).toBeNull();
    const muitos = Array.from({ length: 5 }, (_, i) => ({ motivo: `m${i}.` }));
    expect(frasesDeRecusa(muitos)).toBe("m0. m1. m2. E mais 2 arquivos com problema.");
  });
});

describe("upload que falha no meio (2.7)", () => {
  const nomes = ["a.png", "b.png", "c.png", "d.png", "e.png"];
  it("2 de 5 subiram: diz que estão no card e quais faltam — para não mandar as 5 de novo", () => {
    expect(resumoDoUploadParcial({ nomes, subiram: 2, erro: "Falha no upload: timeout." }))
      .toBe('Subiram 2 de 5 artes (já estão no card). Não subiram: "c.png", "d.png", "e.png" — Falha no upload: timeout. Mande de novo só essas.');
  });
  it("nenhuma subiu / uma só", () => {
    expect(resumoDoUploadParcial({ nomes, subiram: 0, erro: "Sem conexão com o servidor. Tenta de novo?" })).toBe("Nenhuma das 5 artes subiu: Sem conexão com o servidor. Tenta de novo?");
    expect(resumoDoUploadParcial({ nomes: ["a.png"], subiram: 0, erro: "Arquivo grande demais" })).toBe("A arte não subiu: Arquivo grande demais. Tente de novo.");
  });
  it("número fora da faixa (lista recarregada com arte de outra pessoa) não vira frase absurda", () => {
    expect(resumoDoUploadParcial({ nomes: ["a.png", "b.png"], subiram: 7, erro: "x" })).toMatch(/^Subiram 2 de 2/);
  });
});

describe("novo conteúdo: referência que não subiu (2.15)", () => {
  it("diz que a demanda já existe e que o reenvio manda só o que falhou", () => {
    const t = resumoDasReferencias({ titulo: "SEX 26 — promoção", total: 3, falhas: [{ nome: "print.png", erro: "Arquivo grande demais." }] })!;
    expect(t).toMatch(/^A demanda "SEX 26 — promoção" já foi criada\. 2 de 3 referências subiram; não subiu: "print\.png" \(Arquivo grande demais\)\./);
    expect(t).toMatch(/não cria outro card/);
  });
  it("tudo subiu: nada a dizer", () => {
    expect(resumoDasReferencias({ titulo: "x", total: 2, falhas: [] })).toBeNull();
  });
});
