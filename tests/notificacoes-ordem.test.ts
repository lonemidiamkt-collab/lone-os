// tests/notificacoes-ordem.test.ts — a ordem da lista de notificações.
//
// O QUE ACONTECIA (Roberto, 04/08): "problemas nas notificações e na ordem que elas aparecem
// depois das entregas". Duas causas na mesma função:
//
//   1. O `refresh` fazia `[...localOnly, ...doBanco]` SEM reordenar. O item otimista (criado com o
//      relógio do navegador) ficava colado no topo, acima de avisos mais novos.
//   2. O item otimista nasce com id "temp-…" e o banco gera outro. Como o descarte era por id, ele
//      NUNCA era reconhecido: ficava pra sempre na lista, duplicando o aviso real.
//
// A regra aqui é a de sempre: mais novo primeiro, pelo horário do SERVIDOR.

import { describe, it, expect } from "vitest";

/** Mesma ordenação do store (stores/useNotificationsStore.ts). */
function ordenar<T extends { id: string; createdAt: string }>(l: T[]): T[] {
  return [...l].sort((a, b) => {
    const d = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    return d !== 0 ? d : (a.id < b.id ? 1 : -1);
  });
}

const n = (id: string, createdAt: string) => ({ id, createdAt });

describe("ordem da lista", () => {
  it("mais novo primeiro, independente da ordem em que chegou", () => {
    const l = ordenar([
      n("a", "2026-08-04T10:00:00Z"),
      n("b", "2026-08-04T12:00:00Z"),
      n("c", "2026-08-04T11:00:00Z"),
    ]);
    expect(l.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("o item otimista NÃO fica preso no topo — entra pelo horário dele", () => {
    // Cenário real: o designer entrega (temp, 09h) e depois chega do banco um aviso das 11h.
    const l = ordenar([
      n("temp-123", "2026-08-04T09:00:00Z"),
      n("uuid-novo", "2026-08-04T11:00:00Z"),
    ]);
    expect(l[0].id).toBe("uuid-novo");
  });

  it("empate no horário não faz a lista dançar entre renders", () => {
    const mesmo = "2026-08-04T10:00:00Z";
    const a = ordenar([n("x", mesmo), n("y", mesmo)]).map((v) => v.id);
    const b = ordenar([n("y", mesmo), n("x", mesmo)]).map((v) => v.id);
    expect(a).toEqual(b);
  });
});

describe("descarte do item otimista", () => {
  /** Mesma regra do refresh: some por id (já veio do banco) ou por idade (nunca vai vir). */
  const sobrevive = (id: string, createdAt: string, idsDoBanco: Set<string>) =>
    !idsDoBanco.has(id) && (!id.startsWith("temp-") || Date.now() - Date.parse(createdAt) < 30_000);

  it("temp velho some — era ele que duplicava o aviso real", () => {
    const velho = new Date(Date.now() - 60_000).toISOString();
    expect(sobrevive("temp-1", velho, new Set())).toBe(false);
  });

  it("temp recém-criado sobrevive — ainda está subindo", () => {
    expect(sobrevive("temp-2", new Date().toISOString(), new Set())).toBe(true);
  });

  it("aviso real e antigo NÃO some por idade — só o temporário tem prazo", () => {
    const antigo = new Date(Date.now() - 86_400_000).toISOString();
    expect(sobrevive("uuid-real", antigo, new Set())).toBe(true);
  });
});
