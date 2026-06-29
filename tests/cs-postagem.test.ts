// Teste OFFLINE do relatório de postagem — só a lógica pura buildPostingReport.
import { describe, it, expect } from "vitest";
import { buildPostingReport } from "@/lib/cs/postagem";

describe("buildPostingReport", () => {
  it("dia firme: lista com post e sem post + chamada pra criar", () => {
    const msg = buildPostingReport({
      diaLabel: "segunda, 30/06",
      firme: true,
      clientes: [
        { nome: "Contele", temPost: true },
        { nome: "Paradise", temPost: true },
        { nome: "Madeirão", temPost: false },
      ],
    });
    expect(msg).toContain("*Pauta de hoje* (segunda, 30/06)");
    expect(msg).toContain("✅ *Com post:* Contele, Paradise");
    expect(msg).toContain("❌ *Sem post:* Madeirão");
    expect(msg).toContain("1 cliente sem pauta");
  });

  it("dia firme: todos com pauta → elogia, sem lista de cobrança", () => {
    const msg = buildPostingReport({
      diaLabel: "sexta, 04/07", firme: true,
      clientes: [{ nome: "Contele", temPost: true }],
    });
    expect(msg).toContain("❌ *Sem post:* nenhum 🎉");
    expect(msg).toContain("Todo mundo com pauta hoje");
  });

  it("dia fora (quarta) COM post agendado → lista quem tem", () => {
    const msg = buildPostingReport({
      diaLabel: "quarta, 02/07", firme: false,
      clientes: [{ nome: "Contele", temPost: true }, { nome: "Paradise", temPost: false }],
    });
    expect(msg).toContain("*Posts de hoje* (quarta, 02/07)");
    expect(msg).toContain("Tem post agendado pra hoje: *Contele*");
    expect(msg).not.toContain("Paradise"); // não cobra quem não tem em dia fora
  });

  it("dia fora SEM nada agendado → null (não posta)", () => {
    const msg = buildPostingReport({
      diaLabel: "quarta, 02/07", firme: false,
      clientes: [{ nome: "Contele", temPost: false }, { nome: "Paradise", temPost: false }],
    });
    expect(msg).toBeNull();
  });
});
