import { describe, it, expect } from "vitest";
import { dataDoTitulo, dataDoPost } from "@/lib/cs/data-do-post";

// 10/09/2026 é uma quinta-feira. 11/09/2026 é sexta.
const HOJE = "2026-09-10";

describe("a data que o social escreveu no título", () => {
  it("o caso real que gerou a cobrança errada", () => {
    // Card cobrado como "o post é HOJE" (due_date 10/09) quando o título diz sexta 11.
    expect(dataDoTitulo("[Gabriel] SEX 11 - Ecoflow", HOJE)).toBe("2026-09-11");
  });

  for (const [titulo, esperado] of [
    ["QUA 09 - Encarte", "2026-09-09"],
    ["[Rodrigo]SEX 11 - Dermatologico", "2026-09-11"],
    ["TER 08 - Telha", "2026-09-08"],
    ["seg 14 - promoção", "2026-09-14"],
    ["SÁB 12 - plantão", "2026-09-12"],
  ] as const) {
    it(`lê "${titulo}"`, () => expect(dataDoTitulo(titulo, HOJE)).toBe(esperado));
  }

  it("atravessa o mês: card de fim de setembro apontando pra outubro", () => {
    // 01/10/2026 é uma quinta.
    expect(dataDoTitulo("QUI 01 - lançamento", "2026-09-28")).toBe("2026-10-01");
  });

  it("RECUSA quando o dia da semana não bate — título velho, card copiado", () => {
    // 11/09/2026 é sexta, não segunda. Os dois sinais discordam: não inventa.
    expect(dataDoTitulo("SEG 11 - reaproveitado", HOJE)).toBeNull();
  });

  it("recusa dia que não existe no mês", () => {
    expect(dataDoTitulo("SEX 31 - novembro", "2026-11-10")).toBeNull();
  });

  it("ignora título sem a convenção", () => {
    expect(dataDoTitulo("Arte: Sofá fixo MP2445", HOJE)).toBeNull();
    expect(dataDoTitulo("", HOJE)).toBeNull();
  });

  it("não confunde número solto com dia", () => {
    expect(dataDoTitulo("Mesa Berlim 120x80", HOJE)).toBeNull();
  });
});

describe("qual data vale para cobrar", () => {
  it("título ganha do due_date — é o que a pessoa programou", () => {
    const r = dataDoPost({ title: "SEX 11 - Ecoflow", due_date: "2026-09-10" }, HOJE);
    expect(r).toEqual({ data: "2026-09-11", fonte: "titulo" });
  });

  it("sem convenção no título, cai no due_date", () => {
    const r = dataDoPost({ title: "Arte avulsa", due_date: "2026-09-15" }, HOJE);
    expect(r).toEqual({ data: "2026-09-15", fonte: "due_date" });
  });

  it("sem nenhum dos dois, devolve null — e quem chama não cobra", () => {
    expect(dataDoPost({ title: "Arte avulsa", due_date: null }, HOJE)).toBeNull();
  });

  it("título com dia da semana ERRADO cai no due_date em vez de inventar", () => {
    const r = dataDoPost({ title: "SEG 11 - velho", due_date: "2026-09-14" }, HOJE);
    expect(r).toEqual({ data: "2026-09-14", fonte: "due_date" });
  });
});
