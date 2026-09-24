// tests/trafego-visto.test.ts — a regra do "visto" dos alertas de tráfego (Leva 4).
//
// Um alerta visto fica quieto por 24h em todos os canais (Hoje, Defesa Ativa, WhatsApp, PDF do
// diagnóstico, Início), a menos que piore. Se esta regra afrouxar, o gestor deixa de ser avisado de
// uma conta que foi de "saldo baixo" pra "saldo zerado"; se apertar, o grupo volta a repetir o que
// ele já está resolvendo.

import { describe, it, expect } from "vitest";
import {
  VISTO_HORAS, chaveVisto, estaVisto, filtrarDiagnosticoVisto, fimDoVisto, mapaDeVistos, nivelDaAnomalia,
  ocultarVistosNoInicio, prazoDoVisto, tipoDoProblemaInicio, vistoVale, type VistoRow,
} from "@/lib/traffic/hoje/visto";

const H = 3_600_000;
const MARCADO = new Date("2026-09-24T12:00:00Z"); // 9h em São Paulo
const depois = (horas: number) => new Date(MARCADO.getTime() + horas * H);

const visto = (o: Partial<VistoRow> = {}): VistoRow => ({
  client_id: "c1", tipo: "saldo", nivel: "warning", seen_by: "julio@lonemidia.com", seen_by_name: "Julio",
  seen_at: MARCADO.toISOString(), until: null, ...o,
});

describe("vistoVale — prazo", () => {
  it("vale dentro das 24h e cai depois delas", () => {
    expect(VISTO_HORAS).toBe(24);
    expect(vistoVale(visto(), "warning", depois(1))).toBe(true);
    expect(vistoVale(visto(), "warning", depois(23.9))).toBe(true);
    expect(vistoVale(visto(), "warning", depois(24))).toBe(false);
    expect(vistoVale(visto(), "warning", depois(30))).toBe(false);
  });

  it("`until` gravado vence as 24h (adiar por 48h)", () => {
    const v = visto({ until: depois(48).toISOString() });
    expect(vistoVale(v, "warning", depois(30))).toBe(true);
    expect(vistoVale(v, "warning", depois(48))).toBe(false);
  });

  it("data inválida nunca cala nada", () => {
    expect(vistoVale(visto({ seen_at: "lixo" }), "info", depois(1))).toBe(false);
  });

  it("prazo de um visto novo: 24h por padrão, até 72h, fora disso volta ao padrão", () => {
    expect(prazoDoVisto(MARCADO)).toBe(depois(24).toISOString());
    expect(prazoDoVisto(MARCADO, 48)).toBe(depois(48).toISOString());
    expect(prazoDoVisto(MARCADO, 0)).toBe(depois(24).toISOString());
    expect(prazoDoVisto(MARCADO, 500)).toBe(depois(24).toISOString());
    expect(fimDoVisto(visto())).toBe(depois(24).getTime());
  });
});

describe("vistoVale — piorou, volta", () => {
  it("visto em atenção NÃO cala o crítico (saldo baixo → saldo zerado)", () => {
    expect(vistoVale(visto({ nivel: "warning" }), "critical", depois(1))).toBe(false);
  });

  it("visto em info não cala atenção nem crítico", () => {
    expect(vistoVale(visto({ nivel: "info" }), "warning", depois(1))).toBe(false);
    expect(vistoVale(visto({ nivel: "info" }), "info", depois(1))).toBe(true);
  });

  it("melhorar não reabre: visto em crítico continua valendo se cair pra atenção", () => {
    expect(vistoVale(visto({ nivel: "critical" }), "warning", depois(1))).toBe(true);
    expect(vistoVale(visto({ nivel: "critical" }), "critical", depois(1))).toBe(true);
  });

  it("nível gravado estranho conta como info (não cala nada acima)", () => {
    expect(vistoVale(visto({ nivel: "???" }), "warning", depois(1))).toBe(false);
  });
});

describe("mapa de vistos", () => {
  it("chave = cliente + tipo; o registro mais novo vence", () => {
    const mapa = mapaDeVistos([
      visto({ seen_at: depois(-5).toISOString(), nivel: "critical" }),
      visto({ seen_at: MARCADO.toISOString(), nivel: "warning" }),
      visto({ client_id: "c2", tipo: "entrega" }),
    ]);
    expect(mapa.size).toBe(2);
    expect(mapa.get(chaveVisto("c1", "saldo"))?.nivel).toBe("warning");
  });

  it("estaVisto olha cliente, tipo, nível e prazo", () => {
    const mapa = mapaDeVistos([visto()]);
    expect(estaVisto(mapa, "c1", "saldo", "warning", depois(2))).toBe(true);
    expect(estaVisto(mapa, "c1", "entrega", "warning", depois(2))).toBe(false); // outro tipo
    expect(estaVisto(mapa, "c2", "saldo", "warning", depois(2))).toBe(false);   // outro cliente
    expect(estaVisto(mapa, "c1", "saldo", "critical", depois(2))).toBe(false);  // piorou
    expect(estaVisto(mapa, "c1", "saldo", "warning", depois(25))).toBe(false);  // venceu
    expect(estaVisto(mapa, null, "saldo", "warning", depois(2))).toBe(false);
    expect(estaVisto(mapaDeVistos(null), "c1", "saldo", "warning", depois(2))).toBe(false); // sem tabela
  });
});

describe("tradução das fontes", () => {
  it("anomalia: critical = crítico, high = atenção, medium = info", () => {
    expect(nivelDaAnomalia("critical")).toBe("critical");
    expect(nivelDaAnomalia("high")).toBe("warning");
    expect(nivelDaAnomalia("medium")).toBe("info");
    expect(nivelDaAnomalia(null)).toBe("info");
  });

  it("Início: só saldo, conta e entrega são de tráfego", () => {
    expect(tipoDoProblemaInicio("saldo")).toBe("saldo");
    expect(tipoDoProblemaInicio("conta")).toBe("conta");
    expect(tipoDoProblemaInicio("entrega")).toBe("entrega");
    expect(tipoDoProblemaInicio("relacionamento")).toBeNull();
    expect(tipoDoProblemaInicio("contrato")).toBeNull();
  });

  it("Início: o item visto some, o que piorou e o de outro assunto ficam", () => {
    const ocultar = ocultarVistosNoInicio(mapaDeVistos([visto()]), depois(1));
    const cliente = { id: "c1" };
    expect(ocultar({ problema: "saldo", severidade: "warning", cliente })).toBe(true);
    expect(ocultar({ problema: "saldo", severidade: "critical", cliente })).toBe(false);
    expect(ocultar({ problema: "relacionamento", severidade: "warning", cliente })).toBe(false);
    expect(ocultar({ problema: "saldo", severidade: "warning", cliente: null })).toBe(false);
  });
});

describe("PDF do diagnóstico sem o que já foi visto", () => {
  const item = (clientId: string) => ({ cliente: clientId, clientId, achado: "x", acao: "y", prioridade: 80 });
  const diag = {
    data: "2026-09-23", contasAtivas: 2, gastoOntem: 0, comPolitica: 0,
    funcoes: [
      { nome: "Contas sem entrega", pergunta: "?", itens: [item("c1"), item("c2")] },
      { nome: "Desperdício", pergunta: "?", itens: [item("c1")] },
      { nome: "Criativo cansado", pergunta: "?", itens: [item("c1")] },
      { nome: "Merece mais verba", pergunta: "?", itens: [item("c1")] },
    ],
  };

  it("tira só o item visto do cliente, no tipo visto; notícia boa nunca sai", () => {
    const mapa = mapaDeVistos([
      visto({ tipo: "entrega", nivel: "warning" }),
      visto({ tipo: "fadiga", nivel: "info" }),
    ]);
    const r = filtrarDiagnosticoVisto(diag, mapa, depois(1));
    const por = (nome: string) => r.funcoes.find((f) => f.nome === nome)!.itens.map((i) => i.clientId);
    expect(por("Contas sem entrega")).toEqual(["c2"]);
    expect(por("Desperdício")).toEqual(["c1"]);          // não foi visto
    expect(por("Criativo cansado")).toEqual([]);
    expect(por("Merece mais verba")).toEqual(["c1"]);    // dica, não alerta
    expect(r.data).toBe(diag.data);
  });

  it("visto vencido não tira nada; sem vistos devolve o mesmo diagnóstico", () => {
    const mapa = mapaDeVistos([visto({ tipo: "entrega" })]);
    expect(filtrarDiagnosticoVisto(diag, mapa, depois(25)).funcoes[0].itens).toHaveLength(2);
    expect(filtrarDiagnosticoVisto(diag, new Map(), depois(1))).toBe(diag);
  });
});
