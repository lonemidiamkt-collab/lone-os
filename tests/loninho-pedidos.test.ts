import { describe, it, expect } from "vitest";
import { lerPedidoDoTime } from "@/lib/loninho/pedidos/detectar";
import { COMANDOS_EXISTENTES, PEDIDOS_PDF, manualTexto, pedidosParaOAgente } from "@/lib/loninho/pedidos/catalogo";

const id = (t: string) => lerPedidoDoTime(t)?.id ?? null;

describe("o Loninho reconhece os pedidos do Roberto", () => {
  it("atenção de hoje", () => {
    expect(id("Loninho me manda os clientes que precisam da minha atenção hoje")).toBe("atencao_hoje");
    expect(id("loninho, quem precisa de mim hoje?")).toBe("atencao_hoje");
    expect(id("Lone, me passa os clientes em risco")).toBe("atencao_hoje");
    expect(lerPedidoDoTime("Lone, clientes em risco da equipe")?.escopo).toBe("equipe");
    expect(lerPedidoDoTime("Loninho me manda os clientes que precisam da minha atenção hoje")?.escopo).toBe("meu");
  });
  it("resultados da semana — bons, ruins ou os dois", () => {
    expect(lerPedidoDoTime("Loninho me manda os clientes que tiveram bons resultados essa semana")).toEqual({ id: "resultados_semana", escopo: "meu", foco: "bons" });
    expect(lerPedidoDoTime("loninho quem foi mal essa semana?")?.foco).toBe("ruins");
    expect(lerPedidoDoTime("Loninho, me manda os que tiveram bons resultados essa semana e os que não tiveram")?.foco).toBe("todos");
    expect(id("Lone, resultados da semana?")).toBe("resultados_semana");
  });
  it("diagnóstico e manual", () => {
    expect(id("Loninho, me manda o diagnóstico do tráfego")).toBe("diagnostico_trafego");
    expect(id("Lone, como estão as contas hoje?")).toBe("diagnostico_trafego");
    expect(id("Loninho, o que você sabe fazer?")).toBe("manual");
    expect(id("Lone me manda o manual")).toBe("manual");
  });
});

describe("e NÃO dispara à toa", () => {
  it("sem chamar pelo nome, nada", () => {
    expect(id("me manda os clientes que precisam de atenção hoje")).toBeNull();
  });
  it("'Lone Mídia' não é chamar o agente", () => {
    expect(id("A Lone Mídia manda os resultados da semana pro cliente?")).toBeNull();
  });
  it("só citar o assunto, sem pedir, não dispara", () => {
    expect(id("Loninho, o Julio falou dos resultados da semana na reunião")).toBeNull();
  });
  it("comandos antigos continuam com o dono antigo", () => {
    expect(id("Lone, o que preciso fazer hoje?")).toBeNull();     // prioridades em texto
    expect(id("Lone, raio-x do Bruno Tintas")).toBeNull();
    expect(id("Lone, monta o calendário mensal da Veneza")).toBeNull();
    expect(id("Loninho, transforma esse texto em pdf pro Varejão")).toBeNull();
  });
});

describe("o manual sai do catálogo", () => {
  it("tem todo pedido e todo comando, com as frases", () => {
    const m = manualTexto();
    for (const p of PEDIDOS_PDF.filter((x) => x.id !== "manual")) expect(m).toContain(p.exemplos[0]);
    for (const c of COMANDOS_EXISTENTES) expect(m).toContain(c.exemplos[0]);
  });
  it("cada frase de exemplo dos pedidos em PDF é reconhecida pelo detector — manual não ensina frase que falha", () => {
    for (const p of PEDIDOS_PDF) for (const ex of p.exemplos) expect(id(ex), ex).toBe(p.id);
  });
  it("a auto-descrição do agente lista os pedidos", () => {
    expect(pedidosParaOAgente()).toContain("me manda os clientes que precisam da minha atenção hoje");
  });
});

import { textoAtencao, vazio, type DadosAtencao } from "@/lib/loninho/pedidos/atencao";
import { lerLinhas } from "@/lib/reports/avisoPdf";

describe("relatório de atenção", () => {
  const dados: DadosAtencao = {
    prioridades: [{ cliente: "Maicon Minerais", titulo: "Conta parada", fato: "Gasto zero hoje até 11h", faca: "Conferir o pagamento", exposicaoRs: 62 }],
    clientes: [{ cliente: "Óticas Raki", critico: true, motivos: ["Sem post há 9 dias", "Cliente quieto há 12 dias"], proximaAcao: "Ligar pro dono", responsavel: "Julio", prazo: "2026-10-07" }],
    trafego: [{ cliente: "Léo Carros", tipo: "saldo_zerado", desde: "08h00" }],
    maisPrioridades: 3, falhas: [],
  };
  it("traz as três fontes, com fato e o que fazer", () => {
    const t = textoAtencao(dados, { nome: "Roberto Lino", equipe: false, quando: "segunda, 05/10 · 13h30" });
    expect(t).toContain("*Atenção de hoje — Roberto*");
    expect(t).toContain("• *Maicon Minerais* — Conta parada (R$ 62/dia em jogo)");
    expect(t).toContain("Faça: Conferir o pagamento");
    expect(t).toContain("E mais 3 no /agente");
    expect(t).toContain("• *Óticas Raki* — em risco: Sem post há 9 dias; Cliente quieto há 12 dias");
    expect(t).toContain("Próxima ação: Ligar pro dono · Julio · até 07/10");
    expect(t).toContain("• *Léo Carros* — saldo zerado (desde 08h00)");
  });
  it("fonte que falhou aparece escrita — seção vazia por erro não parece 'tudo bem'", () => {
    const t = textoAtencao({ ...dados, falhas: ["saúde da carteira"] }, { nome: "Julio", equipe: false, quando: "x" });
    expect(t).toContain("Não consegui ler: saúde da carteira");
  });
  it("o PDF padrão lê títulos e itens do texto", () => {
    const linhas = lerLinhas(textoAtencao(dados, { nome: "Julio", equipe: true, quando: "x" }));
    expect(linhas.filter((l) => l.tipo === "titulo").length).toBeGreaterThanOrEqual(3);
    expect(linhas.filter((l) => l.tipo === "item").length).toBe(3);
  });
  it("vazio de verdade é vazio", () => {
    expect(vazio({ prioridades: [], clientes: [], trafego: [], maisPrioridades: 0, falhas: [] })).toBe(true);
  });
});
