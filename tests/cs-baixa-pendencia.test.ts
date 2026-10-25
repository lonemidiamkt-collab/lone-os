// tests/cs-baixa-pendencia.test.ts — "Lone, o X já mandou as fotos" tira SÓ a pendência das fotos
// (auditoria 25/10/2026, 11.11).
//
// O erro original: qualquer palavra de 4+ letras casava ("mandou", o nome do cliente…) e várias
// pendências saíam de uma vez, sem perguntar; o upsert não era conferido ("✅ Baixa dada" mesmo sem
// gravar); a leitura que falhava virava "não tem pendência 👍"; e não havia volta.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { devolverPendencias, escolherPendencia, textoBaixaDada, textoQualPendencia } from "@/lib/cs/baixa-pendencia";

const RAIZ = path.resolve(__dirname, "..");
const PEND = [
  { item: "fotos da loja nova", desde: "2026-10-01" },
  { item: "logo em alta resolução" },
  { item: "senha do Instagram" },
];

describe("qual pendência sai", () => {
  it("a que a mensagem nomeia", () => {
    expect(escolherPendencia("Lone, o Bazar já mandou as fotos", PEND, "Bazar Ribeiro")).toEqual({ tipo: "uma", pendencia: PEND[0] });
    expect(escolherPendencia("Lone, chegou a senha do instagram do Bazar, tira a pendência", PEND, "Bazar Ribeiro")).toEqual({ tipo: "uma", pendencia: PEND[2] });
  });

  it("o erro original: palavra do comando ou do nome do cliente não tira pendência", () => {
    const pend = [{ item: "Bazar mandou o contrato?" }, { item: "aprovar a arte da promoção" }];
    // "mandou" e "Bazar" estão na mensagem e na 1ª pendência — mas não dizem O QUE foi entregue.
    expect(escolherPendencia("Lone, o Bazar já mandou as pendências", pend, "Bazar")).toEqual({ tipo: "nenhuma" });
  });

  it("duas empatadas: pergunta qual, não tira as duas", () => {
    const pend = [{ item: "fotos da fachada" }, { item: "fotos do estoque" }];
    const r = escolherPendencia("Lone, o Bazar já mandou as fotos", pend, "Bazar");
    expect(r.tipo).toBe("varias");
    if (r.tipo === "varias") expect(r.candidatas).toHaveLength(2);
    expect(textoQualPendencia("Bazar", r.tipo === "varias" ? r.candidatas : [], pend)).toMatch(/Qual pendência do \*Bazar\*/);
  });

  it("a mais específica ganha do empate", () => {
    const pend = [{ item: "fotos da fachada" }, { item: "fotos do estoque" }];
    expect(escolherPendencia("Lone, o Bazar mandou as fotos do estoque", pend, "Bazar")).toEqual({ tipo: "uma", pendencia: pend[1] });
  });

  it("'todas' tira todas; uma pendência só e nenhuma palavra dela: é essa", () => {
    expect(escolherPendencia("Lone, o Bazar já mandou todas as pendências", PEND, "Bazar")).toEqual({ tipo: "todas" });
    expect(escolherPendencia("Lone, o Bazar resolveu a pendência", [PEND[1]], "Bazar")).toEqual({ tipo: "uma", pendencia: PEND[1] });
  });
});

describe("tem volta", () => {
  it("a confirmação diz como desfazer", () => {
    expect(textoBaixaDada("Bazar", [PEND[0]], PEND.slice(1))).toMatch(/desfaz\* citando esta mensagem/);
  });

  it("desfazer devolve o que saiu, sem duplicar o que alguém já pôs de volta", () => {
    expect(devolverPendencias(PEND.slice(1), [PEND[0]])).toEqual([...PEND.slice(1), PEND[0]]);
    expect(devolverPendencias(PEND, [PEND[0]])).toEqual(PEND);
  });
});

describe("no inbound", () => {
  const inbound = readFileSync(path.join(RAIZ, "app/api/cs/inbound/route.ts"), "utf8");
  it("leitura e gravação conferidas", () => {
    expect(inbound).toContain("if (errJr)");
    expect(inbound).toContain("if (errBaixa)");
    expect(inbound).not.toContain("✅ Baixa dada em: ${baixar");
  });
});
