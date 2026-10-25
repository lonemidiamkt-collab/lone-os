// tests/agentes-etiqueta.test.ts — TODA CHAMADA DE IA SAI COM A ETIQUETA DO AGENTE.
//
// Até 25/10/2026, chamada sem etiqueta ganhava o nome do arquivo da pilha. No servidor a pilha é a do
// código compilado: ~1.400 chamadas por mês apareciam como "app/.next/server/app/api/ai/morning-briefing/route",
// uma tela que nem estava montada, e não dava para saber quanto cada agente trabalhava.
//
// Este teste lê o código (a árvore sintática, não texto solto) e quebra quando:
//   · uma chamada de chatJson ou registrarChamadaLlm não tem `origem`;
//   · a etiqueta é um texto que não está no catálogo (lib/agentes/catalogo.ts);
//   · um arquivo chama a OpenAI direto (fetch) sem registrar a chamada em llm_calls;
//   · o tipo volta a aceitar chamada sem etiqueta, ou o palpite pela pilha volta.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { AGENTES, casaOrigem, type Agente } from "@/lib/agentes/catalogo";

const RAIZ = path.resolve(__dirname, "..");
const PASTAS = ["app", "lib", "components", "stores"];
const CHAMADAS_IA = new Set(["chatJson", "registrarChamadaLlm"]);
const ORIGENS = (AGENTES as readonly Agente[]).flatMap((a) => a.origens);

function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivos(p));
    else if (/\.(ts|tsx)$/.test(nome) && !nome.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

const naoCatalogada = (etiqueta: string) => !ORIGENS.some((o) => casaOrigem(etiqueta, o));
const prefixoCoberto = (prefixo: string) =>
  ORIGENS.some((o) => o.endsWith(":*") && prefixo.startsWith(o.slice(0, -1)));

/** Problemas com a expressão da etiqueta. Texto fixo tem que estar no catálogo; variável passa (o tipo OrigemIa confere). */
function problemasDaEtiqueta(e: ts.Expression): string[] {
  if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e)) return problemasDaEtiqueta(e.expression);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
    if (!e.text.trim()) return ["etiqueta vazia"];
    return naoCatalogada(e.text) ? [`etiqueta "${e.text}" não está no catálogo`] : [];
  }
  if (ts.isTemplateExpression(e)) {
    return prefixoCoberto(e.head.text) ? [] : [`etiqueta montada (\`${e.head.text}…\`) sem curinga no catálogo`];
  }
  if (ts.isBinaryExpression(e)) return [...problemasDaEtiqueta(e.left), ...problemasDaEtiqueta(e.right)];
  if (ts.isConditionalExpression(e)) return [...problemasDaEtiqueta(e.whenTrue), ...problemasDaEtiqueta(e.whenFalse)];
  if (e.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(e) && e.text === "undefined")) return ["etiqueta nula"];
  return []; // variável/parâmetro: quem confere é o tipo OrigemIa
}

interface Achado { onde: string; problema: string }

/** Varre um código-fonte e devolve as chamadas de IA sem etiqueta válida. */
function varrer(nomeArquivo: string, codigo: string): { chamadas: number; achados: Achado[] } {
  const sf = ts.createSourceFile(nomeArquivo, codigo, ts.ScriptTarget.Latest, true, nomeArquivo.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const achados: Achado[] = [];
  let chamadas = 0;
  const visitar = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && CHAMADAS_IA.has(n.expression.text)) {
      chamadas++;
      const linha = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
      const onde = `${nomeArquivo}:${linha}`;
      const arg = n.arguments[0];
      if (!arg || !ts.isObjectLiteralExpression(arg)) {
        achados.push({ onde, problema: "o argumento não é um objeto escrito ali — a etiqueta não dá para conferir" });
      } else {
        const prop = arg.properties.find((p) => p.name && ts.isIdentifier(p.name) && p.name.text === "origem");
        if (!prop) achados.push({ onde, problema: "chamada de IA sem etiqueta (origem)" });
        else if (ts.isPropertyAssignment(prop)) {
          for (const problema of problemasDaEtiqueta(prop.initializer)) achados.push({ onde, problema });
        }
        // { origem } (atalho) = variável: o tipo OrigemIa confere.
      }
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
  return { chamadas, achados };
}

describe("etiqueta obrigatória em toda chamada de IA", () => {
  const fontes = PASTAS.flatMap((p) => arquivos(path.join(RAIZ, p)))
    .map((f) => ({ rel: path.relative(RAIZ, f), codigo: readFileSync(f, "utf8") }));

  it("toda chamada de chatJson e registrarChamadaLlm leva uma etiqueta do catálogo", () => {
    let total = 0;
    const achados: Achado[] = [];
    for (const f of fontes) {
      if (!f.codigo.includes("chatJson") && !f.codigo.includes("registrarChamadaLlm")) continue;
      const r = varrer(f.rel, f.codigo);
      total += r.chamadas;
      achados.push(...r.achados);
    }
    // Sanidade: o varredor achou as chamadas (eram 64 pontos em 25/10/2026).
    expect(total).toBeGreaterThan(50);
    expect(achados.map((a) => `${a.onde} — ${a.problema}`)).toEqual([]);
  });

  it("quem chama a OpenAI direto (fetch) registra a chamada em llm_calls", () => {
    const semRecibo = fontes
      .filter((f) => f.codigo.includes("api.openai.com/v1/"))
      .filter((f) => !/registrarChamadaLlm\s*\(/.test(f.codigo))
      .map((f) => f.rel);
    expect(semRecibo).toEqual([]);
  });

  it("o tipo não aceita chamada sem etiqueta e o palpite pela pilha não volta", () => {
    const openai = readFileSync(path.join(RAIZ, "lib/ai/openai.ts"), "utf8");
    const llm = readFileSync(path.join(RAIZ, "lib/obs/llm.ts"), "utf8");
    expect(openai).toMatch(/\n\s+origem: OrigemIa;/);
    expect(llm).toMatch(/\n\s+origem: OrigemIa;/);
    expect(llm).not.toMatch(/origemDaPilha|new Error\(\)\.stack/);
  });

  // O teste acima só vale se o varredor enxerga o erro. Prova com código de mentira.
  it("o varredor pega chamada sem etiqueta, etiqueta fora do catálogo e argumento que não dá para ler", () => {
    const codigo = [
      `const a = await chatJson({ model: "gpt-4o-mini", system: "origem: não é propriedade", user: "x" });`,
      `const b = await chatJson<{ x: string }>({ model: "gpt-4o", origem: "cs:inventada" });`,
      `registrarChamadaLlm(opcoes);`,
      `const c = await chatJson({ model: "gpt-4o", origem: "cs:classificador" });`,
      `const d = await chatJson({ model: "gpt-4o", origem: \`prospeccao:followup_\${n}\` });`,
      `const e = await chatJson({ model: "gpt-4o", origem: \`cs:\${tipo}\` });`,
      `const f = await chatJson({ model: "gpt-4o", origem: p.origem ?? "social:roteiros" });`,
    ].join("\n");
    const r = varrer("exemplo.ts", codigo);
    expect(r.chamadas).toBe(7);
    expect(r.achados.map((a) => a.onde)).toEqual(["exemplo.ts:1", "exemplo.ts:2", "exemplo.ts:3", "exemplo.ts:6"]);
  });
});
