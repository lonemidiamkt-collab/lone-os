// tests/imagens-coladas.test.ts — colar imagem no campo de referência.
//
// O risco aqui não é falhar em pegar a imagem: é ROUBAR o Ctrl+V do resto do formulário. Se o
// helper devolvesse algo para texto, o briefing pararia de aceitar colar — e ninguém ligaria uma
// coisa na outra. Por isso metade dos testes é sobre o que ele IGNORA.

import { describe, it, expect } from "vitest";
import { imagensDoPaste } from "@/lib/upload/imagens-coladas";

const arquivo = (nome: string, tipo: string) =>
  new File([new Uint8Array([1, 2, 3])], nome, { type: tipo });

/** Imita o clipboard do navegador: `items` (print da tela) e `files` (arquivo copiado). */
const evento = (o: { items?: { kind: string; type: string; file?: File }[]; files?: File[] }) =>
  ({
    clipboardData: {
      items: (o.items ?? []).map((i) => ({ kind: i.kind, type: i.type, getAsFile: () => i.file ?? null })),
      files: o.files ?? [],
    },
  }) as unknown as React.ClipboardEvent;

describe("o que ele PEGA", () => {
  it("print da tela — vem como item, não como file", () => {
    const f = arquivo("image.png", "image/png");
    const r = imagensDoPaste(evento({ items: [{ kind: "file", type: "image/png", file: f }] }));
    expect(r).toHaveLength(1);
  });

  it("arquivo copiado do explorador — vem em files", () => {
    const r = imagensDoPaste(evento({ files: [arquivo("arte-final.jpg", "image/jpeg")] }));
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe("arte-final.jpg"); // nome bom se mantém
  });

  it("várias de uma vez", () => {
    const r = imagensDoPaste(evento({
      items: [
        { kind: "file", type: "image/png", file: arquivo("a.png", "image/png") },
        { kind: "file", type: "image/jpeg", file: arquivo("b.jpg", "image/jpeg") },
      ],
    }));
    expect(r).toHaveLength(2);
  });
});

describe("o que ele IGNORA (pra não roubar o Ctrl+V do formulário)", () => {
  it("texto colado não vira anexo", () => {
    expect(imagensDoPaste(evento({ items: [{ kind: "string", type: "text/plain" }] }))).toEqual([]);
  });

  it("PDF e vídeo ficam de fora — o campo é de referência visual", () => {
    expect(imagensDoPaste(evento({ files: [arquivo("contrato.pdf", "application/pdf")] }))).toEqual([]);
    expect(imagensDoPaste(evento({ files: [arquivo("v.mp4", "video/mp4")] }))).toEqual([]);
  });

  it("clipboard vazio não quebra", () => {
    expect(imagensDoPaste({ clipboardData: null } as unknown as React.ClipboardEvent)).toEqual([]);
    expect(imagensDoPaste({} as unknown as React.ClipboardEvent)).toEqual([]);
  });
});

describe("nome do print colado", () => {
  it("dois prints não ficam com o MESMO nome — senão o aviso de erro não diz qual falhou", () => {
    const ev = () => evento({ items: [{ kind: "file", type: "image/png", file: arquivo("image.png", "image/png") }] });
    const a = imagensDoPaste(ev())[0];
    const b = imagensDoPaste(ev())[0];
    expect(a.name).not.toBe("image.png");
    expect(a.name).not.toBe(b.name);
    expect(a.name).toMatch(/^colada-[a-z0-9]+\.png$/);
  });
});
