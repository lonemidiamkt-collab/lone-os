// tests/carga-por-pessoa.test.ts — carga real por pessoa (Leva 7C, N30).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cargaPorPessoa, LIMITE_POR_PAPEL, situacaoDaCarga } from "@/lib/carga/por-pessoa";

const clientes = [
  { id: "c1", name: "Alfa", assignedSocial: "Carlos", assignedTraffic: "Julio", assignedDesigner: "Rodrigo" },
  { id: "c2", name: "Beta", assignedSocial: "Carlos", assignedTraffic: "Julio", assignedDesigner: "Rodrigo" },
];
const pessoas = [
  { nome: "Carlos", papel: "social" }, { nome: "Rodrigo", papel: "designer" }, { nome: "Julio", papel: "traffic" }, { nome: "Roberto", papel: "admin" },
];

describe("carga real por pessoa", () => {
  it("cada papel conta o que é dele, contra o limite do papel (não mais 8/semana para todos)", () => {
    const r = cargaPorPessoa({
      pessoas, clientes,
      tarefas: [{ assignedTo: "Carlos", status: "pending" }, { assignedTo: "Julio", status: "in_progress" }, { assignedTo: "Julio", status: "done" }],
      cards: [
        { socialMedia: "Carlos", status: "ideas", clientId: "c1" },
        { socialMedia: "Carlos", status: "in_production", clientId: "c1" },                     // com o designer, sem pedido
        { socialMedia: "Carlos", status: "in_production", clientId: "c2", designRequestId: "d1" }, // com o designer, com pedido
        { socialMedia: "Carlos", status: "published", clientId: "c2" },                          // no ar: não conta
        { socialMedia: "Carlos", status: "ideas", clientId: "c2", archivedAt: "2026-09-01" },   // arquivado: não conta
      ],
      pedidosArte: [{ clientId: "c2", status: "in_progress" }, { clientId: "c1", status: "done" }],
    });
    const carlos = r.find((p) => p.nome === "Carlos")!;
    expect(carlos).toMatchObject({ papel: "social", tarefas: 1, cards: 3, artes: 0, total: 4, limite: LIMITE_POR_PAPEL.social });
    const rodrigo = r.find((p) => p.nome === "Rodrigo")!;
    expect(rodrigo).toMatchObject({ papel: "designer", artes: 2, total: 2 }); // pedido aberto + card sem pedido, sem contar duas vezes
    const julio = r.find((p) => p.nome === "Julio")!;
    expect(julio).toMatchObject({ papel: "traffic", tarefas: 1, total: 1, limite: LIMITE_POR_PAPEL.traffic });
    expect(r.find((p) => p.nome === "Roberto")).toBeUndefined(); // diretoria sem nada aberto não entra
    expect(carlos.clientes).toEqual(["Alfa", "Beta"]);
  });

  it("pedido de arte assumido por outro designer vai para quem assumiu", () => {
    const r = cargaPorPessoa({
      pessoas: [...pessoas, { nome: "Ana", papel: "designer" }], clientes, tarefas: [], cards: [],
      pedidosArte: [{ clientId: "c1", status: "queued", assignedDesigner: "Ana" }],
    });
    expect(r.find((p) => p.nome === "Ana")!.artes).toBe(1);
    expect(r.find((p) => p.nome === "Rodrigo")!.artes).toBe(0);
  });

  it("situação pela porcentagem do limite", () => {
    expect(situacaoDaCarga(20)).toBe("folga");
    expect(situacaoDaCarga(60)).toBe("ok");
    expect(situacaoDaCarga(90)).toBe("cheio");
    expect(situacaoDaCarga(130)).toBe("acima");
  });

  it("a capacidade fixa de 8 saiu do painel da diretoria", () => {
    const ceo = readFileSync(path.resolve(__dirname, "../app/ceo/page.tsx"), "utf8");
    expect(ceo).not.toMatch(/CAPACITY_PER_WEEK/);
    expect(ceo).toContain("<CargaPorPessoa />");
  });
});
