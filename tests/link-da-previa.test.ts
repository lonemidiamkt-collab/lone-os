// @vitest-environment node
// tests/link-da-previa.test.ts — Fase 0, leva 0C (25/11/2026).
// As prévias de PDF devolviam getPublicUrl num bucket PRIVADO: o link dava 400. Agora é link assinado
// de 7 dias, e falha do Storage vira erro dito (nunca url nula com ok). Nomes inventados.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { linkDaPrevia, VALIDADE_DA_PREVIA_S } from "@/lib/storage/link-da-previa";

function storage(resposta: { data: { signedUrl: string } | null; error: { message: string } | null } | Error) {
  const pedidos: { bucket: string; path: string; segundos: number }[] = [];
  return {
    pedidos,
    sb: {
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: async (path: string, segundos: number) => {
            pedidos.push({ bucket, path, segundos });
            if (resposta instanceof Error) throw resposta;
            return resposta;
          },
        }),
      },
    },
  };
}

describe("link da prévia", () => {
  it("pede link assinado de 7 dias e diz quando vence", async () => {
    const { sb, pedidos } = storage({ data: { signedUrl: "https://exemplo.test/storage/v1/object/sign/reports/preview/x.pdf?token=abc" }, error: null });
    const r = await linkDaPrevia(sb, "reports", "preview/loja-teste-2026-11-25.pdf", new Date("2026-11-25T12:00:00Z"));
    expect(pedidos).toEqual([{ bucket: "reports", path: "preview/loja-teste-2026-11-25.pdf", segundos: 604800 }]);
    expect(VALIDADE_DA_PREVIA_S).toBe(604800);
    expect(r).toEqual({ ok: true, url: expect.stringContaining("/object/sign/"), venceEm: "2026-12-02T12:00:00.000Z" });
  });

  it("erro do Storage (ou exceção) vira falha com motivo — nunca ok com url vazia", async () => {
    expect(await linkDaPrevia(storage({ data: null, error: { message: "Object not found" } }).sb, "reports", "p.pdf")).toEqual({ ok: false, erro: expect.stringMatching(/Object not found/) });
    expect(await linkDaPrevia(storage({ data: null, error: null }).sb, "reports", "p.pdf")).toMatchObject({ ok: false });
    expect(await linkDaPrevia(storage(new Error("rede")).sb, "reports", "p.pdf")).toEqual({ ok: false, erro: expect.stringMatching(/rede/) });
  });

  it("nenhuma rota de relatório usa mais getPublicUrl no bucket reports", () => {
    for (const f of ["app/api/system/weekly-reports/route.ts", "app/api/system/team-weekly/route.ts", "app/api/system/monthly-calendar/route.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/getPublicUrl/);
      expect(src, f).toMatch(/linkDaPrevia\(/);
    }
  });
});
