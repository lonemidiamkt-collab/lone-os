// Versões da arte para comparar na revisão (lib/conteudo/versoes.ts, Leva 7B N17).
import { describe, it, expect } from "vitest";
import { montarVersoes, parParaComparar, podeComparar } from "@/lib/conteudo/versoes";

const entregas = [
  { id: "d1", version: 1, delivered_by: "Rodrigo", delivered_at: "2026-09-20T10:00:00Z", status: "substituida", revision_reason: null },
  { id: "d2", version: 2, delivered_by: "Rodrigo", delivered_at: "2026-09-22T10:00:00Z", status: "entregue", revision_reason: "Trocar o preço para R$ 49,90" },
];
const recibos = [
  { after: { delivery: { id: "d1", urls: ["v1a.png", "v1b.png"] } } },
  { after: { delivery: { id: "d2", urls: ["v2a.png"] } } },
];

describe("versões", () => {
  it("da mais nova para a mais velha, com os arquivos do recibo e o motivo da alteração", () => {
    const v = montarVersoes(entregas, recibos);
    expect(v.map((x) => x.versao)).toEqual([2, 1]);
    expect(v[0].urls).toEqual(["v2a.png"]);
    expect(v[1].urls).toEqual(["v1a.png", "v1b.png"]);
    expect(v[0].motivo).toBe("Trocar o preço para R$ 49,90");
    expect(v[1].substituida).toBe(true);
  });
  it("sem recibo, os anexos ligados à versão", () => {
    const v = montarVersoes(entregas, [], [{ url: "b", delivery_id: "d1", position: 2 }, { url: "a", delivery_id: "d1", position: 1 }]);
    expect(v[1].urls).toEqual(["a", "b"]);
    expect(v[0].urls).toEqual([]);
  });
  it("o par: depois da reentrega, o motivo da versão nova; com alteração pendente, o pedido em aberto", () => {
    const v = montarVersoes(entregas, recibos);
    const p = parParaComparar(v);
    expect(p.atual?.versao).toBe(2);
    expect(p.anterior?.versao).toBe(1);
    expect(p.motivo).toBe("Trocar o preço para R$ 49,90");
    expect(p.pendente).toBe(false);
    const pend = parParaComparar(v, "Logo maior");
    expect(pend.motivo).toBe("Logo maior");
    expect(pend.pendente).toBe(true);
  });
  it("comparar exige duas versões com arquivo", () => {
    expect(podeComparar(montarVersoes(entregas, recibos))).toBe(true);
    expect(podeComparar(montarVersoes(entregas.slice(0, 1), recibos))).toBe(false);
    expect(podeComparar(montarVersoes(entregas, []))).toBe(false);
  });
});
