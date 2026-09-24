// tests/ficha-abas.test.ts — a ficha do cliente em seis abas (Leva 6B, E2).
//
// O que isto protege: link antigo (`/clients/<id>?tab=onboarding`, `?tab=chat`…) caindo no Resumo em
// vez do lugar certo, e seção-âncora apontando para um id que nenhuma aba renderiza.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ABAS_FICHA, ABA_ANTIGA, SECAO, resolverAba } from "@/components/client/ficha/abas";

const RAIZ = path.resolve(__dirname, "..");

function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivos(p));
    else if (/\.(ts|tsx)$/.test(nome)) out.push(p);
  }
  return out;
}

describe("seis abas, abrindo no Resumo", () => {
  it("as seis, nesta ordem", () => {
    expect(ABAS_FICHA.map((a) => a.rotulo)).toEqual(["Resumo", "Marca & Briefing", "Entregas", "Resultados", "Relacionamento", "Admin"]);
  });

  it("sem ?tab (ou desconhecido) → Resumo", () => {
    expect(resolverAba(null)).toEqual({ aba: "resumo" });
    expect(resolverAba("")).toEqual({ aba: "resumo" });
    expect(resolverAba("qualquer-coisa")).toEqual({ aba: "resumo" });
  });

  it("aba nova pelo nome", () => {
    for (const a of ABAS_FICHA) expect(resolverAba(a.id).aba).toBe(a.id);
  });
});

describe("toda aba que já existiu cai na aba nova certa", () => {
  // As 15 da faixa antiga + "reports" (saiu na Leva 1) + "reunioes" (link do Meu Trabalho).
  const ANTIGAS = ["overview", "dados", "inteligencia", "resultados", "analise-ia", "briefing", "contratos", "chat",
    "historico", "tasks", "content", "onboarding", "wallet", "portal", "ficha-viva", "reports", "reunioes"];

  it.each(ANTIGAS)("%s tem destino", (t) => {
    expect(!!ABA_ANTIGA[t] || ABAS_FICHA.some((a) => a.id === t), t).toBe(true);
  });

  it("os destinos que importam", () => {
    expect(resolverAba("onboarding")).toEqual({ aba: "admin", secao: SECAO.onboarding });
    expect(resolverAba("contratos")).toEqual({ aba: "admin", secao: SECAO.contrato });
    expect(resolverAba("chat").aba).toBe("relacionamento");
    expect(resolverAba("reunioes").aba).toBe("relacionamento");
    expect(resolverAba("ficha-viva").aba).toBe("marca");
    expect(resolverAba("resultados")).toEqual({ aba: "resultados" }); // mesmo nome da aba nova
    expect(resolverAba("dados").aba).toBe("admin");
    expect(resolverAba("content").aba).toBe("entregas");
  });

  it("todo `/clients/…?tab=X` escrito no código resolve para uma aba conhecida", () => {
    const achados: string[] = [];
    for (const f of [...arquivos(path.join(RAIZ, "app")), ...arquivos(path.join(RAIZ, "components")), ...arquivos(path.join(RAIZ, "lib"))]) {
      const txt = readFileSync(f, "utf8");
      for (const m of txt.matchAll(/\/clients\/\$\{[^}]+\}\?tab=([a-z-]+)/g)) achados.push(`${path.relative(RAIZ, f)}:${m[1]}`);
    }
    expect(achados.length).toBeGreaterThan(5);
    const perdidos = achados.filter((a) => {
      const tab = a.split(":").pop()!;
      return !ABA_ANTIGA[tab] && !ABAS_FICHA.some((x) => x.id === tab);
    });
    expect(perdidos).toEqual([]);
  });
});

describe("as âncoras existem nas abas", () => {
  it("cada seção de destino é renderizada por alguma aba", () => {
    const fonte = readdirSync(path.join(RAIZ, "components/client/ficha"))
      .filter((n) => n.startsWith("Aba") && n.endsWith(".tsx"))
      .map((n) => readFileSync(path.join(RAIZ, "components/client/ficha", n), "utf8"))
      .join("\n");
    const destinos = new Set(Object.values(ABA_ANTIGA).map((d) => d.secao).filter(Boolean) as string[]);
    const chaveDe = (valor: string) => Object.entries(SECAO).find(([, v]) => v === valor)?.[0];
    for (const s of destinos) {
      const chave = chaveDe(s);
      expect(chave, s).toBeTruthy();
      expect(fonte.includes(`SECAO.${chave}`), `nenhuma aba usa SECAO.${chave}`).toBe(true);
    }
  });
});
