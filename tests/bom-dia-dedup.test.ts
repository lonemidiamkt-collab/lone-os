import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Roberto mandou o print da mensagem de 02/09: "Mr.distribuidora MDF (Carlos, 48d),
// Mr.distribuidora MDF (Carlos, 48d), Mr.distribuidora MDF (Carlos, 48d), Mr.distribuidora MDF
// (Carlos, 48d)…" — quatro vezes o mesmo cliente, ocupando a linha inteira e escondendo os outros
// que estavam na mesma situação. A linha pegava os 4 primeiros ITENS, sem agrupar por cliente.
const SRC = readFileSync("lib/cs/bom-dia.ts", "utf8");

describe("bom dia: um cliente, uma linha", () => {
  it("agrupa as artes prontas por cliente", () => {
    expect(SRC).toMatch(/porCliente\.set\(p\.cliente/);
  });

  it("mostra a quantidade em vez de repetir o nome", () => {
    expect(SRC).toMatch(/i\.qtd > 1 \? `\$\{i\.qtd\} artes/);
  });

  it("usa a espera MAIS ANTIGA do cliente, não a primeira encontrada", () => {
    expect(SRC).toMatch(/Math\.max\(at\.dias, p\.dias\)/);
  });

  it("o reticências conta CLIENTES restantes, não itens", () => {
    expect(SRC).toMatch(/porCliente\.size > 4/);
  });
});
