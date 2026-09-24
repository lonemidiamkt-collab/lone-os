// tests/trafego-cobertura.test.ts — Leva 7A (N7): quais clientes e dias estão sem dado da Meta.

import { describe, it, expect } from "vitest";
import { janelaDeDias, montarCobertura, type ClienteCobertura } from "@/lib/trafego/cobertura";

const JANELA = janelaDeDias("2026-09-23", 5); // 19..23
const cli = (id: string, o: Partial<ClienteCobertura> = {}): ClienteCobertura => ({
  clientId: id, nome: id, gestor: "Julio", metaAccountId: "act_1", statusConta: 1, syncErro: null, ...o,
});
const dias = (...ds: number[]) => new Set(ds.map((d) => `2026-09-${String(d).padStart(2, "0")}`));

describe("cobertura de dados", () => {
  it("janela do mais antigo ao mais novo", () => {
    expect(JANELA).toEqual(["2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23"]);
  });

  it("estados por dia e contagens", () => {
    const [l] = montarCobertura([cli("a")], new Map([["a", dias(19, 20, 21, 23)]]), new Map([["a", dias(19, 20, 23)]]), JANELA);
    expect(l.dias).toEqual(["completo", "completo", "so_conta", "vazio", "completo"]);
    expect(l).toMatchObject({ diasComConta: 4, diasComAnuncio: 3, buracos: 1, ultimoDia: "2026-09-23", gravidade: "atencao" });
  });

  it("sem conta, conta com erro e nada na janela são críticos e vêm primeiro; completo é ok", () => {
    const linhas = montarCobertura([
      cli("ok"), cli("semconta", { metaAccountId: null }), cli("erro", { syncErro: "OAuth" }), cli("vazio"),
    ], new Map([["ok", dias(19, 20, 21, 22, 23)], ["erro", dias(19, 20, 21, 22, 23)]]),
       new Map([["ok", dias(19, 20, 21, 22, 23)], ["erro", dias(19, 20, 21, 22, 23)]]), JANELA);
    expect(linhas.map((l) => [l.clientId, l.gravidade])).toEqual([
      ["semconta", "critico"], ["vazio", "critico"], ["erro", "critico"], ["ok", "ok"],
    ]);
    expect(linhas.find((l) => l.clientId === "semconta")!.motivo).toBe("Sem conta de anúncio vinculada");
    expect(linhas.find((l) => l.clientId === "erro")!.motivo).toContain("OAuth");
    expect(linhas.find((l) => l.clientId === "ok")!.motivo).toBeNull();
  });
});
