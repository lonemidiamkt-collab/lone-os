import { describe, it, expect } from "vitest";
import { escolherDesigner, avisoDeAtribuicao } from "@/lib/design/atribuicao";

// Números reais de 23/09/2026: 26 demandas sem dono nenhum, 23 delas do EDUMAR AUTO PEÇAS —
// cliente só de tráfego, sem designer na ficha, com demanda subindo até hoje. O Rodrigo fazia
// todas sem nunca vê-las no próprio quadro ("Thiago me avisa no pv que subiu").
const TIME = [
  { nome: "Rodrigo", abertas: 0 },
  { nome: "Gabriel Sodre", abertas: 3 },
];

describe("quem recebe a demanda", () => {
  it("a carteira do cliente manda, e nem olha o resto", () => {
    const e = escolherDesigner({ daCarteira: "Gabriel Sodre", disponiveis: TIME });
    expect(e).toEqual({ designer: "Gabriel Sodre", motivo: "carteira" });
  });

  it("espaço em branco na carteira não conta como dono", () => {
    expect(escolherDesigner({ daCarteira: "   ", disponiveis: TIME })?.motivo).toBe("carga");
  });

  it("sem carteira, vai pra quem já faz as artes desse cliente", () => {
    // O caso do Edumar: o Rodrigo já entregou 23; trocar o dono agora só confundiria.
    const e = escolherDesigner({
      daCarteira: null,
      historico: [{ designer: "Rodrigo", entregas: 23 }],
      disponiveis: [{ nome: "Rodrigo", abertas: 40 }, { nome: "Gabriel Sodre", abertas: 0 }],
    });
    expect(e).toEqual({ designer: "Rodrigo", motivo: "historico" });
  });

  it("sem carteira e sem histórico, vai pra quem tem menos demanda aberta", () => {
    expect(escolherDesigner({ disponiveis: TIME })).toEqual({ designer: "Rodrigo", motivo: "carga" });
  });

  it("histórico de quem não está mais no time não vale", () => {
    const e = escolherDesigner({
      historico: [{ designer: "Pedro Henrique", entregas: 8 }],
      disponiveis: TIME,
    });
    expect(e).toEqual({ designer: "Rodrigo", motivo: "carga" });
  });

  it("quem está de férias não recebe demanda nova", () => {
    const e = escolherDesigner({
      disponiveis: [
        { nome: "Rodrigo", abertas: 0, indisponivelAte: "2026-10-05T00:00:00Z" },
        { nome: "Gabriel Sodre", abertas: 9 },
      ],
      agora: new Date("2026-09-23T12:00:00Z"),
    });
    expect(e).toEqual({ designer: "Gabriel Sodre", motivo: "carga" });
  });

  it("férias vencida não segura ninguém", () => {
    const e = escolherDesigner({
      disponiveis: [{ nome: "Rodrigo", abertas: 0, indisponivelAte: "2026-09-01T00:00:00Z" }, { nome: "Gabriel Sodre", abertas: 9 }],
      agora: new Date("2026-09-23T12:00:00Z"),
    });
    expect(e?.designer).toBe("Rodrigo");
  });

  it("time inteiro de férias ainda assim recebe — órfã é pior", () => {
    const e = escolherDesigner({
      disponiveis: [
        { nome: "Rodrigo", abertas: 5, indisponivelAte: "2026-10-05T00:00:00Z" },
        { nome: "Gabriel Sodre", abertas: 2, indisponivelAte: "2026-10-05T00:00:00Z" },
      ],
      agora: new Date("2026-09-23T12:00:00Z"),
    });
    expect(e).toEqual({ designer: "Gabriel Sodre", motivo: "carga" });
  });

  it("empate de carga não sorteia: resolve pelo nome, sempre igual", () => {
    const disponiveis = [{ nome: "Rodrigo", abertas: 4 }, { nome: "Gabriel Sodre", abertas: 4 }];
    expect(escolherDesigner({ disponiveis })?.designer).toBe("Gabriel Sodre");
    expect(escolherDesigner({ disponiveis: [...disponiveis].reverse() })?.designer).toBe("Gabriel Sodre");
  });

  it("sem designer no time devolve null — não inventa dono", () => {
    expect(escolherDesigner({ disponiveis: [] })).toBeNull();
  });
});

describe("aviso pra quem criou", () => {
  it("cala a boca quando veio da carteira: é o caminho normal", () => {
    expect(avisoDeAtribuicao({ designer: "Rodrigo", motivo: "carteira" }, "Celmapel")).toBeNull();
  });

  it("diz pra qual quadro foi e por quê", () => {
    const t = avisoDeAtribuicao({ designer: "Rodrigo", motivo: "historico" }, "EDUMAR AUTO PEÇAS");
    expect(t).toContain("EDUMAR AUTO PEÇAS");
    expect(t).toContain("Rodrigo");
    expect(t).toContain("já faz as artes");
  });
});
