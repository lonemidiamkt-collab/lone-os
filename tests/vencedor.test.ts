import { describe, it, expect, vi } from "vitest";

// Fase 2 — vencedor → hipóteses → roteiro. O contrato que importa: FATO separado de HIPÓTESE, a
// variação muda UMA coisa, e o roteiro sai pelo gerador da casa com o vencedor como contexto.

const chamadas: { system: string; user: string; imagens?: string[]; model: string }[] = [];
vi.mock("@/lib/ai/openai", () => ({
  chatJson: async (p: { system: string; user: string; imagens?: string[]; model: string; schemaName: string }) => {
    chamadas.push(p);
    if (p.schemaName === "vencedor_analise") return { ok: true, data: {
      elementos: [{ tipo: "oferta", descricao: "preço R$ 149,90 em destaque na imagem" }, { tipo: "formato", descricao: "vídeo com pessoa falando" }],
      hipoteses: [{ hipotese: "o preço explícito reduziu a fricção", elemento: "oferta", confianca: "alta" }, { hipotese: "rosto humano aumentou a atenção", elemento: "formato", confianca: "media" }],
      variacoes: [{ nome: "Sem preço", muda: "tira o preço da imagem", mantem: "vídeo com pessoa, mesmo gancho", testa: "o preço explícito reduziu a fricção" }, { nome: "Estático", muda: "imagem estática em vez de vídeo", mantem: "preço em destaque, mesmo texto", testa: "rosto humano aumentou a atenção" }],
      resumo_para_o_time: "Preço na imagem e pessoa falando. Hipótese principal: preço explícito.",
    } };
    // gerador de roteiro (cs_roteiros)
    return { ok: true, data: { precisa_briefing: false, perguntas: [], roteiros: [
      { angulo: "sem preço", framework: "Método Lone", gatilhos: ["urgência"], arquetipo: "Ford", estagio_funil: "meio", etapas: [{ tempo: "0-3s", nome: "Gancho", texto: "..." }], scorecard: 78, pontos_fortes: "", sugestoes: "" },
      { angulo: "pior", framework: "Método Lone", gatilhos: [], arquetipo: "Ford", estagio_funil: "meio", etapas: [], scorecard: 60, pontos_fortes: "", sugestoes: "" },
    ] } };
  },
}));

const { analisarVencedor, roteiroDaVariacao } = await import("@/lib/traffic/vencedor");

describe("vencedor → hipóteses → roteiro", () => {
  it("análise manda a miniatura para a visão e o resultado contra a meta; o system exige hipótese, não causa", async () => {
    const r = await analisarVencedor({
      criativo: { adId: "1", adName: "ADS - VIDEO", tipo: "VIDEO", thumbUrl: "https://t/x.jpg", body: "Texto do anúncio", cta: "WHATSAPP_MESSAGE" },
      resultado: { cpl: 4.2, cplMeta: 8, conversas: 12, gasto: 50.4, ctr: 2.1, ctrConta: 1.5, dias: 9 }, cliente: "Quero Tintas", nicho: "tintas",
    });
    expect(r.ok).toBe(true);
    const c = chamadas[0];
    expect(c.imagens).toEqual(["https://t/x.jpg"]);
    expect(c.user).toContain("R$ 4.20 por conversa (meta do cliente: R$ 8.00)");
    expect(c.system).toMatch(/NUNCA como causa/);
    expect(r.data!.hipoteses[0].hipotese).toMatch(/hipótese|reduziu/);
  });

  it("roteiro da variação: gerador da casa, com o vencedor como contexto factual e o que MANTER vindo das hipóteses; devolve o de maior scorecard", async () => {
    chamadas.length = 0;
    const analise = (await analisarVencedor({ criativo: { adId: "1", body: "Texto" }, resultado: { cpl: 4, cplMeta: 8, conversas: 10, gasto: 40, ctr: null, ctrConta: null, dias: 7 }, cliente: "X" })).data!;
    const r = await roteiroDaVariacao({ briefing: { nome: "Quero Tintas", nicho: "tintas" }, preferencias: ["gancho curto"], criativo: { adId: "1", body: "Texto do vencedor" }, analise, variacao: analise.variacoes[0] });
    expect(r?.scorecard).toBe(78);
    const ger = chamadas[1];
    expect(ger.user).toContain("ANÚNCIO VENCEDOR ATUAL");
    expect(ger.user).toContain("MANTER (elementos que as hipóteses apontam): oferta (hipótese: o preço explícito reduziu a fricção); formato");
    expect(ger.user).toContain("MUDAR nesta variação: tira o preço da imagem");
    expect(ger.user).toContain("gancho curto"); // preferência aprendida do cliente respeitada
  });
});
