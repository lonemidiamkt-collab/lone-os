// O que entra numa entrega de arte (lib/conteudo/entrega-anexos.ts) — auditoria de erro recuperável
// 21/10/2026, item 2.1: o "Entregar arte" mandava TODOS os anexos, inclusive a referência do social
// e a versão anterior, e o banco marcava tudo como entrega.
import { describe, it, expect } from "vitest";
import { bloqueioDoFoco, faltaParaEntregar, planejarEntrega, resumoDaEntrega, versaoAnteriorParaTirar, type AnexoParaEntrega } from "@/lib/conteudo/entrega-anexos";

const ref: AnexoParaEntrega = { id: "ref1", tipo: "referencia", delivery_id: null };
const v1a: AnexoParaEntrega = { id: "v1a", tipo: "entrega", delivery_id: "d1" };
const v1b: AnexoParaEntrega = { id: "v1b", tipo: "entrega", delivery_id: "d1" };
const nova: AnexoParaEntrega = { id: "nova", tipo: "entrega", delivery_id: null };
const legado: AnexoParaEntrega = { id: "leg", tipo: null };

describe("planejarEntrega", () => {
  it("o erro original: referência do social NUNCA vai na entrega", () => {
    const p = planejarEntrega([ref, nova], { substituirAnterior: true });
    expect(p.entregar).toEqual(["nova"]);
    expect(p.entregar).not.toContain("ref1");
    expect(p.referencias).toBe(1);
  });

  it("na troca de versão vai só a nova, e a anterior sai do card (como no Modo foco)", () => {
    const p = planejarEntrega([ref, v1a, v1b, nova], { substituirAnterior: true });
    expect(p.entregar).toEqual(["nova"]);
    expect(p.remover).toEqual(["v1a", "v1b"]);
    expect(p.anteriores).toBe(2);
    expect(p.repeteAnterior).toBe(false);
  });

  it("sem substituir: a anterior fica no card, mas não entra na entrega nova", () => {
    const p = planejarEntrega([v1a, nova], { substituirAnterior: false });
    expect(p.entregar).toEqual(["nova"]);
    expect(p.remover).toEqual([]);
  });

  it("sem arte nova, a entrega repete a versão anterior — e diz isso", () => {
    const p = planejarEntrega([ref, v1a, v1b], { substituirAnterior: true });
    expect(p.entregar).toEqual(["v1a", "v1b"]);
    expect(p.remover).toEqual([]);
    expect(p.repeteAnterior).toBe(true);
    expect(resumoDaEntrega(p)[0]).toMatch(/de novo a versão anterior/);
  });

  it("anexo sem classificação não vai por palpite; a tela diz como resolver", () => {
    const p = planejarEntrega([ref, legado], { substituirAnterior: true });
    expect(p.entregar).toEqual([]);
    expect(p.semClassificacao).toBe(1);
    expect(faltaParaEntregar(p)).toMatch(/sem classificação/);
    // com o link colado dá pra entregar mesmo assim
    expect(faltaParaEntregar(p, "https://drive.google.com/x")).toBeNull();
  });

  it("card só com referência: não entrega e explica (antes a referência virava a entrega)", () => {
    const p = planejarEntrega([ref], { substituirAnterior: true });
    expect(p.entregar).toEqual([]);
    expect(faltaParaEntregar(p)).toMatch(/só tem referência/);
  });

  it("ignora a capa legada (id 'legacy')", () => {
    const p = planejarEntrega([{ id: "legacy", tipo: null }, nova], { substituirAnterior: true });
    expect(p.entregar).toEqual(["nova"]);
    expect(p.semClassificacao).toBe(0);
  });

  it("o resumo diz o que vai, o que sai do card e o que fica de fora", () => {
    const linhas = resumoDaEntrega(planejarEntrega([ref, v1a, nova], { substituirAnterior: true }));
    expect(linhas.join(" ")).toMatch(/1 arte nova/);
    expect(linhas.join(" ")).toMatch(/versão anterior \(1 arte\) sai do card/);
    expect(linhas.join(" ")).toMatch(/1 referência do social fica de fora/);
  });
});

describe("Modo foco: substituir a versão anterior (2.13)", () => {
  it("lista que não carregou bloqueia a entrega com o erro (antes virava lista vazia e as duas versões iam ao cliente)", () => {
    expect(bloqueioDoFoco({ carregando: false, erro: "O painel está reiniciando." })).toMatch(/^Não consegui carregar as artes que já estão no card \(O painel está reiniciando\.\)/);
    expect(bloqueioDoFoco({ carregando: true, erro: null })).toMatch(/Carregando/);
    expect(bloqueioDoFoco({ carregando: false, erro: null })).toBeNull();
  });
  it("tira só a entrega anterior — nunca a referência nem as artes novas", () => {
    expect(versaoAnteriorParaTirar([ref, v1a, v1b, nova], ["nova"], true)).toEqual(["v1a", "v1b"]);
    expect(versaoAnteriorParaTirar([ref, v1a, nova], ["nova"], false)).toEqual([]);
  });
});
