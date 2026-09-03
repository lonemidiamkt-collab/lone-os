import { describe, it, expect } from "vitest";
import { manchetePanorama, bomDiaPessoaPdfHtml, legendaBomDia, type BlocoDia } from "@/lib/reports/bomDiaPdf";

// Roberto (03/09): "continua mandando textões, já falei sobre a estrutura de pdfs". O bom-dia
// tinha 2.314 caracteres em 45 linhas. Os números abaixo são os do print que ele mandou.

describe("a manchete cabe em quatro linhas", () => {
  const m = manchetePanorama({
    data: "quinta, 03/09", esperandoOk: 28, emProducao: 3, artesProntas: 39,
    semPostPlanejado: 42, esfriando: 2, encalhados: 11,
  });

  it("é curta — o textão tinha 45 linhas", () => {
    expect(m.split("\n").length).toBeLessThanOrEqual(5);
    expect(m.length).toBeLessThan(300);
  });

  it("mantém os números que o gestor precisa de manhã", () => {
    for (const n of ["28", "39", "42", "11"]) expect(m).toContain(n);
  });

  it("NÃO traz a lista de ninguém — isso vai no PDF", () => {
    expect(m).not.toMatch(/Mr\.distribuidora|Carlos|Thiago|👤/);
    expect(m).toMatch(/em PDF abaixo/);
  });

  it("dia limpo não vira mensagem vazia", () => {
    const vazio = manchetePanorama({
      data: "quinta, 03/09", esperandoOk: 0, emProducao: 0, artesProntas: 0,
      semPostPlanejado: 0, esfriando: 0, encalhados: 0,
    });
    expect(vazio).toMatch(/dia limpo/i);
  });
});

describe("o PDF de cada pessoa", () => {
  const bloco: BlocoDia = {
    pessoa: "Carlos Augusto",
    itens: [
      { cliente: "Mr.distribuidora MDF", acao: "confirmar e postar a arte", dias: 49 },
      { cliente: "Bruno Tintas Araruama", acao: "postar", dias: 17 },
      { cliente: "Império Material de Construção", acao: "postar", dias: 16 },
      { cliente: "WT Shopping", acao: "mandar pro cliente", dias: 0 },
    ],
    resto: 3,
  };
  const html = bomDiaPessoaPdfHtml(bloco, "", "2026-09-03");

  it("traz o nome no título", () => {
    expect(html).toContain("Carlos Augusto, seu dia");
  });

  it("ordena do mais antigo para o mais novo", () => {
    const iMr = html.indexOf("Mr.distribuidora");
    const iWt = html.indexOf("WT Shopping");
    expect(iMr).toBeLessThan(iWt);
  });

  it("conta quantos passam de uma semana", () => {
    expect(html).toMatch(/3 passando de uma semana/);
  });

  it("mostra a ação, não só o cliente", () => {
    expect(html).toContain("confirmar e postar a arte");
  });

  it("diz quantos ficaram fora da lista", () => {
    expect(html).toMatch(/mais 3 de menor urgência/);
  });

  it("escapa caractere perigoso", () => {
    const x = bomDiaPessoaPdfHtml({ pessoa: "A", itens: [{ cliente: "B & <b>", acao: "postar", dias: 1 }] }, "", "2026-09-03");
    expect(x).toContain("B &amp; &lt;b&gt;");
  });
});

describe("a legenda no grupo", () => {
  it("marca a pessoa e aponta o pior caso", () => {
    const l = legendaBomDia({
      pessoa: "Carlos", resto: 2,
      itens: [{ cliente: "Mr.distribuidora MDF", acao: "postar", dias: 49 }],
    }, "@5522988193773");
    expect(l).toContain("@5522988193773");
    expect(l).toMatch(/3 itens/);         // 1 na lista + 2 no resto
    expect(l).toMatch(/Mr\.distribuidora MDF/);
    expect(l).toMatch(/49 dias/);
  });

  it("sem nada pendente, dá bom dia e para aí", () => {
    expect(legendaBomDia({ pessoa: "Ph", itens: [] }, "")).toMatch(/nada pendente/i);
  });

  it("item recente não vira alarme", () => {
    const l = legendaBomDia({ pessoa: "X", itens: [{ cliente: "Y", acao: "postar", dias: 1 }] }, "");
    expect(l).not.toMatch(/mais antigo/);
  });
});
