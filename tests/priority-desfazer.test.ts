// tests/priority-desfazer.test.ts — Feito/Ignorar/Incorreta no feed têm volta (auditoria 25/10/2026, 11.8).
//
// O erro original: o item saía sem Desfazer e a rota não aceitava reabrir — uma tecla "e" errada sumia
// com a prioridade.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const chamadas: { update?: Record<string, unknown>; in?: unknown[] }[] = [];
let resposta: { data: unknown; error: { message: string; code?: string } | null } = { data: null, error: null };
function consulta() {
  const atual: { update?: Record<string, unknown>; in?: unknown[] } = {};
  chamadas.push(atual);
  const q: Record<string, unknown> = {};
  q.update = (p: Record<string, unknown>) => { atual.update = p; return q; };
  q.in = (_c: string, v: unknown[]) => { atual.in = v; return q; };
  for (const m of ["eq", "select", "maybeSingle"]) q[m] = () => q;
  q.then = (ok: (r: unknown) => unknown) => Promise.resolve(resposta).then(ok);
  return q;
}
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: () => consulta() } }));

const { reabrir } = await import("@/lib/priority/repo");

beforeEach(() => { chamadas.length = 0; resposta = { data: { id: "r1", estado: "vista", titulo: "x" }, error: null }; });

describe("reabrir uma recomendação decidida", () => {
  it("volta ao estado anterior e apaga a marca de quem decidiu (não conta na taxa de decisão)", async () => {
    await reabrir("r1", "nova");
    expect(chamadas[0].update).toMatchObject({ estado: "nova", decidido_por: null, decidido_em: null, motivo_decisao: null });
    expect(chamadas[0].in).toEqual(["ignorada", "incorreta", "executada"]);
  });

  it("o motor já recriou uma igual aberta: diz isso, não falha calado", async () => {
    resposta = { data: null, error: { message: "duplicate key", code: "23505" } };
    await expect(reabrir("r1")).rejects.toThrow(/recriou essa mesma recomendação/);
  });
});

describe("a rota e a tela", () => {
  const rota = readFileSync(path.resolve(__dirname, "../app/api/priority/decidir/route.ts"), "utf8");
  const feed = readFileSync(path.resolve(__dirname, "../components/agente/FeedPrioridades.tsx"), "utf8");
  it("a rota aceita 'reabrir'", () => {
    expect(rota).toContain('body?.decisao === "reabrir"');
  });
  it("Feito/Ignorar/Incorreta e a tecla 'e' mostram Desfazer", () => {
    expect(feed).toContain('label: "Desfazer"');
    expect(feed).toContain('decisao: "reabrir", estadoAnterior: item.estado');
  });
});
