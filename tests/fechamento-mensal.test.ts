import { describe, it, expect } from "vitest";
import { fecharSocial, fecharDesigner, diasDeAtraso, type ClienteMes, type ArteEntregue } from "@/lib/scores/fechamento-mensal";

// Roberto (02/09): "tem que mostrar se teve um cliente que não recebeu artes… quantos clientes
// teve arte, quantos não teve, quanto foi tempo de atraso."

const cli = (o: Partial<ClienteMes> & { cliente: string }): ClienteMes => ({
  clientId: o.cliente, responsavelSocial: "Thiago", responsavelDesigner: "Rodrigo",
  publicados: 12, meta: 12, artesRegistradas: 0, atrasadas: 0, diasAtrasoTotal: 0,
  semNenhumPost: false, ilegivel: false, ...o,
});

describe("social: quem ficou sem arte no mês", () => {
  const r = fecharSocial([
    cli({ cliente: "A", publicados: 14 }),
    cli({ cliente: "B", publicados: 8 }),
    cli({ cliente: "C", publicados: 0, semNenhumPost: true }),
    cli({ cliente: "D", publicados: 0, semNenhumPost: true }),
    cli({ cliente: "E", publicados: 0, semNenhumPost: true, ilegivel: true }),
  ])[0];

  it("conta quantos tiveram e quantos não tiveram post", () => {
    expect(r.clientes).toBe(5);
    expect(r.comPost).toBe(2);
    expect(r.semPost).toBe(2);   // o ilegível NÃO conta como sem post
  });

  it("NOMEIA quem ficou sem nada — é o que permite agir hoje", () => {
    expect(r.clientesSemPost).toEqual(["C", "D"]);
  });

  it("nomeia também quem publicou abaixo da meta, do pior pro melhor", () => {
    expect(r.clientesAbaixoDaMeta).toEqual([{ cliente: "B", publicados: 8, meta: 12 }]);
  });

  it("cliente que não conseguimos ler sai da conta e é reportado à parte", () => {
    // Contar como zero acusaria a pessoa por uma pendência de acesso na Meta.
    expect(r.ilegiveis).toBe(1);
    expect(r.clientesSemPost).not.toContain("E");
  });

  it("atingimento é sobre a meta dos clientes legíveis", () => {
    // (14 + 8 + 0 + 0) de 4 × 12 = 22/48 = 46%
    expect(r.metaTotal).toBe(48);
    expect(r.publicados).toBe(22);
    expect(r.atingimento).toBe(46);
  });

  it("ordena colocando quem tem mais cliente sem post na frente", () => {
    const rr = fecharSocial([
      cli({ cliente: "X", responsavelSocial: "Carlos", publicados: 12 }),
      cli({ cliente: "Y", responsavelSocial: "Thiago", publicados: 0, semNenhumPost: true }),
    ]);
    expect(rr[0].pessoa).toBe("Thiago");
  });
});

describe("designer: atraso em dias, não em rótulo", () => {
  const arte = (o: Partial<ArteEntregue> & { titulo: string }): ArteEntregue => ({
    cliente: "Cliente", designer: "Rodrigo", entregueEm: "2026-08-10", prazo: "2026-08-10", ...o,
  });
  const r = fecharDesigner([
    arte({ titulo: "no prazo" }),
    arte({ titulo: "um dia", entregueEm: "2026-08-11", prazo: "2026-08-10" }),
    arte({ titulo: "cinco dias", entregueEm: "2026-08-15", prazo: "2026-08-10", cliente: "Calabria" }),
    arte({ titulo: "adiantada", entregueEm: "2026-08-08", prazo: "2026-08-10" }),
    arte({ titulo: "sem prazo", prazo: null }),
  ])[0];

  it("separa entregue no prazo de atrasada", () => {
    expect(r.artesEntregues).toBe(5);
    expect(r.noPrazo).toBe(2);      // no prazo + adiantada
    expect(r.atrasadas).toBe(2);
    expect(r.pontualidade).toBe(50); // sobre as 4 COM prazo, não sobre as 5
  });

  it("a média de atraso conta só as atrasadas", () => {
    // Diluir com as pontuais faria 5 dias de atraso virar 1,5 e esconder o tamanho.
    expect(r.diasMediosDeAtraso).toBe(3);   // (1 + 5) / 2
  });

  it("mostra o pior caso com nome e cliente", () => {
    expect(r.piorAtraso).toEqual({ cliente: "Calabria", titulo: "cinco dias", dias: 5 });
  });

  it("arte sem prazo combinado não é pontual nem atrasada", () => {
    const so = fecharDesigner([arte({ titulo: "sem prazo", prazo: null })])[0];
    expect(so.artesEntregues).toBe(1);
    expect(so.pontualidade).toBe(0);
    expect(so.diasMediosDeAtraso).toBeNull();
    expect(so.piorAtraso).toBeNull();
  });

  it("sem atraso nenhum, a média é null e não zero", () => {
    const bom = fecharDesigner([arte({ titulo: "ok" })])[0];
    expect(bom.diasMediosDeAtraso).toBeNull();   // null = não houve atraso; 0 seria "atrasou 0 dias"
    expect(bom.pontualidade).toBe(100);
  });
});

describe("diasDeAtraso", () => {
  it("positivo atrasou, negativo adiantou, sem prazo é null", () => {
    expect(diasDeAtraso("2026-08-15", "2026-08-10")).toBe(5);
    expect(diasDeAtraso("2026-08-08", "2026-08-10")).toBe(-2);
    expect(diasDeAtraso("2026-08-10", null)).toBeNull();
  });

  it("atravessa a virada do mês", () => {
    expect(diasDeAtraso("2026-09-02", "2026-08-30")).toBe(3);
  });
});
