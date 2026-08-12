import { describe, it, expect } from "vitest";
import { buildSystem, type BriefingCliente } from "@/lib/cs/criativo";

// Regressão do roteiro do WT Shopping (12/08). O Roberto mandou informação sobre castração e pediu
// o roteiro; voltou um PDF cuja Versão 1 falava de ração a R$49,99 e delivery — "veio sem contexto
// algum" — e as duas versões traziam prova social inventada ("mais de 1000 pets", "centenas de
// pets"). As instruções contra isso existiam, mas moravam no user e perdiam pras regras do system
// ("gere ângulos diferentes" + "escolha o produto em destaque do briefing").

const briefing: BriefingCliente = { nome: "WT Shopping" };

describe("regras do SYSTEM do gerador de roteiro", () => {
  it("sem contexto: mantém a autonomia de escolher o assunto no briefing", () => {
    const s = buildSystem({ briefing });
    expect(s).not.toContain("ASSUNTO OBRIGATÓRIO");
    expect(s).toContain("produto em destaque");
  });

  it("com contexto: trava o assunto de TODAS as versões", () => {
    const s = buildSystem({ briefing, contexto: "O pet passa por exame pré operatório…" });
    expect(s).toContain("ASSUNTO OBRIGATÓRIO");
    expect(s).toMatch(/TODAS as versões falam DESSE assunto/i);
    // A regra que produziu o anúncio de ração precisa ser explicitamente desativada.
    expect(s).toMatch(/NÃO vale nesta rodada/i);
  });

  it("a proibição de número inventado vale SEMPRE, com ou sem contexto", () => {
    for (const inp of [{ briefing }, { briefing, contexto: "algum contexto" }]) {
      const s = buildSystem(inp);
      expect(s).toContain("NÚMERO INVENTADO É LINHA VERMELHA");
      expect(s).toMatch(/mais de 1000 clientes/i); // o erro real, citado como exemplo proibido
      expect(s).toMatch(/centenas de/i);
    }
  });

  it("as regras vão no SYSTEM, não dependem do user", () => {
    // O bug foi exatamente este: instrução no lugar fraco perde a queda de braço.
    const s = buildSystem({ briefing, contexto: "x" });
    expect(s.indexOf("ASSUNTO OBRIGATÓRIO")).toBeGreaterThan(-1);
    expect(s.length).toBeGreaterThan(1000); // é o prompt inteiro, não um fragmento
  });
});
