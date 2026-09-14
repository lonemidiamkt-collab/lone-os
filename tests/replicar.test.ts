import { describe, it, expect } from "vitest";
import { montarDemanda, prazoPadrao, variavelDe, fingerprintReplicacao } from "@/lib/traffic/replicar";

// Creative Intelligence — Fase 3: a tarefa que chega ao designer já vem travada.

describe("replicar vencedor → demanda para o designer", () => {
  it("briefing traz objetivo, pai, resultado, variável, manter/alterar, formato e a referência anexada", () => {
    const d = montarDemanda({
      cliente: "Óticas Rhodrigo", adId: "120", adName: "ADS - EXAME 50", thumbUrl: "https://t/x.jpg",
      resultado: { cpl: 4.31, cplMeta: 8, conversas: 94, gasto: 405.14, dias: 12 },
      variacao: { nome: "Cenário", muda: "ambiente/fundo", mantem: "headline, preço, hierarquia e CTA", testa: "se o cenário mexe no CTR" },
      formato: "1080 × 1350", prazo: "2026-09-15", pedidoPor: "Julio",
      elementos: [{ tipo: "oferta", descricao: "exame por R$ 50 em destaque" }],
    });
    expect(d.titulo).toBe("Variação do vencedor — Cenário");
    expect(d.briefing).toContain("**Criativo pai:** ADS - EXAME 50 (Meta ad 120)");
    expect(d.briefing).toContain("R$ 4,31 por conversa · meta do cliente R$ 8,00 (46% abaixo)");
    expect(d.briefing).toContain("**Manter (NÃO mexer):** headline, preço, hierarquia e CTA");
    expect(d.briefing).toContain("**Alterar:** ambiente/fundo");
    expect(d.briefing).toContain("- oferta: exame por R$ 50 em destaque");
    expect(d.attachments).toEqual(["https://t/x.jpg"]);
  });

  it("prazo padrão é o próximo dia útil (mínimo 1 dia útil do Playbook)", () => {
    expect(prazoPadrao("2026-09-14")).toBe("2026-09-15"); // segunda → terça
    expect(prazoPadrao("2026-09-18")).toBe("2026-09-21"); // sexta → segunda
  });

  it("uma variável por filho: fingerprint pai|variável impede duas demandas iguais abertas", () => {
    expect(variavelDe({ nome: "Cenário", muda: "x" })).toBe("cenario");
    expect(fingerprintReplicacao("120", variavelDe({ nome: "Sem preço", muda: "tira o preço" }))).toBe("replica|120|sem-preco");
  });
});
