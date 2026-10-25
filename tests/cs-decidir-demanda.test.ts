// tests/cs-decidir-demanda.test.ts — "Descartar pedido" no /agente tem dono e tem volta (auditoria
// 25/10/2026, 11.4).
//
// O erro original: um clique descartava, sem confirmar nem desfazer; o POST aceitava qualquer logado
// (designer e comercial inclusive) e não conferia o update. O pedido só voltava por SQL.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { nomeDeQuemDecide, podeDecidirDemanda, podeReabrir, DESFAZER_DESCARTE_S } from "@/lib/cs/decidir-demanda";

const RAIZ = path.resolve(__dirname, "..");

describe("quem decide o pedido do cliente pela plataforma", () => {
  it("gestão, social e tráfego; designer, comercial e sem papel, não", () => {
    for (const p of ["admin", "manager", "social", "traffic"] as const) expect(podeDecidirDemanda(p)).toBe(true);
    for (const p of ["designer", "comercial", null, undefined] as const) expect(podeDecidirDemanda(p)).toBe(false);
  });

  it("quem descartou fica registrado pelo nome do cadastro", () => {
    expect(nomeDeQuemDecide("Julio Cesar", "julio@lonemidia.com")).toBe("Julio Cesar");
    expect(nomeDeQuemDecide(null, "carlos@lonemidia.com")).toBe("carlos");
  });
});

describe("voltar para pendente (o Desfazer)", () => {
  it("só o descartado volta; o confirmado já virou card", () => {
    expect(podeReabrir({ status: "descartada" }, false)).toEqual({ ok: true });
    expect(podeReabrir({ status: "confirmada" }, false).ok).toBe(false);
    expect(podeReabrir({ status: "pendente" }, false).ok).toBe(false);
  });

  it("código curto em uso por outro pendente: não reabre (o 'ok <código>' ficaria ambíguo)", () => {
    const r = podeReabrir({ status: "descartada" }, true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/mesmo código/);
  });

  it("o Desfazer fica na tela por alguns segundos", () => {
    expect(DESFAZER_DESCARTE_S).toBeGreaterThanOrEqual(5);
  });
});

describe("a rota e a tela", () => {
  const rota = readFileSync(path.join(RAIZ, "app/api/cs/decide/route.ts"), "utf8");
  const tela = readFileSync(path.join(RAIZ, "components/agente/DecidirDemanda.tsx"), "utf8");

  it("o POST confere o papel antes de qualquer coisa", () => {
    const post = rota.slice(rota.indexOf("export async function POST"));
    expect(post.indexOf("podeDecidirDemanda(papel)")).toBeGreaterThan(0);
    expect(post.indexOf("podeDecidirDemanda(papel)")).toBeLessThan(post.indexOf("req.json()"));
  });

  it("o descarte confere o erro e só vale se ainda está pendente", () => {
    const descarte = rota.slice(rota.indexOf('status: "descartada", decided_at'));
    expect(descarte.slice(0, 200)).toContain('.eq("id", id).eq("status", "pendente").select("id")');
    expect(rota).toContain("if (errDesc)");
  });

  it("a tela oferece Desfazer, que chama o reabrir", () => {
    expect(tela).toContain(">Desfazer</button>");
    expect(tela).toContain('acao: "reabrir"');
  });
});
