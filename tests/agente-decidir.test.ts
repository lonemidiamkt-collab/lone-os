// tests/agente-decidir.test.ts — de onde o "Decidir" do feed tira os códigos (Leva 7C, N25).

import { describe, it, expect } from "vitest";
import { codigosDaAcao } from "@/components/agente/DecidirDemanda";

describe("códigos do item do feed", () => {
  it("agregado: a lista; item único: o código; sem ação: nada", () => {
    expect(codigosDaAcao({ tipo: "decidir_demanda", codigo: "a1", codigos: ["a1", "b2"] })).toEqual(["a1", "b2"]);
    expect(codigosDaAcao({ tipo: "decidir_demanda", codigo: "a1" })).toEqual(["a1"]);
    expect(codigosDaAcao({ tipo: "decidir_demanda", codigos: [null, "x9", 3] })).toEqual(["x9"]);
    expect(codigosDaAcao(null)).toEqual([]);
  });
});
