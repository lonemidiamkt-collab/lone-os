// @vitest-environment node
// tests/tokens-opacidade.test.ts — classe de cor que o Tailwind NÃO gera.
//
// O que isto protege: `bg-lone-warning/10`, `text-popover-foreground/50` e afins não geram CSS
// nenhum (o token é `var(--x)` puro, o Tailwind não sabe aplicar alfa) — o elemento fica sem
// fundo/borda/cor e ninguém percebe. Também pega passo de opacidade fora da escala (`/12`) e
// token `lone-*` que não existe (`bg-lone-success-icon-bg`).
//
// A lista de tokens sem canal sai do tailwind.config.ts, não é fixa aqui: channelizou um token
// lá (rgb(var(--x-rgb) / <alpha-value>)), ele passa a aceitar `/NN` sozinho.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import resolveConfig from "tailwindcss/resolveConfig";
import tailwindConfig from "../tailwind.config";

const RAIZ = path.resolve(__dirname, "..");
const PASTAS = ["app", "components"];

type ValorCor = string | ((...args: unknown[]) => unknown) | { [k: string]: ValorCor };

const tema = resolveConfig(tailwindConfig).theme as unknown as {
  colors: Record<string, ValorCor>;
  opacity: Record<string, string>;
  fontSize: Record<string, unknown>;
};

/** achata { lone: { danger: "var(..)", bg: { card: ".." } } } → { "lone-danger": .., "lone-bg-card": .. } */
function achatar(obj: Record<string, ValorCor>, prefixo = ""): Map<string, ValorCor> {
  const out = new Map<string, ValorCor>();
  for (const [k, v] of Object.entries(obj)) {
    const nome = k === "DEFAULT" ? prefixo : prefixo ? `${prefixo}-${k}` : k;
    if (v && typeof v === "object") {
      for (const [kk, vv] of achatar(v as Record<string, ValorCor>, nome)) out.set(kk, vv);
    } else {
      out.set(nome, v);
    }
  }
  return out;
}

/** O Tailwind só aplica `/NN` se a cor for função, tiver <alpha-value>, ou for cor literal (hex/rgb). */
function aceitaOpacidade(v: ValorCor): boolean {
  if (typeof v === "function") return true;
  if (typeof v !== "string") return false;
  if (v.includes("<alpha-value>")) return true;
  if (v.includes("var(")) return false;
  return v !== "currentColor" && v !== "inherit";
}

const CORES = achatar(tema.colors);
const SEM_CANAL = new Set([...CORES].filter(([, v]) => !aceitaOpacidade(v)).map(([k]) => k));
const COM_CANAL = new Set([...CORES].filter(([, v]) => aceitaOpacidade(v)).map(([k]) => k));
const PASSOS = new Set(Object.keys(tema.opacity));
const TAMANHOS = new Set(Object.keys(tema.fontSize));

const UTIL =
  /^(bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|from|via|to|fill|stroke|outline|decoration|shadow|divide|placeholder|caret|accent)-(.+?)(?:\/(\[[^\]]+\]|[\w.]+))?$/;

interface Achado { onde: string; classe: string; motivo: string }

function problemasNaLinha(linha: string): { classe: string; motivo: string }[] {
  const out: { classe: string; motivo: string }[] = [];
  const tokens = linha
    .split(/[\s"'`{};<>]+/)
    .map((t) => t.replace(/^[(,]+|[),]+$/g, ""))
    .filter((t) => t && !t.includes("$"));
  for (const classe of new Set(tokens)) {
    const base = classe.split(":").pop()!.replace(/^!?-?/, "");
    const m = base.match(UTIL);
    if (!m) continue;
    const [, util, nome, alfa] = m;
    if (alfa !== undefined && SEM_CANAL.has(nome)) {
      out.push({ classe, motivo: `"${nome}" não tem canal de cor — /${alfa} não gera CSS` });
    } else if (alfa !== undefined && COM_CANAL.has(nome) && !alfa.startsWith("[") && !PASSOS.has(alfa)) {
      out.push({ classe, motivo: `/${alfa} não existe na escala de opacidade (use /[0.${alfa.padStart(2, "0")}] ou um passo da escala)` });
    } else if (nome.startsWith("lone-") && !CORES.has(nome) && !(util === "text" && TAMANHOS.has(nome))) {
      out.push({ classe, motivo: `token "${nome}" não existe no tailwind.config.ts` });
    }
  }
  return out;
}

function arquivos(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) arquivos(p, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("tokens de cor com opacidade", () => {
  it("a leitura do tailwind.config separa tokens com e sem canal", () => {
    expect(COM_CANAL.has("primary")).toBe(true);
    expect(COM_CANAL.has("destructive")).toBe(true);
    expect(SEM_CANAL.has("lone-danger")).toBe(true);
    expect(SEM_CANAL.has("popover")).toBe(true);
    expect(SEM_CANAL.has("overlay")).toBe(true);
  });

  it("o detector pega os casos quebrados e deixa passar os bons", () => {
    const ruins = problemasNaLinha(
      `className="bg-lone-warning/10 hover:text-popover-foreground/50 bg-primary/12 bg-lone-success-icon-bg"`,
    ).map((p) => p.classe);
    expect(ruins).toEqual([
      "bg-lone-warning/10",
      "hover:text-popover-foreground/50",
      "bg-primary/12",
      "bg-lone-success-icon-bg",
    ]);
    expect(
      problemasNaLinha(
        `cn("bg-primary/10 bg-card/[0.03] text-sm/6 bg-lone-warning-bg border-lone-border text-lone-h2 bg-red-500/20")`,
      ),
    ).toEqual([]);
  });

  it("nenhuma classe de cor em app/ e components/ fica sem CSS", () => {
    const achados: Achado[] = [];
    for (const pasta of PASTAS) {
      for (const arq of arquivos(path.join(RAIZ, pasta))) {
        const rel = path.relative(RAIZ, arq);
        readFileSync(arq, "utf8").split("\n").forEach((linha, i) => {
          for (const p of problemasNaLinha(linha)) achados.push({ onde: `${rel}:${i + 1}`, ...p });
        });
      }
    }
    const lista = achados.map((a) => `${a.onde}  ${a.classe}  — ${a.motivo}`).join("\n");
    expect(achados, `Classes que não geram CSS:\n${lista}`).toEqual([]);
  });

  it("nenhuma classe no formato [var(--x)]/NN (o Tailwind não gera opacidade sobre var)", () => {
    const achados: string[] = [];
    for (const pasta of PASTAS) {
      for (const arq of arquivos(path.join(RAIZ, pasta))) {
        const rel = path.relative(RAIZ, arq);
        readFileSync(arq, "utf8").split("\n").forEach((linha, i) => {
          for (const m of linha.matchAll(/\[var\(--[a-z0-9-]+\)\]\/\d+/g)) achados.push(`${rel}:${i + 1}  ${m[0]}`);
        });
      }
    }
    expect(achados, `Troque pelo token com canal (ex.: bg-chart-4/15):\n${achados.join("\n")}`).toEqual([]);
  });
});
