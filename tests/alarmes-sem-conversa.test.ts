// tests/alarmes-sem-conversa.test.ts — o alarme "gastou sem conversa" (lib/traffic/alarmes/sem-conversa.ts).
// Os números imitam a Reformar construção de outubro/2026, o caso que motivou o alarme.

import { describe, it, expect } from "vitest";
import {
  lerSemConversa, decidirSemConversa, diasAntes, textoSemConversa, falaSemConversa, type DiaCampanha,
} from "@/lib/traffic/alarmes/sem-conversa";

/** 14 dias normais antes de `hoje`: campanha de mensagem com 130/dia e 15 conversas, perfil com 10/dia e nada. */
function historico(hoje: string, o: { gasto?: number; conversas?: number } = {}): DiaCampanha[] {
  return diasAntes(hoje, 14).flatMap((data) => [
    { data, campanhaId: "msg", gasto: o.gasto ?? 130, conversas: o.conversas ?? 15 },
    { data, campanhaId: "perfil", gasto: 10, conversas: 0 },
  ]);
}

describe("diasAntes", () => {
  it("devolve os n dias anteriores, o mais antigo primeiro, atravessando o mês", () => {
    expect(diasAntes("2026-11-02", 3)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
  });
});

describe("leitura", () => {
  it("só conta campanha de mensagem: a de perfil não faz a conta parecer morta", () => {
    const linhas = [...historico("2026-10-17"),
      { data: "2026-10-17", campanhaId: "perfil", gasto: 135, conversas: 0 },
      { data: "2026-10-17", campanhaId: "msg", gasto: 40, conversas: 3 }];
    const l = lerSemConversa({ linhas, hoje: "2026-10-17", cplMeta: 6.92 });
    expect(l.campanhasDeMensagem).toBe(1);
    expect(l.gastoHoje).toBe(40);
    expect(l.conversasHoje).toBe(3);
    expect(decidirSemConversa(l, false)).toBeNull();
  });

  it("custo de referência é o maior entre a meta e o real (custo subindo não vira 'WhatsApp caiu')", () => {
    const l = lerSemConversa({ linhas: historico("2026-10-22"), hoje: "2026-10-22", cplMeta: 20 });
    expect(l.cplRef).toBe(20);
    expect(l.limite).toBe(80);
    const real = lerSemConversa({ linhas: historico("2026-10-22"), hoje: "2026-10-22", cplMeta: 6.92 });
    expect(real.cplRef).toBeCloseTo(130 / 15, 2);
    expect(real.limite).toBeCloseTo(4 * (130 / 15), 1);
  });

  it("conta pequena (menos de 10 conversas em 14 dias) não é julgada", () => {
    const linhas = diasAntes("2026-10-22", 14).map((data, i) => ({ data, campanhaId: "msg", gasto: 15, conversas: i % 3 === 0 ? 1 : 0 }));
    const l = lerSemConversa({ linhas, hoje: "2026-10-22", cplMeta: 5 });
    expect(l.elegivel).toBe(false);
    expect(l.motivo).toContain("conversas em 14 dias");
    expect(decidirSemConversa({ ...l, gastoHoje: 999 }, false)).toBeNull();
  });

  it("sem campanha de mensagem nos 14 dias: não é julgada", () => {
    const linhas = diasAntes("2026-10-22", 14).map((data) => ({ data, campanhaId: "perfil", gasto: 50, conversas: 0 }));
    expect(lerSemConversa({ linhas, hoje: "2026-10-22", cplMeta: 5 }).elegivel).toBe(false);
  });
});

describe("Reformar, 22 a 24/10", () => {
  const dia22 = (gastoHoje: number) => [...historico("2026-10-22"), { data: "2026-10-22", campanhaId: "msg", gasto: gastoHoje, conversas: 0 }];

  it("22/10 às 16h (R$ 31,85 sem conversa) ainda não toca; às 18h (R$ 43,85) toca", () => {
    const as16 = lerSemConversa({ linhas: dia22(31.85), hoje: "2026-10-22", cplMeta: 6.92 });
    expect(decidirSemConversa(as16, false)).toBeNull();
    const as18 = lerSemConversa({ linhas: dia22(43.85), hoje: "2026-10-22", cplMeta: 6.92 });
    expect(decidirSemConversa(as18, false)).toBe("novo");
    expect(as18.desde).toBe("2026-10-22");
    expect(as18.esperadas).toBeGreaterThanOrEqual(5);
  });

  it("23/10 às 8h: o dia 22 fechado já passou do limite → episódio novo (se ninguém foi avisado)", () => {
    const linhas = [...historico("2026-10-22"),
      { data: "2026-10-22", campanhaId: "msg", gasto: 75.93, conversas: 0 },
      { data: "2026-10-23", campanhaId: "msg", gasto: 5, conversas: 0 }];
    const l = lerSemConversa({ linhas, hoje: "2026-10-23", cplMeta: 6.92 });
    expect(l.diasZerados).toEqual(["2026-10-22"]);
    expect(l.gastoSemConversa).toBeCloseTo(80.93, 2);
    expect(l.desde).toBe("2026-10-22");
    expect(decidirSemConversa(l, false)).toBe("novo");
    // Já avisado ontem: o lembrete só sai com evidência de HOJE (R$ 5 de madrugada não basta).
    expect(decidirSemConversa(l, true)).toBeNull();
  });

  it("23/10 às 14h, episódio aberto: R$ 50 hoje sem conversa → lembrete", () => {
    const linhas = [...historico("2026-10-22"),
      { data: "2026-10-22", campanhaId: "msg", gasto: 75.93, conversas: 0 },
      { data: "2026-10-23", campanhaId: "msg", gasto: 50, conversas: 0 }];
    const l = lerSemConversa({ linhas, hoje: "2026-10-23", cplMeta: 6.92 });
    expect(decidirSemConversa(l, true)).toBe("lembrete");
  });

  it("dia sem gasto no meio do trecho (conta parada) não quebra nem soma", () => {
    const linhas = [...historico("2026-10-21"),
      { data: "2026-10-21", campanhaId: "msg", gasto: 0, conversas: 0 },
      { data: "2026-10-22", campanhaId: "msg", gasto: 60, conversas: 0 },
      { data: "2026-10-23", campanhaId: "msg", gasto: 0, conversas: 0 }];
    const l = lerSemConversa({ linhas, hoje: "2026-10-23", cplMeta: 6.92 });
    expect(l.diasZerados).toEqual(["2026-10-22"]);
    expect(l.gastoDiasZerados).toBe(60);
  });
});

describe("fechar", () => {
  it("duas conversas no dia fecham o episódio; uma só não fecha nem alarma", () => {
    const base = [...historico("2026-10-24"), { data: "2026-10-24", campanhaId: "msg", gasto: 90, conversas: 2 }];
    expect(decidirSemConversa(lerSemConversa({ linhas: base, hoje: "2026-10-24", cplMeta: 6.92 }), true)).toBe("fechar");
    expect(decidirSemConversa(lerSemConversa({ linhas: base, hoje: "2026-10-24", cplMeta: 6.92 }), false)).toBeNull();
    const uma = [...historico("2026-10-24"), { data: "2026-10-24", campanhaId: "msg", gasto: 90, conversas: 1 }];
    expect(decidirSemConversa(lerSemConversa({ linhas: uma, hoje: "2026-10-24", cplMeta: 6.92 }), true)).toBeNull();
  });
});

describe("textos", () => {
  const linhas = [...historico("2026-10-22"),
    { data: "2026-10-22", campanhaId: "msg", gasto: 75.93, conversas: 0 },
    { data: "2026-10-23", campanhaId: "msg", gasto: 138, conversas: 0 }];
  const l = lerSemConversa({ linhas, hoje: "2026-10-23", cplMeta: 6.92 });

  it("mensagem do grupo: quanto saiu, desde quando, o normal e o gestor marcado", () => {
    const t = textoSemConversa([{ nome: "Reformar construção", leitura: l, decisao: "lembrete", hoje: "2026-10-23", gestorTrecho: "@5522999999999" }], "14:05");
    expect(t).toContain("*Conta gastando sem receber conversa* (leitura das 14:05)");
    expect(t).toContain("*Reformar construção* continua sem conversa: gastou R$ 214 desde 22/10 e nenhuma conversa");
    expect(t).toContain("o normal seria ~");
    expect(t).toContain("@5522999999999");
    expect(t).toContain("WhatsApp Business");
  });

  it("várias contas: quem gastou mais sem conversa primeiro", () => {
    const pouco = { ...l, gastoSemConversa: 40, desde: "2026-10-23" };
    const t = textoSemConversa([
      { nome: "Loja Pequena", leitura: pouco, decisao: "novo", hoje: "2026-10-23", gestorTrecho: "" },
      { nome: "Reformar", leitura: l, decisao: "novo", hoje: "2026-10-23", gestorTrecho: "" },
    ], "10:05");
    expect(t).toContain("*2 contas gastando sem receber conversa*");
    expect(t.indexOf("Reformar")).toBeLessThan(t.indexOf("Loja Pequena"));
    expect(t).toContain("*Loja Pequena* gastou R$ 40 hoje e nenhuma conversa");
  });

  it("voz: frase curta com reais e desde quando", () => {
    expect(falaSemConversa("Reformar construção", { leitura: l, hoje: "2026-10-23" }).titulo)
      .toBe("Reformar construção gastou 214 reais desde o dia 22 sem nenhuma conversa");
    expect(falaSemConversa("Loja", { leitura: { ...l, desde: "2026-10-23", gastoSemConversa: 40 }, hoje: "2026-10-23" }).titulo)
      .toBe("Loja gastou 40 reais hoje sem nenhuma conversa");
  });
});
