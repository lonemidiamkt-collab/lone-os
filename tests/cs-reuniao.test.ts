// Teste OFFLINE da Fase 4 (reunião) — só as funções puras (sem banco/IA).
import { describe, it, expect } from "vitest";
import { montarPrepReuniao, formatResumoReuniao, extrairNotasReuniao, type FichaPrep, type ResumoReuniao } from "@/lib/cs/reuniao";

const ficha: FichaPrep = {
  nome: "Padaria do Zé",
  estado: "risco",
  risco: { nivel: "risco", motivos: ["sumido há 15 dias", "health alto (risco)"] },
  healthLevel: "high", healthScore: 72,
  cardsAtrasados: 2,
  pendenciasCliente: [{ item: "Enviar fotos dos produtos", impacto: "trava as artes da semana" }],
  proximaAcao: "Ligar pra reativar",
  diasSemFalar: 15,
  percebeValor: false,
  ultimaReuniao: "2026-06-10",
};

describe("montarPrepReuniao", () => {
  const txt = montarPrepReuniao(ficha, ["Reforçar os resultados dos últimos posts", "Destravar as fotos"]);
  it("traz estado/risco, atrasos, pendências e o alerta de valor", () => {
    expect(txt).toContain("*Preparo da reunião — Padaria do Zé*");
    expect(txt).toContain("sumido há 15 dias");
    expect(txt).toContain("2 entregas");
    expect(txt).toContain("não percebe valor");
    expect(txt).toContain("Enviar fotos dos produtos");
    expect(txt).toContain("trava as artes da semana");
  });
  it("inclui os pontos da IA e ensina o comando de resumo", () => {
    expect(txt).toContain("Reforçar os resultados");
    expect(txt).toContain("resumo da reunião do Padaria do Zé");
  });
  it("não quebra sem pontos nem última reunião", () => {
    const t = montarPrepReuniao({ ...ficha, ultimaReuniao: null, pendenciasCliente: [] }, []);
    expect(t).toContain("Padaria do Zé");
    expect(t).not.toContain("Última reunião");
  });
});

describe("formatResumoReuniao", () => {
  const r: ResumoReuniao = {
    resumo: "Cliente satisfeito, quer mais reels.",
    decisoes: ["Aumentar para 3 reels/semana"],
    proximas_acoes: [{ acao: "Produzir 3 reels", responsavel: "Pedro", prazo: "sexta" }],
    pendencias_cliente: [{ item: "Mandar fotos novas", impacto: "sem isso os reels atrasam" }],
    proxima_reuniao: "2026-08-15",
  };
  const txt = formatResumoReuniao("Padaria do Zé", r);
  it("mostra resumo, decisões, ações com responsável/prazo e pendências", () => {
    expect(txt).toContain("quer mais reels");
    expect(txt).toContain("Aumentar para 3 reels");
    expect(txt).toContain("Produzir 3 reels");
    expect(txt).toContain("*Pedro*");
    expect(txt).toContain("Mandar fotos novas");
  });
  it("confirma que registrou na ficha", () => {
    expect(txt).toContain("Registrei na ficha");
  });
});

describe("extrairNotasReuniao", () => {
  it("pega o texto depois dos dois-pontos", () => {
    expect(extrairNotasReuniao("Lone, resumo da reunião do Zé: cliente pediu mais reels")).toBe("cliente pediu mais reels");
  });
  it("retorna vazio quando não há dois-pontos", () => {
    expect(extrairNotasReuniao("Lone, resumo da reunião do Zé")).toBe("");
  });
});
