// @vitest-environment node
// tests/modelos-num-lugar.test.ts — leva 1-M (25/11/2026). gpt-4o, gpt-4o-mini, gpt-4o-mini-tts e
// whisper-1 saem da API entre 06/01 e 26/02/2027. O nome do modelo só pode estar em lib/ai/modelos.ts
// (e nas tabelas de preço): assim a troca é num lugar só e nenhum agente fica para trás.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DESLIGAMENTO_NA_API, MODELO_FORTE, MODELO_IMAGEM, MODELO_RAPIDO, MODELO_TRANSCRICAO, MODELO_VOZ } from "@/lib/ai/modelos";

const PERMITIDOS = new Set(["lib/ai/modelos.ts", "lib/obs/preco-llm.ts", "lib/obs/llm.ts"]);
const NOME = /["'`](gpt-4o-mini-tts|gpt-4o-mini|gpt-4o|whisper-1|gpt-image-[\w.-]+|gpt-realtime-[\w.-]+)["'`]/;

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === "node_modules" || n.startsWith(".") ? [] : arquivos(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe("modelo da OpenAI num lugar só", () => {
  it("nenhum arquivo do app escreve o nome do modelo (fora lib/ai/modelos.ts e as tabelas de preço)", () => {
    const fora: string[] = [];
    for (const f of ["app", "lib", "components"].flatMap(arquivos)) {
      if (PERMITIDOS.has(f)) continue;
      readFileSync(f, "utf8").split("\n").forEach((l, i) => {
        const codigo = l.replace(/\/\/.*$/, ""); // comentário pode citar o nome
        if (NOME.test(codigo)) fora.push(`${f}:${i + 1}`);
      });
    }
    expect(fora).toEqual([]);
  });

  it("esta leva não trocou nenhum modelo (valores de antes) e sabe quando cada um sai", () => {
    expect([MODELO_RAPIDO, MODELO_FORTE, MODELO_VOZ, MODELO_TRANSCRICAO]).toEqual(["gpt-4o-mini", "gpt-4o", "gpt-4o-mini-tts", "whisper-1"]);
    expect(DESLIGAMENTO_NA_API[MODELO_RAPIDO]).toBe("2027-01-14");
    expect(DESLIGAMENTO_NA_API[MODELO_VOZ]).toBe("2027-01-06");
    expect(DESLIGAMENTO_NA_API[MODELO_TRANSCRICAO]).toBe("2027-02-26");
  });

  it("imagem: gpt-image-1 saiu da API em 23/10/2026 — a arte usa o substituto indicado pela OpenAI", () => {
    expect(MODELO_IMAGEM).not.toBe("gpt-image-1");
    expect(MODELO_IMAGEM).toMatch(/^gpt-image-2\.5-(sunburst|flare)$/);
  });
});
