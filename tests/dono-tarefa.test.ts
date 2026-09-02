import { describe, it, expect } from "vitest";
import { ehPapelGenerico } from "@/lib/cs/dono-tarefa";

// A cobrança diária listava "Rodrigo" e "designer" como duas pessoas — e são a mesma. Cada bloco
// ficava com metade das tarefas dele. Das 29 tarefas abertas, 14 estavam em papel genérico, e todas
// as 14 tinham cliente: o dono real dava pra descobrir.
describe("papel genérico x pessoa", () => {
  it("reconhece os papéis que a casa usa", () => {
    for (const p of ["social", "designer", "traffic", "Social Media", "TRÁFEGO"]) {
      expect(ehPapelGenerico(p), p).toBe(true);
    }
  });

  it("nome de pessoa não é papel", () => {
    for (const n of ["Rodrigo", "Carlos Augusto", "Thiago", "Julio"]) {
      expect(ehPapelGenerico(n), n).toBe(false);
    }
  });

  it("vazio não é papel", () => {
    expect(ehPapelGenerico(null)).toBe(false);
    expect(ehPapelGenerico("")).toBe(false);
  });
});
