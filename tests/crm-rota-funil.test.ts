// tests/crm-rota-funil.test.ts — Rota Lagos → funil não duplica histórico nem esquece o aviso (auditoria
// 25/10/2026, 14.4 e 14.5).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { juntarAvisos, lerPendentes, MAX_PENDENTES } from "@/lib/crm/rota-aviso-pendente";

const loja = (empresa: string, telefone: string | null = null) => ({ empresa, contatoNome: null, telefone, cidade: "Araruama", segmento: null, por: "Kayo" });

describe("14.5 — o aviso que não saiu fica para a próxima rodada", () => {
  it("o que estava pendente entra no próximo aviso, sem repetir loja", () => {
    const r = juntarAvisos([loja("Casa das Tintas", "5522999990000")], [loja("casa das tintas", "55 22 99999-0000"), loja("Armazém do Ferro")]);
    expect(r.map((l) => l.empresa)).toEqual(["Casa das Tintas", "Armazém do Ferro"]);
  });

  it("teto: grupo fora por dias não vira um livro", () => {
    const muitas = Array.from({ length: MAX_PENDENTES + 10 }, (_, i) => loja(`Loja ${i}`));
    expect(juntarAvisos(muitas, [])).toHaveLength(MAX_PENDENTES);
  });

  it("valor guardado estragado = nada pendente (não derruba a rodada)", () => {
    expect(lerPendentes("{")).toEqual([]);
    expect(lerPendentes(null)).toEqual([]);
    expect(lerPendentes(JSON.stringify([loja("A"), { x: 1 }]))).toEqual([loja("A")]);
  });

  it("a rota só responde ok quando o aviso saiu, e guarda o que não saiu", () => {
    const rota = readFileSync(path.resolve(__dirname, "../app/api/system/crm-rota/route.ts"), "utf8");
    expect(rota).toContain("ok: erros.length === 0 && grupo !== false");
    expect(rota).toContain("value: JSON.stringify(lojasAviso)");
  });
});

describe("14.4 — sem ler as visitas já registradas, não grava nada", () => {
  it("o erro original: a leitura falhava em silêncio e cada rodada regravava todas as visitas", () => {
    const rota = readFileSync(path.resolve(__dirname, "../app/api/system/crm-rota/route.ts"), "utf8");
    const i = rota.indexOf("if (errRegistradas)");
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(rota.indexOf("await gravarPlano(novas)"));
  });
});
