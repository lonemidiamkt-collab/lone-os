// As seis etapas da produção (lib/conteudo/etapas.ts) — Leva 5b, D1. Toda tela, texto e filtro que
// fala de etapa lê daqui; este teste trava o mapeamento status do banco → etapa.
import { describe, it, expect } from "vitest";
import {
  ETAPAS, ETAPAS_COMPROMETIDAS, ETAPAS_FINAIS, ROTULO_DO_STATUS, corDoStatus, estaBloqueado, etapaDoStatus,
  infoEtapa, ordemDoStatus, passouDaEntrega, rotuloCompleto, rotuloDoStatus, rotuloEmFrase, statusDaEtapa,
  statusDasEtapas, statusNaEtapa,
} from "@/lib/conteudo/etapas";
import type { ContentCard } from "@/lib/types";

const TODOS: ContentCard["status"][] = ["ideas", "script", "in_production", "blocked", "approval", "client_approval", "scheduled", "published"];

describe("as seis etapas", () => {
  it("são seis, nesta ordem e com estes nomes", () => {
    expect(ETAPAS.map((e) => e.rotulo)).toEqual(["Pauta", "Com o designer", "Revisão interna", "Com o cliente", "Agendado", "No ar"]);
    expect(ETAPAS.map((e) => e.ordem)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("todo status do enum cai em exatamente uma etapa", () => {
    for (const s of TODOS) {
      expect(ETAPAS.filter((e) => e.status.includes(s))).toHaveLength(1);
    }
    expect(ETAPAS.flatMap((e) => e.status).sort()).toEqual([...TODOS].sort());
  });

  it("status do banco → etapa (o mapeamento da Leva 5b)", () => {
    expect(etapaDoStatus("ideas")).toBe("pauta");
    expect(etapaDoStatus("script")).toBe("pauta");
    expect(etapaDoStatus("in_production")).toBe("com_designer");
    expect(etapaDoStatus("blocked")).toBe("com_designer");
    expect(etapaDoStatus("approval")).toBe("revisao");
    expect(etapaDoStatus("client_approval")).toBe("com_cliente");
    expect(etapaDoStatus("scheduled")).toBe("agendado");
    expect(etapaDoStatus("published")).toBe("no_ar");
  });

  it("status desconhecido ou vazio cai na Pauta (começo do fluxo, não finge que andou)", () => {
    expect(etapaDoStatus(null)).toBe("pauta");
    expect(etapaDoStatus(undefined)).toBe("pauta");
    expect(etapaDoStatus("revision")).toBe("pauta");
  });

  it("o status gravado ao entrar em cada etapa", () => {
    expect(ETAPAS.map((e) => statusDaEtapa(e.id))).toEqual(["ideas", "in_production", "approval", "client_approval", "scheduled", "published"]);
  });

  it("status de várias etapas, para filtro de consulta", () => {
    expect(statusDasEtapas("pauta")).toEqual(["ideas", "script"]);
    expect(statusDasEtapas("com_designer", "revisao")).toEqual(["in_production", "blocked", "approval"]);
    expect(statusNaEtapa("blocked", "com_designer")).toBe(true);
    expect(statusNaEtapa("approval", "com_designer", "com_cliente")).toBe(false);
  });
});

describe("bloqueado é marca, não coluna", () => {
  it("fica em Com o designer, com a marca e a cor de alerta", () => {
    expect(estaBloqueado("blocked")).toBe(true);
    expect(estaBloqueado("in_production")).toBe(false);
    expect(rotuloDoStatus("blocked")).toBe("Com o designer");
    expect(rotuloCompleto("blocked")).toBe("Com o designer · Bloqueado");
    expect(corDoStatus("blocked")).toBe("bg-destructive");
    expect(corDoStatus("in_production")).toBe(infoEtapa("com_designer").cor);
  });
});

describe("rótulos", () => {
  it("um rótulo por status, igual em todo lugar", () => {
    expect(ROTULO_DO_STATUS).toEqual({
      ideas: "Pauta", script: "Pauta", in_production: "Com o designer", blocked: "Com o designer · Bloqueado",
      approval: "Revisão interna", client_approval: "Com o cliente", scheduled: "Agendado", published: "No ar",
    });
  });

  it("no meio da frase vai em minúscula", () => {
    expect(rotuloEmFrase("client_approval")).toBe("com o cliente");
    expect(rotuloEmFrase("published")).toBe("no ar");
  });

  it("nenhum nome antigo sobrou", () => {
    const nomes = ETAPAS.map((e) => e.rotulo).join(" ");
    for (const velho of ["Ideias", "Roteiro", "Em Produção", "Aprovação Social Media", "Aprovação Cliente", "Publicado", "Fila / Pra Fazer"]) {
      expect(nomes).not.toContain(velho);
    }
  });

  it("cor é token do design system (funciona nos dois temas)", () => {
    for (const e of ETAPAS) expect(e.cor).toMatch(/^bg-(muted-foreground|chart-\d|lone-(warning|info|success))$/);
  });
});

describe("grupos que as regras usam", () => {
  it("trabalho prometido: do designer até o cliente (Pauta é backlog; agendado já saiu)", () => {
    expect(statusDasEtapas(...ETAPAS_COMPROMETIDAS)).toEqual(["in_production", "blocked", "approval", "client_approval"]);
    expect(statusDasEtapas(...ETAPAS_FINAIS)).toEqual(["scheduled", "published"]);
  });

  it("passou da entrega: revisão em diante", () => {
    expect(TODOS.filter((s) => passouDaEntrega(s))).toEqual(["approval", "client_approval", "scheduled", "published"]);
  });

  it("ordem para ordenar cards por etapa", () => {
    expect(ordemDoStatus("script")).toBe(ordemDoStatus("ideas"));
    expect(ordemDoStatus("blocked")).toBe(ordemDoStatus("in_production"));
    expect(ordemDoStatus("published")).toBeGreaterThan(ordemDoStatus("scheduled"));
  });
});
