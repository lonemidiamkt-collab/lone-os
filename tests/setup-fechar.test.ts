import { describe, it, expect } from "vitest";
import { motivoFechamentoSetup, notaDeFechamento, type ClienteDoSetup } from "@/lib/cs/setup-fechar";

// 02/10/2026: 43 das 45 tarefas cobradas às 9h eram checklist de setup de cliente que já estava no
// ar. "[Setup] Bio do perfil escrita — Veneza Estofados · venceu há 51 dias", com o Veneza postando
// 8 vezes no mês. E seis de social da JP e do Dr. Júnior, que são só tráfego.
const NO_AR: ClienteDoSetup = { ativo: true, escopo: "completo", emOnboarding: false, postsIg30d: 8, gastou30d: true };
const VENCIDA = { diasVencida: 51 };

describe("fechar setup resolvido", () => {
  it("cliente postando no Instagram: a bio, a logo e as fixadas já existem", () => {
    expect(motivoFechamentoSetup({ papel: "social", ...VENCIDA }, NO_AR)).toBe("perfil no ar: 8 posts no Instagram nos últimos 30 dias");
    expect(motivoFechamentoSetup({ papel: "designer", ...VENCIDA }, NO_AR)).toContain("perfil no ar");
  });

  it("tarefa de social de cliente só de tráfego não se aplica — a JP e o Dr. Júnior", () => {
    const soTrafego = { ...NO_AR, escopo: "trafego" as const, postsIg30d: 0 };
    expect(motivoFechamentoSetup({ papel: "social", diasVencida: 9 }, soTrafego)).toBe("não se aplica: o contrato é só de tráfego");
    expect(motivoFechamentoSetup({ papel: "designer", diasVencida: 9 }, soTrafego)).toBe("não se aplica: o contrato é só de tráfego");
  });

  it("tarefa de tráfego de cliente só de social não se aplica", () => {
    expect(motivoFechamentoSetup({ papel: "traffic", ...VENCIDA }, { ...NO_AR, escopo: "social" })).toBe("não se aplica: o contrato é só de social");
  });

  it("anúncio no ar se prova pelo gasto", () => {
    expect(motivoFechamentoSetup({ papel: "traffic", ...VENCIDA }, NO_AR)).toBe("anúncio rodando: houve gasto na conta nos últimos 30 dias");
  });

  it("cliente que saiu: nada pra cobrar", () => {
    expect(motivoFechamentoSetup({ papel: "social", ...VENCIDA }, { ...NO_AR, ativo: false })).toBe("cliente saiu da carteira");
  });

  it("cliente novo dentro da janela: quem decide é a conferência de setup, item a item", () => {
    const novo = { ...NO_AR, emOnboarding: true };
    expect(motivoFechamentoSetup({ papel: "social", diasVencida: 3 }, novo)).toBeNull();
    // Passou muito do prazo, mesmo em onboarding: o Instagram resolve.
    expect(motivoFechamentoSetup({ papel: "social", diasVencida: 20 }, novo)).toContain("perfil no ar");
  });

  it("sem prova, a tarefa continua — não fecha no escuro", () => {
    const parado = { ...NO_AR, postsIg30d: 2, gastou30d: false };
    expect(motivoFechamentoSetup({ papel: "social", ...VENCIDA }, parado)).toBeNull();
    expect(motivoFechamentoSetup({ papel: "traffic", ...VENCIDA }, parado)).toBeNull();
    expect(motivoFechamentoSetup({ papel: "social", ...VENCIDA }, null)).toBeNull();
  });

  it("a tarefa guarda por que foi fechada", () => {
    expect(notaDeFechamento("perfil no ar: 8 posts", "02/10")).toBe("✔ Fechada pelo sistema em 02/10: perfil no ar: 8 posts.");
  });
});
