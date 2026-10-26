// tests/regras-com-ok.test.ts — regra aprendida só vale com ok (26/10/2026, semana 1 do plano de agentes).

import { describe, it, expect } from "vitest";
import { separarNovas, novoCodigo, mesmaLicao } from "@/lib/cs/regras";
import {
  parseDecisaoLote, planejarLote, textoDoLote, textoResumoPropostas, type LinhaProposta,
} from "@/lib/cs/regras-propostas";

describe("o que vira proposta", () => {
  const r = (texto: string) => ({ texto, tipo: "visual" as const });

  it("não repete regra ativa nem proposta aberta (mesma lição escrita de outro jeito conta)", () => {
    const { novas, puladas } = separarNovas(
      [r("conferir o endereço na arte"), r("incluir o logo em toda arte"), r("não usar negrito")],
      ["Conferir o endereço", "não usar negrito"],
      5,
    );
    expect(novas.map((x) => x.texto)).toEqual(["incluir o logo em toda arte"]);
    expect(puladas).toBe(2);
  });

  it("respeita o teto do dia por fonte", () => {
    const { novas, puladas } = separarNovas([r("a1"), r("b2"), r("c3")], [], 2);
    expect(novas).toHaveLength(2);
    expect(puladas).toBe(1);
    expect(separarNovas([r("a1")], [], 0).novas).toHaveLength(0);
    expect(separarNovas([r("a1")], [], -3).novas).toHaveLength(0);
  });

  it("duas iguais na mesma rodada viram uma", () => {
    expect(separarNovas([r("sem emoji nas artes"), r("Sem emoji nas artes")], [], 5).novas).toHaveLength(1);
  });

  it("código novo nunca repete um que está em uso", () => {
    const usados = new Set(["a1b2"]);
    const sorteios = ["a1b2", "a1b2", "c3d4"];
    expect(novoCodigo(usados, () => sorteios.shift()!)).toBe("c3d4");
    expect(usados.has("c3d4")).toBe(true);
  });

  it("mesmaLicao: inclusão em qualquer sentido, sem diferença de caixa; vazio não casa", () => {
    expect(mesmaLicao("Conferir o endereço", "conferir o endereço na arte")).toBe(true);
    expect(mesmaLicao("usar azul", "não usar negrito")).toBe(false);
    expect(mesmaLicao("", "qualquer")).toBe(false);
  });
});

describe("decisão em lote no grupo", () => {
  it("vários códigos, com e sem vírgula", () => {
    expect(parseDecisaoLote("ok a1b2 c3d4")).toEqual({ acao: "confirmar", codigos: ["a1b2", "c3d4"], todas: false });
    expect(parseDecisaoLote("não a1b2, C3D4!")).toEqual({ acao: "descartar", codigos: ["a1b2", "c3d4"], todas: false });
    expect(parseDecisaoLote("salva a1b2 a1b2 c3d4")?.codigos).toEqual(["a1b2", "c3d4"]);
  });

  it("ok todas / tudo", () => {
    expect(parseDecisaoLote("ok todas")).toEqual({ acao: "confirmar", codigos: [], todas: true });
    expect(parseDecisaoLote("Ok, tudo.")).toBeNull(); // "ok," seguido de texto não é comando
    expect(parseDecisaoLote("ok tudo")?.todas).toBe(true);
  });

  it("um código só ou texto solto fica para o leitor de sempre", () => {
    expect(parseDecisaoLote("ok a1b2")).toBeNull();
    expect(parseDecisaoLote("ok")).toBeNull();
    expect(parseDecisaoLote("ok pode mandar a arte")).toBeNull();
    expect(parseDecisaoLote("okay a1b2 zzzz")).toBeNull();
  });

  const linha = (codigo: string, estado: string, cliente = "Império"): LinhaProposta =>
    ({ id: `id-${codigo}-${estado}`, codigo, texto: `regra ${codigo}`, estado, client_id: "c1", cliente });

  it("planeja: decide as abertas, conta as já decididas e diz o que não achou", () => {
    const p = planejarLote(["a1b2", "c3d4", "ffff"], [linha("a1b2", "proposta"), linha("c3d4", "ativa")]);
    expect(p.decidir.map((l) => l.codigo)).toEqual(["a1b2"]);
    expect(p.jaDecididas.map((l) => l.codigo)).toEqual(["c3d4"]);
    expect(p.naoAchados).toEqual(["ffff"]);
  });

  it("código repetido em duas linhas: vale a proposta aberta", () => {
    const p = planejarLote(["a1b2"], [linha("a1b2", "descartada"), linha("a1b2", "proposta")]);
    expect(p.decidir).toHaveLength(1);
    expect(p.decidir[0].estado).toBe("proposta");
  });

  it("resposta: o que foi salvo, o que já estava decidido e o que não achou", () => {
    const t = textoDoLote({ tipo: "decididas", acao: "confirmar", regras: [linha("a1b2", "proposta"), linha("c3d4", "proposta", "Reformar")], jaDecididas: 1, naoAchados: ["ffff"] });
    expect(t).toContain("✅ 2 regras salvas:");
    expect(t).toContain("• *Reformar*: _regra c3d4_");
    expect(t).toContain("1 já tinha sido decidida antes.");
    expect(t).toContain("Não achei: ffff.");
    expect(textoDoLote({ tipo: "decididas", acao: "descartar", regras: [linha("a1b2", "proposta")], jaDecididas: 0, naoAchados: [] }))
      .toContain("👍 Descartei 1 regra:");
  });
});

describe("o resumo de segunda", () => {
  it("agrupa por cliente, mostra a fonte e o código, e ensina a responder", () => {
    const t = textoResumoPropostas([
      { codigo: "a1b2", cliente: "Império", texto: "sem emoji nas artes", author: "IA (releitura do ciclo)" },
      { codigo: "c3d4", cliente: "Reformar", texto: "telefone em toda legenda", author: "IA (conversas)" },
      { codigo: "e5f6", cliente: "Império", texto: "usar a cor dourada da referência", author: "correção do Império" },
    ], 0);
    expect(t).toContain("(3)");
    expect(t.indexOf("*Império*")).toBeLessThan(t.indexOf("*Reformar*")); // quem tem mais vem primeiro
    expect(t).toContain("• _sem emoji nas artes_ (peça que voltou) — *a1b2*");
    expect(t).toContain("(conversa do grupo) — *c3d4*");
    expect(t).toContain("(correção) — *e5f6*");
    expect(t).toContain("*ok a1b2 c3d4*");
    expect(t).toContain("*ok todas*");
    expect(t).not.toContain("próximo resumo");
  });

  it("avisa quando sobrou para a semana seguinte", () => {
    expect(textoResumoPropostas([{ codigo: "a1b2", cliente: "X", texto: "y", author: null }], 7)).toContain("Mais 7 ficaram para o próximo resumo.");
  });
});
