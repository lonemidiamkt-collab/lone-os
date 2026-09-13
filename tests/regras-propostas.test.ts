import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ehFatoTemporario } from "@/lib/cs/regras-propostas";

// Fase 0A do Lone Agent V2 (13/09/2026): regra permanente de cliente NÃO nasce ativa a partir de
// uma mensagem. Medido: 354 das 356 regras ativas nasceram assim.

const INBOUND = readFileSync("app/api/cs/inbound/route.ts", "utf8");
const MODULO = readFileSync("lib/cs/regras-propostas.ts", "utf8");

describe("regra permanente pede ok", () => {
  it("o inbound não grava mais regra ativa direto — os quatro pontos passam por proporRegra", () => {
    // Antes: quatro `from("cs_client_rules").insert({ ... origem: "aprendido"` no inbound.
    const insercoesDiretas = (INBOUND.match(/from\("cs_client_rules"\)\.insert\(/g) ?? []).length;
    expect(insercoesDiretas).toBe(0);
    const chamadas = (INBOUND.match(/await proporRegra\(/g) ?? []).length;
    expect(chamadas).toBe(4);
  });

  it("proposta nasce com ativo=false e estado=proposta — invisível a todo leitor de regra", () => {
    expect(MODULO).toMatch(/ativo: false, estado: "proposta"/);
    // Todos os leitores filtram ativo = true; conferido em briefing-sync, load-briefing, regras, queries.
    for (const f of ["lib/cs/briefing-sync.ts", "lib/cs/load-briefing.ts", "lib/cs/regras.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toMatch(/cs_client_rules[\s\S]{0,200}\.eq\("ativo", true\)/);
    }
  });

  it("a decisão de regra é checada ANTES da decisão de demanda, no mesmo 'ok xxxx'", () => {
    const iRegra = INBOUND.indexOf("const regra = await decidirRegra(");
    const iDemanda = INBOUND.indexOf("const alvoDec: AlvoDemanda");
    expect(iRegra).toBeGreaterThan(0);
    expect(iRegra).toBeLessThan(iDemanda);
  });

  it("ativar a regra sincroniza o briefing, como o insert antigo fazia", () => {
    expect(INBOUND).toMatch(/if \(regra\.tipo === "ativada"\) await sincronizarBriefingAprendido\(regra\.clientId\)/);
  });

  it("revisão 13/09: ativar é nível D, o papel de quem decide chega ao módulo, e a pergunta só sai no grupo interno", () => {
    expect(MODULO).toMatch(/NIVEL_PARA_ATIVAR_REGRA = "D"/);
    expect(INBOUND).toMatch(/decidirRegra\(\{[\s\S]{0,200}papel: autoridade\.autor\?\.papel \?\? null/);
    expect(INBOUND).toMatch(/regra\.tipo === "sem_autoridade"/);
    // O destino não é parâmetro: o módulo lê CS_INTERNAL_GROUP_JID e ignora groupJid de quem chama.
    expect(MODULO).toMatch(/function grupoDaPergunta\(\)[\s\S]{0,80}CS_INTERNAL_GROUP_JID/);
    expect(MODULO).not.toMatch(/csSendGroupText\(p\.groupJid/);
  });
});

describe("fato temporário continua automático — não é regra permanente", () => {
  it("prazo embutido = temporário", () => {
    for (const t of ["fechado até dia 20", "promoção essa semana", "férias em julho", "balanço no próximo mês"]) {
      expect(ehFatoTemporario(t), t).toBe(true);
    }
  });
  it("'a partir de' é mudança permanente", () => {
    expect(ehFatoTemporario("a partir de hoje o horário é 8h às 18h")).toBe(false);
    expect(ehFatoTemporario("usar sempre preço na primeira arte")).toBe(false);
  });
});
