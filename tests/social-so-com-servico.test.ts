import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { temSocial } from "@/lib/clients/servico";

// 30/09/2026: Dr. Júnior e JP Barbearia (só tráfego) apareciam no quadro do social do Carlos — o
// social antigo ficava gravado quando o serviço trocava. A regra passou a morar no banco
// (trg_social_so_com_servico), com a lista de serviços COPIADA de lib/clients/servico.ts. Este
// teste é o que impede as duas listas de divergirem em silêncio.
const SQL = readFileSync("supabase/migrations/20260930130000_social_so_com_servico.sql", "utf8");
const listaDoBanco = (() => {
  const m = SQL.match(/not in\s*\(([^)]*)\)/i);
  return (m?.[1] ?? "").match(/'([^']+)'/g)?.map((x) => x.slice(1, -1)) ?? [];
})();

const TODOS = ["lone_growth", "assessoria_trafego", "assessoria_social", "trafego_pago", "trafego_social_site", "assessoria_design", "site"];

describe("social só em quem contratou social", () => {
  it("o banco e o código concordam sobre quem tem social", () => {
    expect(listaDoBanco.length).toBeGreaterThan(0);
    for (const s of TODOS) expect(listaDoBanco.includes(s)).toBe(temSocial({ service_type: s }));
  });

  it("só tráfego não tem social — é o caso do Dr. Júnior e da JP", () => {
    expect(temSocial({ service_type: "assessoria_trafego" })).toBe(false);
    expect(temSocial({ service_type: "trafego_pago" })).toBe(false);
  });

  it("Lone Growth e Assessoria Social têm", () => {
    expect(temSocial({ service_type: "lone_growth" })).toBe(true);
    expect(temSocial({ service_type: "assessoria_social" })).toBe(true);
  });
});
