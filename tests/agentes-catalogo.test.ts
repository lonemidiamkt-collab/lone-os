// tests/agentes-catalogo.test.ts — o catálogo de agentes bate com o código.
//
// O que isto protege: agente apontando para rotina que não existe (a Central mostraria horário errado),
// arquivo que mudou de lugar, etiqueta que nenhum código usa (agente fantasma), duas áreas com o mesmo
// nome de agente, e código apagado na faxina voltando sem ninguém perceber.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  AGENTES, ALCANCES, AREAS, CONTADOS_NO_INVENTARIO, REMOVIDOS_NA_FAXINA, agenteDaExecucao, agenteDaOrigem, type Agente,
} from "@/lib/agentes/catalogo";
import { automacaoPorId } from "@/lib/automacoes/registro";

const RAIZ = path.resolve(__dirname, "..");
const agentes = AGENTES as readonly Agente[];

function codigo(): string {
  const out: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      if (nome === "node_modules" || nome.startsWith(".")) continue;
      const p = path.join(dir, nome);
      if (statSync(p).isDirectory()) andar(p);
      else if (/\.(ts|tsx)$/.test(nome)) out.push(readFileSync(p, "utf8"));
    }
  };
  for (const d of ["app", "lib", "components"]) andar(path.join(RAIZ, d));
  return out.join("\n");
}

describe("catálogo de agentes", () => {
  it("são 49: os 50 do inventário menos o que saiu na faxina", () => {
    expect(agentes.length).toBe(CONTADOS_NO_INVENTARIO - REMOVIDOS_NA_FAXINA.length);
    expect(agentes.length).toBe(49);
  });

  it("id e nome únicos", () => {
    expect(new Set(agentes.map((a) => a.id)).size).toBe(agentes.length);
    expect(new Set(agentes.map((a) => a.nome.toLowerCase())).size).toBe(agentes.length);
  });

  it("cada agente diz o que faz, a área, o dono, o alcance, o gatilho e a etiqueta", () => {
    for (const a of agentes) {
      expect(a.faz.length, a.id).toBeGreaterThan(20);
      expect(AREAS, a.id).toContain(a.area);
      expect(a.dono.trim(), a.id).not.toBe("");
      expect(ALCANCES, a.id).toContain(a.alcance);
      expect(a.gatilhos.length, a.id).toBeGreaterThan(0);
      expect(a.origens.length, a.id).toBeGreaterThan(0);
      expect(a.modelo.trim(), a.id).not.toBe("");
    }
  });

  it("toda rotina citada existe na Central de Automações (e liga/desliga por lá)", () => {
    for (const a of agentes) {
      for (const g of a.gatilhos) if (g.tipo === "cron") expect(automacaoPorId(g.automacao), `${a.id} → ${g.automacao}`).toBeTruthy();
      for (const i of a.interruptores) {
        if (i.tipo !== "automacao") continue;
        const r = automacaoPorId(i.job);
        expect(r, `${a.id} → ${i.job}`).toBeTruthy();
        expect(r?.controlavel, `${a.id} → ${i.job}`).toBe(true);
      }
    }
  });

  it("quem roda dentro do webhook do Loninho obedece ao interruptor geral", () => {
    for (const a of agentes.filter((x) => x.noLoninho)) {
      expect(a.interruptores.some((i) => i.tipo === "loninho"), a.id).toBe(true);
      expect(a.gatilhos.some((g) => g.tipo === "webhook"), a.id).toBe(true);
    }
  });

  it("uma etiqueta é de um agente só; curinga anda sozinho", () => {
    const todas = agentes.flatMap((a) => a.origens);
    expect(new Set(todas).size).toBe(todas.length);
    for (const a of agentes) {
      for (const o of a.origens) expect(agenteDaOrigem(o.endsWith(":*") ? `${o.slice(0, -1)}teste` : o)?.id, o).toBe(a.id);
      if (a.origens.some((o) => o.endsWith(":*"))) expect(a.origens.length, a.id).toBe(1);
      for (const e of a.execucoes ?? []) expect(agenteDaExecucao(e)?.id, e).toBe(a.id);
    }
  });

  it("os arquivos citados existem", () => {
    const faltando = agentes.flatMap((a) => a.arquivos.filter((f) => !existsSync(path.join(RAIZ, f))).map((f) => `${a.id}: ${f}`));
    expect(faltando).toEqual([]);
  });

  it("toda etiqueta e toda execução do catálogo aparecem no código (nada de agente fantasma)", () => {
    const fonte = codigo();
    const mortas: string[] = [];
    for (const a of agentes) {
      for (const o of a.origens) {
        const procura = o.endsWith(":*") ? o.slice(0, -1) : o;
        if (!fonte.includes(`"${procura}`) && !fonte.includes(`\`${procura}`)) mortas.push(`${a.id}: ${o}`);
      }
      for (const e of a.execucoes ?? []) if (!fonte.includes(`"${e}"`)) mortas.push(`${a.id}: execução ${e}`);
    }
    expect(mortas).toEqual([]);
  });

  it("variável do servidor citada como interruptor é lida no código", () => {
    const fonte = codigo();
    for (const a of agentes) for (const i of a.interruptores) {
      if (i.tipo === "env") expect(fonte.includes(`process.env.${i.variavel}`), `${a.id}: ${i.variavel}`).toBe(true);
      if (i.tipo === "agency_settings") expect(fonte.includes(`"${i.chave}"`), `${a.id}: ${i.chave}`).toBe(true);
    }
  });
});

describe("faxina de 25/10/2026", () => {
  it("o código sem uso não voltou", () => {
    for (const p of [
      "components/MorningBriefing.tsx",
      "app/api/ai/morning-briefing/route.ts",
      "app/api/ai/critical-alerts/route.ts",
      "app/api/cs/legendas-em-lote/route.ts",
      "app/api/cs/roteiro/route.ts",
      "app/api/cs/verificar-arte-regras/route.ts",
    ]) expect(existsSync(path.join(RAIZ, p)), p).toBe(false);
    expect(readFileSync(path.join(RAIZ, "lib/traffic/imagem-variacao.ts"), "utf8")).not.toMatch(/function gerarVariacoesImagem/);
  });

  it("o manual não anuncia mais o Morning Briefing como recurso", () => {
    const sobre = readFileSync(path.join(RAIZ, "app/sobre/page.tsx"), "utf8");
    expect(sobre).not.toMatch(/Morning Briefing \(IA\) analisa|Briefing matinal gerado por IA|Morning Briefing praticamente/);
    expect(sobre).toMatch(/id: "agentes"/);
  });
});
