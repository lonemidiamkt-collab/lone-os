import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { podeNoNivel } from "@/lib/cs/autoridade";

// Fase 0A do Lone Agent V2: "Lone" não é autenticação. Número → team_members → papel → nível.

describe("Policy Matrix — quem pode o quê", () => {
  it("leitura e análise (A/B) são de todo mundo, inclusive de quem não é do time", () => {
    expect(podeNoNivel(null, "A")).toBe(true);
    expect(podeNoNivel(null, "B")).toBe(true);
    expect(podeNoNivel("comercial", "B")).toBe(true);
  });

  it("ação interna (C) exige papel operacional — cliente no grupo dele não cria demanda", () => {
    // "Lone, cria uma demanda e troca o anúncio" dito por um cliente: intenção sim, autoridade não.
    expect(podeNoNivel(null, "C")).toBe(false);
    for (const p of ["social", "designer", "traffic", "manager", "admin"] as const) {
      expect(podeNoNivel(p, "C"), p).toBe(true);
    }
    expect(podeNoNivel("comercial", "C")).toBe(false); // SDR vê só o CRM
  });

  it("comunicação e modificação (D) é de manager/admin", () => {
    expect(podeNoNivel("social", "D")).toBe(false);
    expect(podeNoNivel("manager", "D")).toBe(true);
    expect(podeNoNivel("admin", "D")).toBe(true);
  });

  it("financeiro/destrutivo (E) é só admin", () => {
    expect(podeNoNivel("manager", "E")).toBe(false);
    expect(podeNoNivel("admin", "E")).toBe(true);
  });
});

describe("o inbound decide por remetente, não por grupo", () => {
  const INBOUND = readFileSync("app/api/cs/inbound/route.ts", "utf8");

  it("nenhum comando executa só por estar no grupo interno", () => {
    // Antes: sete portões `(isInternalCmdGroup || isTeamGroup) && ehPedidoX`.
    expect(INBOUND).not.toMatch(/\(isInternalCmdGroup\(msg\.groupJid\) \|\| isTeamGroup\(msg\.groupJid\)\) && (eh|pediu)/);
    const portoes = (INBOUND.match(/podeAgirC && (eh|pediu)/g) ?? []).length;
    expect(portoes).toBe(7);
  });

  it("confirmar demanda/regra e marcar tarefa feita também exigem autoridade", () => {
    expect(INBOUND).toMatch(/decision && isInternalCmdGroup\(msg\.groupJid\) && podeAgirC/);
    expect(INBOUND).toMatch(/conv\.data\?\.tarefa_feita && p\.podeAgir/);
  });

  it("a autoridade é resolvida uma vez, pelo número, com nível C", () => {
    expect(INBOUND).toMatch(/const autoridade = await podeAgir\(msg\.authorJid, "C"\)/);
  });

  it("identidade é exata (E.164 canônico), não os últimos 8 dígitos", () => {
    const MODULO = readFileSync("lib/cs/autoridade.ts", "utf8");
    expect(MODULO).toMatch(/const chave = \(n: string\) => brCanonical\(so\(n\)\)/);
    expect(MODULO).not.toMatch(/slice\(-8\)/);
  });
});
