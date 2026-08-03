// tests/cs-porta-voz.test.ts — o portão cala repetição SEM calar o que importa.
//
// O caso real (03/08): o bom-dia das 8h dizia "2 esfriando — Paradise (10d), Madeireira (9d)" e
// às 9h30 o cron cs-esfriando mandava os MESMOS dois clientes. Duas mensagens, zero informação
// nova. É o tipo de coisa que faz o time parar de ler o grupo.
//
// O risco do remédio é pior que a doença: um portão que cala demais engole aviso de verdade e
// ninguém descobre. Por isso metade destes testes existe pra provar que ele NÃO cala.

import { describe, it, expect, vi, beforeEach } from "vitest";

const linhas: { fatos: string[] | null }[] = [];
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            not: () => Promise.resolve({ data: linhas, error: null }),
          }),
        }),
      }),
    }),
  },
}));

import { avaliarFala, fatoEsfriando, fatoArteParada, fatoSemPauta } from "@/lib/cs/porta-voz";

beforeEach(() => { linhas.length = 0; });

describe("porta-voz — o que ele CALA", () => {
  it("cala o cron de esfriando quando o bom-dia já citou os mesmos clientes", async () => {
    linhas.push({ fatos: [fatoEsfriando("Paradise Suplementos"), fatoEsfriando("Madeireira D´Aldeia")] });
    const v = await avaliarFala(
      [fatoEsfriando("Paradise Suplementos"), fatoEsfriando("Madeireira D´Aldeia")], "interno",
    );
    expect(v.pode).toBe(false);
    expect(v.motivo).toContain("já falei hoje");
  });

  it("a chave ignora acento, caixa e pontuação — senão o dedupe nunca casa", () => {
    expect(fatoEsfriando("Madeireira D´Aldeia")).toBe(fatoEsfriando("madeireira d aldeia"));
    expect(fatoEsfriando("MADEIRÃO Madeira")).toBe(fatoEsfriando("Madeirão  Madeira"));
  });
});

describe("porta-voz — o que ele NÃO cala (o mais importante)", () => {
  it("deixa passar quando UM cliente é novo, mesmo com os outros repetidos", async () => {
    linhas.push({ fatos: [fatoEsfriando("Paradise Suplementos")] });
    const v = await avaliarFala(
      [fatoEsfriando("Paradise Suplementos"), fatoEsfriando("Cliente Novo")], "interno",
    );
    expect(v.pode).toBe(true);
    // E diz QUAL é o novo, pra rotina poder falar só dele.
    expect(v.ineditos).toEqual([fatoEsfriando("Cliente Novo")]);
  });

  it("NUNCA cala mensagem pro cliente — silêncio com cliente é dano, não economia", async () => {
    linhas.push({ fatos: [fatoEsfriando("Paradise Suplementos")] });
    const v = await avaliarFala([fatoEsfriando("Paradise Suplementos")], "cliente");
    expect(v.pode).toBe(true);
  });

  it("sem fato declarado, fala normal — o portão não cala no escuro", async () => {
    linhas.push({ fatos: [fatoEsfriando("Paradise Suplementos")] });
    expect((await avaliarFala([], "interno")).pode).toBe(true);
    expect((await avaliarFala(undefined, "interno")).pode).toBe(true);
  });

  it("assunto diferente não colide: esfriando e arte parada do MESMO cliente convivem", async () => {
    linhas.push({ fatos: [fatoEsfriando("Paradise Suplementos")] });
    const v = await avaliarFala([fatoArteParada("Paradise Suplementos")], "interno");
    expect(v.pode).toBe(true);
  });
});

describe("o caso real que motivou tudo: pauta de hoje dita duas vezes", () => {
  it("a vigilância cobra pelo nome às 8h e o disparo pro grupo das 8h30 cala", async () => {
    // 8h — vigilância manda "Oi Carlos! não vi card pra: Império, Dijana".
    linhas.push({ fatos: [fatoSemPauta("Império Material", "2026-08-03"), fatoSemPauta("DIJANA", "2026-08-03")] });
    // 8h30 — cs-postagem ia dizer a MESMA coisa pro grupo inteiro.
    const v = await avaliarFala(
      [fatoSemPauta("Império Material", "2026-08-03"), fatoSemPauta("DIJANA", "2026-08-03")], "interno",
    );
    expect(v.pode).toBe(false);
  });

  it("cliente que só o disparo do grupo pegou continua sendo avisado", async () => {
    linhas.push({ fatos: [fatoSemPauta("Império Material", "2026-08-03")] });
    const v = await avaliarFala(
      [fatoSemPauta("Império Material", "2026-08-03"), fatoSemPauta("Tindaro Solar", "2026-08-03")], "interno",
    );
    expect(v.pode).toBe(true);
  });

  it("o mesmo cliente em DIAS diferentes são fatos diferentes — véspera não é hoje", async () => {
    linhas.push({ fatos: [fatoSemPauta("Império Material", "2026-08-03")] });
    const v = await avaliarFala([fatoSemPauta("Império Material", "2026-08-04")], "interno");
    expect(v.pode).toBe(true);
  });
});
