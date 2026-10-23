import { describe, expect, it } from "vitest";
import { clientesParecidos, empresasParecidas, linkDoCliente, separarFechados } from "@/lib/crm/fechados";
import { ABAS_COMERCIAL, ABAS_DA_PAGINA_CRM } from "@/lib/navegacao/casco";

const L = (id: string, estagio: string, fechadoEm: string | null, clienteId: string | null = null) => ({ id, estagio, fechadoEm, clienteId, updatedAt: null });

describe("aba Fechados do Comercial", () => {
  const leads = [
    L("a", "ganho", "2026-09-10"), // ganho de setembro, ainda sem cadastro
    L("b", "ganho", "2026-10-20"),
    L("c", "ganho", "2026-10-05", "cli-1"),
    L("d", "ganho", "2026-09-02", "cli-2"),
    L("e", "perdido", "2026-10-15"),
    L("f", "perdido", "2026-08-01"),
    L("g", "negociacao", null),
  ];

  it("venda ganha sem cadastro fica à vista em qualquer mês — é pendência, não histórico", () => {
    const f = separarFechados(leads, "2026-10");
    expect(f.converter.map((l) => l.id)).toEqual(["b", "a"]); // a mais recente primeiro
    expect(f.clientes.map((l) => l.id)).toEqual(["c"]);
    expect(f.perdidos.map((l) => l.id)).toEqual(["e"]);
  });

  it("'Todos' traz clientes e perdidos de qualquer mês; negócio aberto nunca entra", () => {
    const f = separarFechados(leads, null);
    expect(f.clientes.map((l) => l.id)).toEqual(["c", "d"]);
    expect(f.perdidos.map((l) => l.id)).toEqual(["e", "f"]);
    expect([...f.converter, ...f.clientes, ...f.perdidos].some((l) => l.id === "g")).toBe(false);
  });

  it("sem data de fechamento usa a última atualização", () => {
    const f = separarFechados([{ id: "x", estagio: "perdido", fechadoEm: null, updatedAt: "2026-10-01T10:00:00Z" }], "2026-10");
    expect(f.perdidos).toHaveLength(1);
  });

  it("no comercial.lonemidia.com o link do cliente vai para o painel (lá só existe o /crm)", () => {
    expect(linkDoCliente("abc", "comercial.lonemidia.com")).toBe("https://painel.lonemidia.com/clients/abc");
    expect(linkDoCliente("abc", "painel.lonemidia.com")).toBe("/clients/abc");
    expect(linkDoCliente("abc", null)).toBe("/clients/abc");
  });

  it("Fechados é aba da página /crm, logo depois do Funil", () => {
    const ids = ABAS_COMERCIAL.map((a) => a.id);
    expect(ids.indexOf("fechados")).toBe(ids.indexOf("funil") + 1);
    expect(ABAS_DA_PAGINA_CRM).toContain("fechados");
  });
});

describe("já é cliente? (ligar em vez de criar duplicado)", () => {
  it("acha o cadastro de nome parecido: acento, sufixo, espaço e nome contido", () => {
    expect(empresasParecidas("Depósito Exemplo dos Fios", "Deposito Exemplo dos Fios Ltda")).toBe(true);
    expect(empresasParecidas("xyzmultimarcasconceito", "XYZ MULTIMARCAS")).toBe(true);
    expect(empresasParecidas("Loja Alfa", "Loja Beta")).toBe(false);
    expect(empresasParecidas("Bar", "Barbearia Central")).toBe(false); // curto demais para valer
    expect(empresasParecidas("", "Qualquer")).toBe(false);
  });
  it("filtra só os parecidos, sem mudar a ordem", () => {
    const clientes = [{ id: "1", nome: "Deposito Exemplo dos Fios Ltda" }, { id: "2", nome: "Outra Loja" }, { id: "3", nome: "DEPÓSITO EXEMPLO DOS FIOS" }];
    expect(clientesParecidos("Depósito Exemplo dos Fios", clientes).map((c) => c.id)).toEqual(["1", "3"]);
  });
});
