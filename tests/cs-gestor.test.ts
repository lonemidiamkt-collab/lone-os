/**
 * QA: Raio-X do Gestor (lib/cs/gestor) — gargalo do fluxo + cards travados por social.
 * Garante que 'ideas' (backlog) fica de fora, o threshold de horas úteis é respeitado,
 * e a mensagem agrupa por social mostrando só o pior de cada.
 */

import { describe, it, expect } from "vitest";
import { cardsParados, formatRaioXGestor, retrabalhoPorSocial } from "@/lib/cs/gestor";
import type { OperationalKpis } from "@/lib/kpis/operational";
import type { ContentCard } from "@/lib/types";

const card = (p: Partial<ContentCard>): ContentCard =>
  ({ id: "x", title: "t", clientId: "c", clientName: "C", socialMedia: "Carlos",
     status: "in_production", priority: "medium", format: "Post", ...p } as ContentCard);

const KPIS: OperationalKpis = {
  sampleSize: 10, leadTimeDays: 5, onTimeRate: 80, latePublishCount: 2, avgLateDays: 1,
  bottleneck: { stage: "approval", avgDays: 3.2, samples: 4 }, stages: [], avgWorkHours: 2, nonDeliveryReasons: [],
};

describe("cardsParados", () => {
  it("ignora 'ideas' (backlog) e cards abaixo do threshold", () => {
    const cards = [
      card({ id: "1", status: "ideas" }),          // backlog → fora mesmo com 999h
      card({ id: "2", status: "in_production" }),   // 4h → abaixo do threshold
      card({ id: "3", status: "approval" }),        // 20h → travado
    ];
    const horas: Record<string, number> = { "1": 999, "2": 4, "3": 20 };
    const out = cardsParados(cards, (c) => horas[c.id], 16);
    expect(out.map((p) => p.etapa)).toEqual(["Aprovação"]);
  });

  it("ordena do mais travado pro menos", () => {
    const cards = [card({ id: "a", status: "script" }), card({ id: "b", status: "approval" })];
    const horas: Record<string, number> = { a: 20, b: 40 };
    const out = cardsParados(cards, (c) => horas[c.id], 16);
    expect(out.map((p) => p.horasUteis)).toEqual([40, 20]);
  });

  it("Infinity (card sem timestamp na coluna atual) não entra", () => {
    const out = cardsParados([card({ id: "z", status: "approval" })], () => Infinity, 16);
    expect(out).toHaveLength(0);
  });
});

describe("formatRaioXGestor", () => {
  it("sem travados → 'Nada travado' + gargalo/lead time do fluxo", () => {
    const msg = formatRaioXGestor(KPIS, [], "06/07");
    expect(msg).toContain("Nada travado");
    expect(msg).toContain("gargalo: *Aprovação*");
    expect(msg).toContain("Lead time: *5* dias");
  });

  it("agrupa travados por social (mais travados primeiro) e mostra o pior de cada", () => {
    const parados = [
      { titulo: "Panfleto", social: "Carlos", etapa: "Aprovação", horasUteis: 40 },
      { titulo: "Story", social: "Carlos", etapa: "Produção", horasUteis: 20 },
      { titulo: "Reel", social: "Pedro", etapa: "Produção", horasUteis: 30 },
    ];
    const msg = formatRaioXGestor(KPIS, parados, "06/07");
    expect(msg).toContain("Travados há +2 dias úteis* (3)");
    expect(msg).toMatch(/Carlos\*: 2 \(\+1\) — pior: "Panfleto"/);
    expect(msg).toContain('Pedro*: 1 — pior: "Reel"');
  });
});

describe("retrabalhoPorSocial", () => {
  it("agrupa e ordena por qtd desc; social vazio vira 'sem responsável'", () => {
    const out = retrabalhoPorSocial([
      { social_media: "Carlos" }, { social_media: "Carlos" }, { social_media: "Pedro" }, { social_media: null },
    ]);
    expect(out).toEqual([
      { social: "Carlos", count: 2 },
      { social: "Pedro", count: 1 },
      { social: "sem responsável", count: 1 },
    ]);
  });
});

describe("formatRaioXGestor — retrabalho", () => {
  it("total 0 → mensagem positiva", () => {
    expect(formatRaioXGestor(KPIS, [], "06/07", [])).toContain("Retrabalho (7 dias)*: 0");
  });
  it("com reprovações → total + por social", () => {
    const msg = formatRaioXGestor(KPIS, [], "06/07", [{ social: "Carlos", count: 3 }, { social: "Pedro", count: 1 }]);
    expect(msg).toContain("Retrabalho (7 dias)*: 4 reprovações do social");
    expect(msg).toContain("Carlos: 3 · Pedro: 1");
  });
  it("undefined → omite a seção (retrocompat)", () => {
    expect(formatRaioXGestor(KPIS, [], "06/07")).not.toContain("Retrabalho");
  });
});
