import { describe, it, expect } from "vitest";
import { emOperacao, emSetupInicial, onboardingDesatualizado, jaOpera } from "@/lib/clients/operacao";
import type { Client } from "@/lib/types";

// Regressão do "já temos mais cliente do que contabiliza" (Roberto, 23/08). O dashboard mostrava
// 32 de 49: `status !== "onboarding"` escondia 17 clientes que operavam há meses e nunca tinham
// sido promovidos — e que também não apareciam no card de Onboarding (só mostra <7 dias).

const base = (over: Partial<Client>): Client => ({
  id: "x", name: "Cliente", status: "good", assignedTraffic: "", assignedSocial: "",
  assignedDesigner: "", joinDate: "2026-01-01", paymentMethod: "pix",
  ...over,
} as Client);

const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe("quem está em operação", () => {
  it("Dumar: 125 dias, status onboarding, com conta de anúncio → CONTA como ativo", () => {
    const dumar = base({ name: "Dumar", status: "onboarding", createdAt: diasAtras(125), metaAdAccountId: "act_1" });
    expect(jaOpera(dumar)).toBe(true);
    expect(emOperacao(dumar)).toBe(true);
    expect(emSetupInicial(dumar)).toBe(false);
    expect(onboardingDesatualizado(dumar)).toBe(true); // e o time é avisado pra promover
  });

  it("cliente que entrou ontem e ainda não tem nada ligado → é setup, não conta como ativo", () => {
    const novo = base({ status: "onboarding", createdAt: diasAtras(1) });
    expect(emSetupInicial(novo)).toBe(true);
    expect(emOperacao(novo)).toBe(false);
    expect(onboardingDesatualizado(novo)).toBe(false);
  });

  it("entrou ontem MAS já tem conta de anúncio → já está operando", () => {
    const rapido = base({ status: "onboarding", createdAt: diasAtras(1), metaAdAccountId: "act_9" });
    expect(emOperacao(rapido)).toBe(true);
  });

  it("onboarding há 30 dias sem nada ligado → some do card de novos, mas vira alerta", () => {
    const parado = base({ status: "onboarding", createdAt: diasAtras(30) });
    expect(emSetupInicial(parado)).toBe(false);   // não é "novo" há muito tempo
    expect(emOperacao(parado)).toBe(true);
    expect(onboardingDesatualizado(parado)).toBe(true);
  });

  it("cliente normal segue contando", () => {
    expect(emOperacao(base({ status: "good" }))).toBe(true);
    expect(emOperacao(base({ status: "at_risk" }))).toBe(true);
  });

  it("portal, instagram ou último post também valem como sinal de operação", () => {
    expect(jaOpera(base({ publicReportEnabled: true }))).toBe(true);
    expect(jaOpera(base({ instagramUser: "@loja" }))).toBe(true);
    expect(jaOpera(base({ lastPostDate: diasAtras(3) }))).toBe(true);
    expect(jaOpera(base({}))).toBe(false);
  });

  it("a soma bate: nenhum cliente some das duas contagens", () => {
    const carteira = [
      base({ status: "onboarding", createdAt: diasAtras(125), metaAdAccountId: "a" }), // preso
      base({ status: "onboarding", createdAt: diasAtras(2) }),                          // setup real
      base({ status: "good" }),
      base({ status: "at_risk" }),
    ];
    const ativos = carteira.filter(emOperacao).length;
    const setup = carteira.filter(emSetupInicial).length;
    expect(ativos + setup).toBe(carteira.length); // era aqui que 17 clientes sumiam
  });
});
