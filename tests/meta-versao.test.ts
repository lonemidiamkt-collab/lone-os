// @vitest-environment node
// tests/meta-versao.test.ts — a versão da Graph API mora num lugar só (lib/meta/config.ts).
// 04/11/2026: 17 arquivos tinham "v21.0" escrito à mão e 2 tinham "v20.0". A v21.0 da Graph API para de
// responder em 21/01/2027; subir a versão precisa ser UMA linha, e ninguém pode voltar a fixar a versão
// num arquivo solto (ele ficaria para trás calado na próxima troca).

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { GRAPH_URL, META_GRAPH_VERSION, META_CONFIG, getGraphUrl } from "@/lib/meta/config";

const RAIZ = join(__dirname, "..");
const PASTAS = ["app", "lib", "components", "scripts"];

function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivos(p));
    else if (/\.(ts|tsx|js|mjs)$/.test(nome)) out.push(p);
  }
  return out;
}

describe("versão da Graph API", () => {
  it("nenhum arquivo escreve a versão à mão (só lib/meta/config.ts)", () => {
    const fora = PASTAS.flatMap((d) => arquivos(join(RAIZ, d)))
      .filter((f) => !f.endsWith(join("lib", "meta", "config.ts")))
      .filter((f) => /facebook\.com\/v\d+\.\d+/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(RAIZ.length + 1));
    expect(fora).toEqual([]);
  });

  it("v25 ou mais nova (a v21 para em 21/01/2027) e todos os jeitos de montar a URL concordam", () => {
    expect(Number(META_GRAPH_VERSION.replace(/^v/, ""))).toBeGreaterThanOrEqual(25);
    expect(GRAPH_URL).toBe(`https://graph.facebook.com/${META_GRAPH_VERSION}`);
    expect(META_CONFIG.graphApiVersion).toBe(META_GRAPH_VERSION);
    expect(getGraphUrl("/me")).toBe(`${GRAPH_URL}/me`);
  });
});
