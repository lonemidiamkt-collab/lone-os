// @vitest-environment node
// Conferência de entrega que não conseguiu conferir (auditoria 21/10/2026, item 5.13). Dados INVENTADOS.
//
// O QUE ACONTECIA: se o log de envios não pudesse ser lido, a conferência voltava vazia — "0 problemas" — e nada era
// avisado. Agora volta com `erro` e o grupo interno recebe "não consegui conferir".
import { describe, it, expect, vi, beforeEach } from "vitest";

let erroLeitura: { message: string } | null = null;
let linhas: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in"]) q[m] = () => q;
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: erroLeitura ? null : linhas, error: erroLeitura }).then(ok);
      return q;
    },
  },
}));
const avisos: string[] = [];
vi.mock("@/lib/cs/notify", () => ({ csSendGroupText: async (_j: string, t: string) => { avisos.push(t); return { ok: true }; } }));

const { conferirEntrega, conferirEAvisar, textoConferencia } = await import("@/lib/cs/entregas");
const elegiveis = [{ id: "c1", nome: "Loja Exemplo" }, { id: "c2", nome: "Telhas Beta" }];

beforeEach(() => { erroLeitura = null; linhas = []; avisos.length = 0; process.env.CS_INTERNAL_GROUP_JID = "interno@g.us"; });

describe("não conferiu ≠ 0 problemas", () => {
  it("o erro original: leitura falhava e voltava vazio (nenhum aviso) — agora volta com erro", async () => {
    erroLeitura = { message: "timeout do banco" };
    const conf = await conferirEntrega("report", "2026-10-24", elegiveis);
    expect(conf.erro).toBe("timeout do banco");
    expect(textoConferencia({ ...conf, elegiveis: 2 })).toMatch(/Não consegui conferir a entrega \(relatório\)[\s\S]*timeout do banco[\s\S]*eram 2/);
  });
  it("conferirEAvisar manda o 'não consegui conferir' para o grupo interno", async () => {
    erroLeitura = { message: "timeout do banco" };
    const conf = await conferirEAvisar("support", "2026-10-24", elegiveis);
    expect(conf?.erro).toBeTruthy();
    expect(avisos[0]).toMatch(/Não consegui conferir a entrega \(mensagem de suporte\)/);
  });
  it("tudo entregue continua sem aviso", async () => {
    linhas = [{ client_id: "c1", status: "sent", error: null }, { client_id: "c2", status: "sent", error: null }];
    const conf = await conferirEAvisar("report", "2026-10-24", elegiveis);
    expect(conf?.erro).toBeUndefined();
    expect(avisos).toHaveLength(0);
  });
});
