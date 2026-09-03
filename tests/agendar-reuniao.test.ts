import { describe, it, expect } from "vitest";
import { lerIntencaoReuniao, sugerirHorarios, textoOferta } from "@/lib/cs/agendar-reuniao";

// Quarta, 02/09/2026, 10h de SP.
const AGORA = new Date("2026-09-02T13:00:00Z");
const ler = (t: string) => lerIntencaoReuniao(t, AGORA);

describe("o cliente marcou: agenda", () => {
  for (const frase of [
    "podemos fazer a reunião dia 18 às 14h",
    "reunião quinta às 15h pode ser?",
    "marca aí pra dia 18 às 10h",
    "consigo dia 18/09 às 16h",
    "fechado, reunião amanhã às 11h",
  ]) {
    it(`entende: "${frase}"`, () => {
      const r = ler(frase);
      expect(r.tipo).toBe("agendar");
      if (r.tipo === "agendar") expect(r.iso).toMatch(/^2026-09-\d\dT\d\d:00:00-03:00$/);
    });
  }
});

describe("falou de marcar mas não disse quando: pergunta", () => {
  for (const frase of [
    "bora marcar a reunião desse mês",
    "podemos agendar a call?",
    "reunião quinta pode ser?",           // dia sem hora
    "reunião dia 18 de manhã",            // período, não horário
  ]) {
    it(`pergunta em vez de chutar: "${frase}"`, () => {
      expect(ler(frase).tipo).toBe("perguntar_horario");
    });
  }

  it("o motivo da pergunta é específico", () => {
    const r = ler("reunião dia 18 de manhã");
    if (r.tipo === "perguntar_horario") expect(r.motivo).toMatch(/hora exata/);
  });
});

describe("o que NÃO é agendamento", () => {
  it("data de promoção não vira reunião", () => {
    // O grupo do cliente é cheio de datas que não têm nada a ver com reunião.
    expect(ler("a promoção começa dia 18 às 8h").tipo).toBe("nenhuma");
    expect(ler("chega mercadoria dia 20 às 14h").tipo).toBe("nenhuma");
  });

  it("relato de reunião passada não agenda nada", () => {
    expect(ler("a reunião de ontem foi ótima").tipo).toBe("nenhuma");
    expect(ler("na última reunião a gente falou disso").tipo).toBe("nenhuma");
  });

  it("conversa comum", () => {
    expect(ler("bom dia, tudo bem?").tipo).toBe("nenhuma");
    expect(ler("").tipo).toBe("nenhuma");
  });
});

describe("recusa e remarcação", () => {
  it("não posso essa semana → recusa, sem inventar data", () => {
    expect(ler("não consigo reunião essa semana").tipo).toBe("recusa");
  });

  it("mas com contraproposta, agenda a contraproposta", () => {
    // "não posso terça, pode quarta às 10h" está propondo quarta.
    const r = ler("não posso terça, a reunião pode ser quarta às 10h?");
    expect(r.tipo).toBe("agendar");
  });

  it("pedido de remarcar sem horário vira recusa", () => {
    expect(ler("precisamos remarcar a reunião").tipo).toBe("recusa");
  });
});

describe("horários impossíveis viram pergunta, não agendamento", () => {
  it("madrugada", () => {
    expect(ler("reunião amanhã às 4h").tipo).toBe("perguntar_horario");
  });
  it("data no passado", () => {
    expect(ler("reunião dia 1 às 10h").tipo).toBe("agendar");   // dia 1 rola pro mês que vem
    expect(ler("reunião 01/08 às 10h").tipo).toBe("perguntar_horario");
  });
});

describe("o agente oferecendo horário", () => {
  it("sugere dias úteis, nunca fim de semana", () => {
    // Sexta, 04/09/2026 → as sugestões têm que pular sábado e domingo.
    const s = sugerirHorarios(new Date("2026-09-04T13:00:00Z"), 2);
    expect(s).toHaveLength(2);
    expect(s.join(" ")).not.toMatch(/sábado|domingo/);
  });

  it("a oferta traz opções concretas, não 'quando você pode?'", () => {
    const t = textoOferta("Contele", sugerirHorarios(AGORA, 2));
    expect(t).toContain("Contele");
    expect(t).toMatch(/Algum desses funciona/);
  });
});
