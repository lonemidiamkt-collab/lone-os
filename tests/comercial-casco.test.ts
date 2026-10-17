// comercial.lonemidia.com (out/2026): o endereço decide o casco e o que existe nele.
import { describe, it, expect } from "vitest";
import { ehHostComercial, destinoNoComercial, ABAS_COMERCIAL, ABAS_DA_PAGINA_CRM } from "@/lib/navegacao/casco";
import { montarVisaoRota, catalogoDaPagina } from "@/lib/crm/rota";

describe("endereço do comercial", () => {
  it("reconhece o subdomínio, com ou sem porta; o painel não", () => {
    expect(ehHostComercial("comercial.lonemidia.com")).toBe(true);
    expect(ehHostComercial("COMERCIAL.lonemidia.com:443")).toBe(true);
    expect(ehHostComercial("comercial.localhost:3000")).toBe(true);
    expect(ehHostComercial("painel.lonemidia.com")).toBe(false);
    expect(ehHostComercial("lonemidia.com")).toBe(false);
    expect(ehHostComercial(null)).toBe(false);
  });
  it("só o Comercial existe lá: início mostra o /crm, o resto volta para o início", () => {
    expect(destinoNoComercial("/")).toEqual({ tipo: "reescrever", para: "/crm" });
    expect(destinoNoComercial("/crm")).toEqual({ tipo: "seguir" });
    expect(destinoNoComercial("/crm/rota")).toEqual({ tipo: "seguir" });
    expect(destinoNoComercial("/crm/importar")).toEqual({ tipo: "seguir" });
    expect(destinoNoComercial("/ceo")).toEqual({ tipo: "redirecionar", para: "/" });
    expect(destinoNoComercial("/crmx")).toEqual({ tipo: "redirecionar", para: "/" });
    expect(destinoNoComercial("/traffic")).toEqual({ tipo: "redirecionar", para: "/" });
  });
  it("abas: as da página trocam a aba; Rota e Importar são páginas", () => {
    for (const a of ABAS_COMERCIAL) {
      if (ABAS_DA_PAGINA_CRM.includes(a.id)) expect(a.href).toBe("/crm");
      else expect(a.href.startsWith("/crm/")).toBe(true);
    }
  });
});

describe("aba Rota: lojas, visitas e funil", () => {
  const catalogo = catalogoDaPagina(`const ETAPAS = [
    { cidade:"Cidade Beta", empresas:[ {i:9, nome:"Loja Nove", tel:"22998765432"} ] },
    { cidade:"Cidade Alfa", empresas:[ {i:2, nome:"Loja Dois"}, {i:1, nome:"Loja Um", tel:"22991112222"} ] }
  ];`);
  const visao = montarVisaoRota(catalogo, [
    { rota: "lagos-1", loja: 9, visitada: true, por: "Ana", visitadaEm: "2026-10-13T12:00:00Z" },
    { rota: "lagos-2", loja: 9, visitada: true, por: "Bruno", visitadaEm: "2026-11-02T12:00:00Z" },
    { rota: "teste", loja: 2, visitada: true, por: "Ana", visitadaEm: "2026-10-12T12:00:00Z" },
    { rota: "lagos-1", loja: 1, visitada: false, por: "Ana", visitadaEm: null },
  ], [
    { id: "a", estagio: "negociacao", rotaLojaId: 9, telefone: null },
    { id: "b", estagio: "contato", rotaLojaId: null, telefone: "(22) 99111-2222" }, // casa pelo telefone
  ]);

  it("cidades na ordem da rota; visita mais recente; teste não conta", () => {
    expect(visao.cidades.map((c) => c.cidade)).toEqual(["Cidade Beta", "Cidade Alfa"]);
    const nove = visao.cidades[0].lojas[0];
    expect(nove).toMatchObject({ visitada: true, por: "Bruno", lead: { id: "a", estagio: "negociacao" } });
    const [um, dois] = visao.cidades[1].lojas;
    expect(um).toMatchObject({ id: 1, visitada: false, lead: { id: "b" } });
    expect(dois).toMatchObject({ id: 2, visitada: false, lead: null });
  });
  it("totais", () => {
    expect(visao.totais).toEqual({ lojas: 3, visitadas: 1, noFunil: 2, negociando: 1 });
  });
});
