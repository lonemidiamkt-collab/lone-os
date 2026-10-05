import { describe, it, expect } from "vitest";
import { agruparArte, fraseParaFalar, deveFalar, podeOuvir } from "@/lib/avisos/fala";

describe("o que o painel fala", () => {
  it("tira emoji, asterisco e link; lê reais por extenso", () => {
    expect(fraseParaFalar("🚨 *Saldo acabando* — Paradise Suplementos", "Saldo R$ 5,01. Veja https://painel.lonemidia.com/traffic"))
      .toBe("Saldo acabando — Paradise Suplementos. Saldo 5 reais e 1 centavo. Veja");
    expect(fraseParaFalar("Conta parada: Maicon minerais", "Vinha gastando R$ 59,22/dia")).toContain("59 reais e 22 centavos/dia");
    expect(fraseParaFalar("Verba", "R$ 1.200,00 no mês")).toBe("Verba. 1200 reais no mês");
  });

  it("frase longa é cortada no fim de uma frase, não no meio da palavra", () => {
    const corpo = "Primeira frase do aviso. " + "Segunda frase bem comprida que continua ".repeat(10);
    const f = fraseParaFalar("Aviso", corpo, 120);
    expect(f.length).toBeLessThanOrEqual(121);
    expect(f.endsWith(".")).toBe(true);
  });
});

// Quarta, 07/10/2026, 11h em São Paulo — dentro do horário comercial.
const QUARTA_11H = new Date("2026-10-07T14:00:00Z");
const ctx = (papel: string, extra: Record<string, unknown> = {}) =>
  ({ papel, ligada: true, eu: "Carlos Augusto", agora: QUARTA_11H, ...extra });

describe("quem ouve", () => {
  it("tráfego: só fala o que o servidor marcou pra falar, e só pra quem cuida de conta", () => {
    const t = { type: "trafego" as const, title: "A conta do X parou de rodar", body: "", falar: true };
    expect(deveFalar(t, ctx("manager"))).toBe(true);
    expect(deveFalar(t, ctx("traffic"))).toBe(true);
    expect(deveFalar(t, ctx("admin"))).toBe(true); // sócio só RECEBE se ligou a voz (servidor)
    expect(deveFalar(t, ctx("designer"))).toBe(false);
    expect(deveFalar({ ...t, falar: false }, ctx("manager"))).toBe(false); // teto, horário ou controle
    expect(deveFalar(t, ctx("manager", { ligada: false }))).toBe(false);
  });

  it("arte: fala pro social e o designer DONOS do cliente — não pra arte do cliente de outra pessoa", () => {
    const arte = { type: "content" as const, title: "Arte entregue", body: "O Rodrigo entregou a arte de SEX 9 da Veneza" };
    expect(deveFalar(arte, ctx("social", { dono: { social: "Carlos Augusto" } }))).toBe(true);
    expect(deveFalar(arte, ctx("social", { dono: { social: "Thiago" } }))).toBe(false);
    expect(deveFalar(arte, ctx("designer", { eu: "Rodrigo", dono: { designer: "Rodrigo" } }))).toBe(true);
    expect(deveFalar(arte, ctx("social", { dono: null }))).toBe(false); // cliente desconhecido: cala
    expect(deveFalar({ ...arte, paraMim: true }, ctx("social", { dono: null }))).toBe(true); // dirigido a mim (teste)
    expect(deveFalar(arte, ctx("traffic", { dono: { social: "Carlos Augusto" } }))).toBe(false);
    expect(deveFalar(arte, ctx("manager", { dono: { social: "Carlos Augusto" } }))).toBe(false); // gestão não ouve arte
    expect(deveFalar({ type: "content", title: "Conteúdo reprovado", body: "voltou pra pauta" }, ctx("social", { dono: { social: "Carlos Augusto" } }))).toBe(false);
  });

  it("fora do horário comercial nada fala", () => {
    const t = { type: "trafego" as const, title: "x", body: "", falar: true };
    expect(deveFalar(t, ctx("manager", { agora: new Date("2026-10-07T22:00:00Z") }))).toBe(false); // 19h
    expect(deveFalar(t, ctx("manager", { agora: new Date("2026-10-10T14:00:00Z") }))).toBe(false); // sábado
  });

  it("papel desconhecido não ouve", () => {
    expect(podeOuvir(undefined)).toBe(false);
    expect(podeOuvir("comercial")).toBe(false);
  });
});

describe("arte agrupada por cliente", () => {
  it("várias artes do mesmo cliente viram UMA frase; cliente diferente, outra", () => {
    const nome = (id: string) => ({ c1: "Veneza Estofados", c2: "Bruno Tintas" } as Record<string, string>)[id] ?? null;
    const grupos = agruparArte([
      { id: "1", title: "Arte entregue", body: "O Rodrigo entregou a arte de SEG", clientId: "c1" },
      { id: "2", title: "Arte entregue", body: "O Rodrigo entregou a arte de QUA", clientId: "c1" },
      { id: "3", title: "Arte entregue", body: "O Gabriel entregou a arte de SEX", clientId: "c2" },
    ], nome);
    expect(grupos).toHaveLength(2);
    expect(grupos[0].frase).toBe("2 artes da Veneza Estofados chegaram.");
    expect(grupos[1].frase).toBe("Arte entregue. O Gabriel entregou a arte de SEX");
  });
});
