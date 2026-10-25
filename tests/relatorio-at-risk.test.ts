// @vitest-environment node
// Relatório mensal para cliente "at_risk" (auditoria 21/10/2026, item 5.11). Dados INVENTADOS.
//
// O QUE ACONTECIA: selectActiveMetaClients filtrava status good/average/onboarding — o cliente "em risco", o que mais
// precisa de atenção, ficava sem relatório. E, com ele dentro, o ex-cliente (encerrado grava active=false e mantém o
// status) voltaria a receber: o filtro de ex-cliente entra junto, como no selectActiveClientsWithGroup.
import { describe, it, expect, vi } from "vitest";

type Linha = Record<string, unknown>;
const carteira: Linha[] = [
  { id: "a", name: "Loja Boa", status: "good", active: true, draft_status: null, meta_ad_account_id: "act_1" },
  { id: "b", name: "Loja em Risco", status: "at_risk", active: true, draft_status: null, meta_ad_account_id: "act_2" },
  { id: "c", name: "Ex-Cliente", status: "at_risk", active: false, draft_status: null, meta_ad_account_id: "act_3" },
  { id: "d", name: "Rascunho", status: "onboarding", active: true, draft_status: "pending_invite", meta_ad_account_id: "act_4" },
];
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: () => {
      const filtros: ((r: Linha) => boolean)[] = [];
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.order = () => q;
      q.in = (c: string, vs: unknown[]) => { filtros.push((r) => vs.includes(r[c])); return q; };
      q.is = (c: string, v: unknown) => { filtros.push((r) => (r[c] ?? null) === v); return q; };
      q.neq = (c: string, v: unknown) => { filtros.push((r) => r[c] !== v); return q; };
      q.eq = (c: string, v: unknown) => { filtros.push((r) => r[c] === v); return q; };
      q.not = () => q;
      q.or = () => q;
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: carteira.filter((r) => filtros.every((f) => f(r))), error: null }).then(ok);
      return q;
    },
  },
}));

const { selectActiveMetaClients } = await import("@/lib/traffic/weekly-report");

describe("quem entra no relatório mensal", () => {
  it("o erro original: 'at_risk' ficava de fora — agora entra; ex-cliente e rascunho continuam fora", async () => {
    const nomes = (await selectActiveMetaClients()).map((c) => c.name);
    expect(nomes).toEqual(["Loja Boa", "Loja em Risco"]);
  });
});
