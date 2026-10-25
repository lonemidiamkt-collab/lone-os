// tests/radar-guardadas.test.ts — "Guardar para depois" e "Não serve" no Radar têm volta (auditoria
// 25/10/2026, 14.6).
//
// O erro original: a pauta sumia e nenhuma tela listava as guardadas (a tela só pedia status=nova).
// Guardar equivalia a perder, sem Desfazer.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const feito: { update?: Record<string, unknown>; in?: unknown[] } = {};
let resposta: { data: unknown; error: { message: string } | null } = { data: [{ id: "p1" }], error: null };
function consulta() {
  const q: Record<string, unknown> = {};
  q.update = (u: Record<string, unknown>) => { feito.update = u; return q; };
  q.in = (_c: string, v: unknown[]) => { feito.in = v; return q; };
  for (const m of ["eq", "select"]) q[m] = () => q;
  q.then = (ok: (r: unknown) => unknown) => Promise.resolve(resposta).then(ok);
  return q;
}
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: () => consulta() } }));
vi.mock("@/lib/api/require-role", () => ({ requireRole: async () => ({ user: { email: "carlos@lone.com" }, papel: "social" }) }));

const { POST } = await import("@/app/api/radar/pautas/route");
const post = (corpo: unknown) => POST(new Request("http://x/api/radar/pautas", { method: "POST", body: JSON.stringify(corpo) }) as never);

beforeEach(() => { delete feito.update; delete feito.in; resposta = { data: [{ id: "p1" }], error: null }; });

describe("voltar uma pauta para as novas", () => {
  it("guardada ou descartada volta, sem a marca da decisão", async () => {
    const r = await post({ id: "p1", decisao: "nova" });
    expect(r.status).toBe(200);
    expect(feito.update).toEqual({ status: "nova", decidido_por: null, decidido_em: null, motivo_descarte: null });
    expect(feito.in).toEqual(["guardada", "descartada"]);
  });

  it("a usada (já virou card) não volta — diz por quê", async () => {
    resposta = { data: [], error: null };
    const r = await post({ id: "p1", decisao: "nova" });
    expect(r.status).toBe(409);
    expect((await (r as NextResponse).json()).error).toMatch(/virado card/);
  });
});

describe("a tela", () => {
  const tela = readFileSync(path.resolve(__dirname, "../components/planejamento/RadarOportunidades.tsx"), "utf8");
  it("lista as guardadas numa aba", () => {
    expect(tela).toContain('"/api/radar/pautas?status=guardada"');
    expect(tela).toContain("Voltar para novas");
  });
  it("guardar e descartar oferecem Desfazer", () => {
    expect(tela).toContain('action: { label: "Desfazer"');
  });
});
