import { describe, it, expect } from "vitest";
import { donoDaDemanda, ehDoQuadro, quadrosDisponiveis, contagemPorQuadro, SEM_DONO } from "@/lib/design/dono";

// Números reais de 10/09/2026: 490 demandas de clientes do Rodrigo, 184 do Gabriel Sodre, 58 de
// clientes sem designer. E 13 demandas com o nome cravado no título ("[Gabriel] SEX 11 - ..."),
// que era o contorno manual por não existir coluna de designer na tabela.
const CLIENTES = [
  { id: "c1", assignedDesigner: "Rodrigo" },
  { id: "c2", assignedDesigner: "Gabriel Sodre" },
  { id: "c3", assignedDesigner: null },
  { id: "c4", assignedDesigner: "  " },
];

describe("dono da demanda", () => {
  it("sem atribuição, vale a carteira do cliente", () => {
    expect(donoDaDemanda({ clientId: "c1" }, CLIENTES)).toBe("Rodrigo");
    expect(donoDaDemanda({ clientId: "c2" }, CLIENTES)).toBe("Gabriel Sodre");
  });

  it("atribuição explícita vence a carteira", () => {
    // "O Gabriel pegou uma do Rodrigo hoje" fica registrado sem mexer no cadastro do cliente.
    expect(donoDaDemanda({ clientId: "c1", assignedDesigner: "Gabriel Sodre" }, CLIENTES)).toBe("Gabriel Sodre");
  });

  it("cliente sem designer devolve null, não string vazia", () => {
    // null é "não sei de quem é", não "de ninguém" — a demanda ainda precisa aparecer em algum lugar.
    expect(donoDaDemanda({ clientId: "c3" }, CLIENTES)).toBeNull();
    expect(donoDaDemanda({ clientId: "c4" }, CLIENTES)).toBeNull();
    expect(donoDaDemanda({ clientId: "inexistente" }, CLIENTES)).toBeNull();
  });

  it("espaço em branco não vira dono", () => {
    expect(donoDaDemanda({ clientId: "c1", assignedDesigner: "   " }, CLIENTES)).toBe("Rodrigo");
  });
});

describe("filtro de quadro", () => {
  const rodrigo = { clientId: "c1" };
  const gabriel = { clientId: "c2" };
  const orfa = { clientId: "c3" };

  it("cada um vê o seu", () => {
    expect(ehDoQuadro(rodrigo, CLIENTES, "Rodrigo")).toBe(true);
    expect(ehDoQuadro(gabriel, CLIENTES, "Rodrigo")).toBe(false);
    expect(ehDoQuadro(gabriel, CLIENTES, "Gabriel Sodre")).toBe(true);
  });

  it("'Todos' vê tudo, inclusive as sem dono", () => {
    for (const d of [rodrigo, gabriel, orfa]) {
      expect(ehDoQuadro(d, CLIENTES, "Todos")).toBe(true);
    }
  });

  it("as órfãs têm um quadro próprio — senão ninguém descobre que existem", () => {
    expect(ehDoQuadro(orfa, CLIENTES, SEM_DONO)).toBe(true);
    expect(ehDoQuadro(rodrigo, CLIENTES, SEM_DONO)).toBe(false);
  });

  it("a demanda assumida sai do quadro de origem e entra no de quem assumiu", () => {
    const assumida = { clientId: "c1", assignedDesigner: "Gabriel Sodre" };
    expect(ehDoQuadro(assumida, CLIENTES, "Rodrigo")).toBe(false);
    expect(ehDoQuadro(assumida, CLIENTES, "Gabriel Sodre")).toBe(true);
  });
});

describe("quadros disponíveis", () => {
  it("sai do dado, não de lista escrita no código", () => {
    // Um terceiro designer que entre amanhã ganha quadro sozinho. Foi o que não aconteceu quando
    // o Gabriel entrou.
    const clientes = [...CLIENTES, { id: "c5", assignedDesigner: "Novato" }];
    expect(quadrosDisponiveis([{ clientId: "c1" }], clientes)).toEqual(["Gabriel Sodre", "Novato", "Rodrigo"]);
  });

  it("designer sem nenhuma demanda ainda também aparece", () => {
    expect(quadrosDisponiveis([], CLIENTES)).toEqual(["Gabriel Sodre", "Rodrigo"]);
  });

  it("acrescenta o quadro das órfãs só quando há órfã", () => {
    expect(quadrosDisponiveis([{ clientId: "c3" }], CLIENTES)).toContain(SEM_DONO);
    expect(quadrosDisponiveis([{ clientId: "c1" }], CLIENTES)).not.toContain(SEM_DONO);
  });
});

describe("contagem por quadro", () => {
  it("conta só o que está aberto", () => {
    const demandas = [
      { clientId: "c1", status: "queued" },
      { clientId: "c1", status: "done" },
      { clientId: "c2", status: "in_progress" },
      { clientId: "c3", status: "queued" },
    ];
    expect(contagemPorQuadro(demandas, CLIENTES)).toEqual({ Rodrigo: 1, "Gabriel Sodre": 1, [SEM_DONO]: 1 });
  });
});
