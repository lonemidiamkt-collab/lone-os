// tests/aviso-nominal.test.ts — menção de verdade no formato que o volume pedir, e o ?dry=1 que
// não manda nada. Em texto, @número no corpo; em PDF, nome no corpo e a menção na legenda.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/cs/mencao", () => ({
  mencionar: async (n: string) => n === "Carlos"
    ? { trecho: "@5522999999999", jids: ["5522999999999@s.whatsapp.net"], notifica: true }
    : { trecho: n.split(/\s+/)[0], jids: [], notifica: false },
}));

const enviados: { texto: string; mencionados?: string[] }[] = [];
vi.mock("@/lib/cs/notify", () => ({
  csSendGroupText: async (_jid: string, texto: string, _q?: string, _m?: unknown, mencionados?: string[]) => {
    enviados.push({ texto, mencionados });
    return { ok: true };
  },
}));

import { avisoNominal, type Rotulo } from "@/lib/cs/aviso-nominal";

beforeEach(() => { enviados.length = 0; });

const donos = ["Carlos", "Thiago"];
const curto = (r: Rotulo) => `👤 ${r("Carlos")}\n• Paradise — postar\n\n👤 ${r("Thiago")}\n• Atlas — postar`;
const longo = (r: Rotulo) => [`👤 ${r("Carlos")}`, ...Array.from({ length: 8 }, (_, i) => `• Cliente ${i} — postar`)].join("\n");
const resumo = (r: Rotulo) => `👤 ${r("Carlos")} · ${r("Thiago")}`;

describe("avisoNominal", () => {
  it("texto curto: @número no corpo de quem tem número, nome em negrito de quem não tem", async () => {
    const r = await avisoNominal({ jid: "g", dry: true, donos, titulo: "T", montar: curto, resumo, meta: {} });
    expect(r.formato).toBe("texto");
    expect(r.texto).toContain("👤 @5522999999999");
    expect(r.texto).toContain("👤 *Thiago*");
    expect(r.legenda).toBeNull();
    expect(r.mencionados).toEqual(["5522999999999@s.whatsapp.net"]);
  });

  it("volume de PDF: corpo com nomes (número no PDF não notifica) e menção na legenda", async () => {
    const r = await avisoNominal({ jid: "g", dry: true, donos, titulo: "Bom dia, time", montar: longo, resumo, meta: {} });
    expect(r.formato).toBe("pdf");
    expect(r.texto).toContain("👤 *Carlos*");
    expect(r.texto).not.toContain("@5522");
    expect(r.legenda).toBe("📋 *Bom dia, time*\n👤 @5522999999999 · *Thiago*");
  });

  it("?dry=1 não envia nada", async () => {
    await avisoNominal({ jid: "g", dry: true, donos, titulo: "T", montar: curto, resumo, meta: {} });
    expect(enviados).toHaveLength(0);
  });

  it("sem dry, o texto sai com a menção real (JIDs no envio)", async () => {
    const r = await avisoNominal({ jid: "g", dry: false, donos, titulo: "T", montar: curto, resumo, meta: {} });
    expect(r.enviado).toBe(true);
    expect(enviados).toHaveLength(1);
    expect(enviados[0].texto).toBe(r.texto);
    expect(enviados[0].mencionados).toEqual(["5522999999999@s.whatsapp.net"]);
  });
});
