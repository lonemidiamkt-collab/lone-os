import { describe, it, expect } from "vitest";
import {
  calcularSaude, nivelDaSaude, gravacaoDaSaude, saudeExibida, COBERTURA_MINIMA,
} from "@/lib/scores/health";
import { riscoConsolidado } from "@/lib/cs/jornada";
import { calcHealthScore } from "@/lib/utils";
import { conteudoDaNovaVersao } from "@/app/api/clients/[id]/briefing/_versao";
import { rotuloResultadoAnuncio } from "@/lib/scores/resultado-anuncio";

describe("saúde: uma régua, 100 = saudável", () => {
  it("faixas únicas 75/60", () => {
    expect(nivelDaSaude(75)).toBe("saudavel");
    expect(nivelDaSaude(74)).toBe("atencao");
    expect(nivelDaSaude(60)).toBe("atencao");
    expect(nivelDaSaude(59)).toBe("risco");
    expect(nivelDaSaude(null)).toBe("sem_dado");
  });

  it(`cobertura abaixo de ${COBERTURA_MINIMA}% é sem_dado, nunca 0`, () => {
    // Só entrega (15% do peso) medida — o caso real de cliente sem conversa no grupo.
    const s = calcularSaude({ clientId: "1", cliente: "X", componentes: { entrega: 10 } });
    expect(s.cobertura).toBe(15);
    expect(s.score).toBeNull();
    expect(s.nivel).toBe("sem_dado");
    expect(s.scoreParcial).toBe(10);
  });

  it("grava nível novo e zera o cache quando não há dado", () => {
    const ok = calcularSaude({ clientId: "1", cliente: "X", componentes: { entrega: 90, relacionamento: 80, sentimento: 70 } });
    expect(gravacaoDaSaude(ok).historico).toEqual({ score: ok.score, level: "saudavel" });
    expect(gravacaoDaSaude(ok).cache.current_health_level).toBe("saudavel");

    const pouco = calcularSaude({ clientId: "2", cliente: "Y", componentes: { entrega: 30 } });
    expect(gravacaoDaSaude(pouco).historico).toEqual({ score: 30, level: "sem_dado" });
    expect(gravacaoDaSaude(pouco).cache).toEqual({ current_health_score: null, current_health_level: "sem_dado" });

    const nada = calcularSaude({ clientId: "3", cliente: "Z", componentes: {} });
    expect(gravacaoDaSaude(nada).historico).toBeNull();
  });

  it("a tela prefere o cache e não transforma sem_dado em número", () => {
    expect(saudeExibida({ currentHealthScore: 82, currentHealthLevel: "saudavel" }, () => 10))
      .toEqual({ score: 82, nivel: "saudavel", doCache: true });
    expect(saudeExibida({ currentHealthScore: 30, currentHealthLevel: "sem_dado" }, () => 10).score).toBeNull();
    // nível da escala antiga (compute-health) não é confiado: cai no fallback
    expect(saudeExibida({ currentHealthScore: 80, currentHealthLevel: "critical" }, () => 50))
      .toEqual({ score: 50, nivel: "risco", doCache: false });
  });

  it("calcHealthScore usa o cache quando existe", () => {
    const base = { status: "at_risk" as const, attentionLevel: "critical" as const, lastPostDate: undefined };
    expect(calcHealthScore({ ...base, currentHealthScore: 88 })).toBe(88);
    expect(calcHealthScore(base)).toBeLessThan(10);
  });
});

describe("jornada lê os níveis novos", () => {
  const base = { attentionLevel: "low", diasSemFalar: 1, reclamacaoRecente: false };
  it("risco → risco, atencao → atencao, saudavel → saudavel", () => {
    expect(riscoConsolidado({ ...base, healthLevel: "risco" }).nivel).toBe("risco");
    expect(riscoConsolidado({ ...base, healthLevel: "atencao" }).nivel).toBe("atencao");
    expect(riscoConsolidado({ ...base, healthLevel: "saudavel" }).nivel).toBe("saudavel");
    expect(riscoConsolidado({ ...base, healthLevel: "sem_dado" }).nivel).toBe("saudavel");
  });
});

describe("briefing: salvar pelo form não apaga o trabalho do estrategista", () => {
  const atual = {
    id: "v1", client_id: "c", version: 3, is_current: true, created_by: "m", created_at: "x",
    dores: ["preço"], desejos: ["rapidez"], objecoes: ["caro"], mix_pilares: { autoridade: 40 },
    maturidade_marca: "nova", paleta_cores: [{ hex: "#000000", nome: "preto" }], posicionamento: "antigo",
  };
  it("herda o que o form não mandou e aplica o que mandou", () => {
    const n = conteudoDaNovaVersao(atual, { posicionamento: "novo", dores: [] });
    expect(n.desejos).toEqual(["rapidez"]);
    expect(n.mix_pilares).toEqual({ autoridade: 40 });
    expect(n.paleta_cores).toEqual([{ hex: "#000000", nome: "preto" }]);
    expect(n.posicionamento).toBe("novo");
    expect(n.dores).toEqual([]);
    expect(n).not.toHaveProperty("id");
    expect(n).not.toHaveProperty("version");
    expect(n).not.toHaveProperty("is_current");
  });
  it("sem versão atual, usa os defaults", () => {
    const n = conteudoDaNovaVersao(null, { resumo_estrategico: "r", produtos: null });
    expect(n.resumo_estrategico).toBe("r");
    expect(n.produtos).toEqual([]);
    expect(n.ganchos).toEqual([]);
  });
});

describe("clients.status é resultado do anúncio", () => {
  it("rótulo humano, não o enum", () => {
    expect(rotuloResultadoAnuncio("at_risk")).toBe("Ruim");
    expect(rotuloResultadoAnuncio("good")).toBe("Bom");
  });
});
