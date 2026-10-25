// tests/alarmes-ritmo-verba.test.ts — o ritmo da verba do mês (lib/traffic/alarmes/ritmo-verba.ts).
// Os casos são os clientes de outubro/2026 que motivaram a regra.

import { describe, it, expect } from "vitest";
import {
  lerRitmoVerba, ritmoUrgente, ritmoParaFila, fatoRitmo, acaoRitmo, textoRitmoUrgente, type EntradaRitmo,
} from "@/lib/traffic/alarmes/ritmo-verba";

const entrada = (o: Partial<EntradaRitmo> = {}): EntradaRitmo => ({
  verba: 1000, gastoMes: 774, gastoHoje: 0, hoje: "2026-10-25", serie7d: [32, 32, 32, 32, 32, 32, 32],
  isPrepaid: true, saldo: 500, contaAtiva: true, ...o,
});

describe("ritmo do mês", () => {
  it("Reformar em 24/10: R$ 3.882 de R$ 4.000 gastando ~R$ 120/dia → estoura em breve (hoje)", () => {
    const l = lerRitmoVerba(entrada({ verba: 4000, gastoMes: 3882, hoje: "2026-10-24", serie7d: [150, 106, 143, 68, 76, 138, 160], saldo: 3457 }));
    expect(l.nivel).toBe("estoura_em_breve");
    expect(l.diaEstouro).toBe(24);
    expect(ritmoUrgente(l)).toBe(true);
    expect(acaoRitmo(l, 3457)).toContain("Baixar a diária");
  });

  it("Reformar em 25/10: passou dos R$ 4.000 → estourou", () => {
    const l = lerRitmoVerba(entrada({ verba: 4000, gastoMes: 4006, gastoHoje: 124, hoje: "2026-10-25", serie7d: [106, 143, 68, 76, 138, 160, 160], saldo: 3333 }));
    expect(l.nivel).toBe("estourou");
    expect(fatoRitmo(l)).toContain("a verba do mês acabou");
    expect(acaoRitmo(l, 3333)).toBe("Pausar até o dia 1º ou combinar verba extra com o cliente.");
  });

  it("Maicon: tem saldo e gasta pouco → abaixo, subir a diária para fechar na verba", () => {
    const l = lerRitmoVerba(entrada({ verba: 2000, gastoMes: 960, hoje: "2026-10-24", serie7d: [25, 30, 18, 22, 20, 19, 21], saldo: 1144 }));
    expect(l.nivel).toBe("abaixo");
    expect(l.causa).toBe("diaria_baixa");
    expect(l.diariaNecessaria).toBe(130); // (2000 − 960) ÷ 8 dias (24 a 31)
    expect(acaoRitmo(l, 1144)).toBe("Subir a diária de ~R$ 22 para ~R$ 130/dia para fechar o mês na verba.");
    expect(ritmoUrgente(l)).toBe(false);
    expect(ritmoParaFila(l)).toBe(true);
  });

  it("Léo Carros: pré-pago com saldo zero → a causa é saldo, não diária (e não repete o aviso de saldo na fila)", () => {
    const l = lerRitmoVerba(entrada({ verba: 1800, gastoMes: 96, hoje: "2026-10-24", serie7d: [0, 0, 0, 0, 0, 0, 0], saldo: 0 }));
    expect(l.nivel).toBe("abaixo");
    expect(l.causa).toBe("sem_saldo");
    expect(acaoRitmo(l, 0)).toContain("Cobrar recarga do cliente");
    expect(ritmoParaFila(l)).toBe(false);
  });

  it("abaixo por pouco dinheiro não vale item na fila", () => {
    // Verba de R$ 200, fecha em ~R$ 160: 20% abaixo, mas só R$ 40.
    const l = lerRitmoVerba(entrada({ verba: 200, gastoMes: 120, hoje: "2026-10-24", serie7d: [5, 5, 5, 5, 5, 5, 5] }));
    expect(l.nivel).toBe("abaixo");
    expect(ritmoParaFila(l)).toBe(false);
  });

  it("conta inativa na Meta, ou 3 dias sem gasto com saldo, → conta parada", () => {
    expect(lerRitmoVerba(entrada({ gastoMes: 300, contaAtiva: false })).causa).toBe("conta_parada");
    const parada = lerRitmoVerba(entrada({ gastoMes: 300, isPrepaid: false, saldo: null, serie7d: [40, 40, 40, 40, 0, 0, 0] }));
    expect(parada.causa).toBe("conta_parada");
    expect(parada.diasParada).toBe(3);
    expect(acaoRitmo(parada, null)).toContain("não gasta há 3 dias");
  });

  it("no ritmo: projeção entre 85% e 110% da verba", () => {
    expect(lerRitmoVerba(entrada()).nivel).toBe("no_ritmo");
  });

  it("acima: projeção passa de 110% sem acabar a verba nos próximos dias", () => {
    const l = lerRitmoVerba(entrada({ gastoMes: 500, hoje: "2026-10-12", serie7d: [55, 55, 55, 55, 55, 55, 55] }));
    expect(l.nivel).toBe("acima");
    expect(l.causa).toBe("diaria_alta");
  });

  it("antes do dia 5 não cobra ritmo (mas verba estourada sempre conta)", () => {
    expect(lerRitmoVerba(entrada({ hoje: "2026-10-03", gastoMes: 10, serie7d: [5, 5, 5, 5, 5, 5, 5] })).nivel).toBe("no_ritmo");
    expect(lerRitmoVerba(entrada({ hoje: "2026-10-03", verba: 200, gastoMes: 210 })).nivel).toBe("estourou");
  });

  it("fim do mês: verba que dura até o último dia não é 'estoura em breve'", () => {
    // Dia 30 de 31, sobra 1,5 dia de gasto: acaba depois do mês.
    const l = lerRitmoVerba(entrada({ hoje: "2026-10-30", gastoMes: 952, serie7d: [32, 32, 32, 32, 32, 32, 32] }));
    expect(l.nivel).not.toBe("estoura_em_breve");
  });

  it("o gasto parcial de hoje não entra duas vezes na diária necessária", () => {
    const l = lerRitmoVerba(entrada({ verba: 3100, gastoMes: 1040, gastoHoje: 40, hoje: "2026-10-11" }));
    expect(l.diariaNecessaria).toBe(100); // (3100 − 1000) ÷ 21 dias (11 a 31)
  });

  it("sem verba ou sem gasto lido: não julga", () => {
    expect(lerRitmoVerba(entrada({ verba: null })).nivel).toBe("sem_verba");
    expect(lerRitmoVerba(entrada({ verba: 0 })).nivel).toBe("sem_verba");
    expect(lerRitmoVerba(entrada({ gastoMes: null })).nivel).toBe("sem_dados");
  });
});

describe("mensagem urgente", () => {
  it("uma linha por conta com o fato, a ação e o gestor; estourada primeiro", () => {
    const breve = lerRitmoVerba(entrada({ verba: 4000, gastoMes: 3882, hoje: "2026-10-24", serie7d: [150, 106, 143, 68, 76, 138, 160] }));
    const foi = lerRitmoVerba(entrada({ verba: 200, gastoMes: 215, hoje: "2026-10-24", serie7d: [10, 10, 10, 10, 10, 10, 10] }));
    const t = textoRitmoUrgente([
      { nome: "Reformar construção", leitura: breve, saldo: 3457, gestorTrecho: "@5522999999999" },
      { nome: "Madeirão Madeira", leitura: foi, saldo: 50, gestorTrecho: "Julio" },
    ], "08:05");
    expect(t).toContain("*2 contas com a verba do mês acabando* (leitura das 08:05)");
    expect(t.indexOf("Madeirão Madeira")).toBeLessThan(t.indexOf("Reformar"));
    expect(t).toContain("a verba acaba no dia 24");
    expect(t).toContain("@5522999999999");
  });
});
