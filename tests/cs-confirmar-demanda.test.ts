// tests/cs-confirmar-demanda.test.ts — o "ok" numa demanda do agente (auditoria 21/10/2026, 5.9).
//
// O erro original: quando o card não era criado (`criarCardDemanda` → null), a demanda ficava
// "confirmada" mesmo assim; o "ok" seguinte caía em "essa já foi decidida" e o pedido do cliente
// sumia sem card. E demanda sem cliente virava card no cliente de TESTE (CS_TEST_CLIENT_ID).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { bancoEmMemoria } from "./helpers/banco-em-memoria";
import {
  clienteDaDemanda, desfechoDaConfirmacao, textoFalhaConfirmacao, textoPautaParcial,
} from "@/lib/cs/confirmar-demanda";

const RAIZ = path.resolve(__dirname, "..");
const banco = bancoEmMemoria();
let resultadoCard: { id: string | null; erro: string | null } = { id: "card-1", erro: null };
let resultadoPauta: { ids: string[]; erros: string[] } = { ids: [], erros: [] };
const chamadasCard: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: banco.supabaseAdmin }));
vi.mock("@/lib/cs/card", () => ({
  criarCardDemandaDetalhado: async (o: Record<string, unknown>) => { chamadasCard.push(o); return resultadoCard; },
  criarCardsPautaDetalhado: async (o: Record<string, unknown>) => { chamadasCard.push(o); return resultadoPauta; },
}));

const { confirmarDemanda } = await import("@/lib/cs/confirmar-demanda-server");

const demanda = (p: Record<string, unknown> = {}) => ({
  id: "d1", codigo: "ab12", status: "pendente", client_id: "k1", cliente_nome: "Padaria",
  tipo: "arte_nova", urgencia: "media", resumo: "Post da promoção", briefing: "Pão em dobro",
  message_text: "faz um post da promoção", responsavel: "Rodrigo", content_card_id: null, ...p,
});
const linha = () => banco.db.cs_demandas[0];

beforeEach(() => {
  banco.limpar();
  banco.db.cs_demandas = [demanda()];
  resultadoCard = { id: "card-1", erro: null };
  resultadoPauta = { ids: [], erros: [] };
  chamadasCard.length = 0;
});
afterEach(() => { delete process.env.CS_TEST_CLIENT_ID; });

describe("confirmar só com card criado", () => {
  it("o erro original: card que falha deixa a demanda PENDENTE, com o motivo — e o próximo ok funciona", async () => {
    resultadoCard = { id: null, erro: "insert or update violates foreign key" };
    const r1 = await confirmarDemanda(linha(), { quem: "Carlos" });
    expect(r1).toMatchObject({ ok: false, motivo: "card_falhou" });
    expect(linha()).toMatchObject({ status: "pendente", content_card_id: null, erro_card: "insert or update violates foreign key" });

    resultadoCard = { id: "card-2", erro: null };
    const r2 = await confirmarDemanda(linha(), { quem: "Carlos" });
    expect(r2).toMatchObject({ ok: true, cardId: "card-2" });
    expect(linha()).toMatchObject({ status: "confirmada", content_card_id: "card-2", decided_by: "Carlos" });
  });

  it("o erro original: sem cliente, recusa — nada de cliente de teste, mesmo com CS_TEST_CLIENT_ID no ambiente", async () => {
    process.env.CS_TEST_CLIENT_ID = "cliente-de-teste";
    banco.db.cs_demandas = [demanda({ client_id: null })];
    const r = await confirmarDemanda(linha(), { quem: "Carlos" });
    expect(r).toMatchObject({ ok: false, motivo: "sem_cliente" });
    expect(chamadasCard).toHaveLength(0);
    expect(linha().status).toBe("pendente");
  });

  it("ajuste de arte vai pro card que já existe (o painel não mandava o card do ajuste)", async () => {
    banco.db.cs_demandas = [demanda({ tipo: "ajuste_arte", content_card_id: "card-antigo" })];
    resultadoCard = { id: "card-antigo", erro: null };
    await confirmarDemanda(linha(), { quem: "Carlos" });
    expect(chamadasCard[0]).toMatchObject({ ajusteCardId: "card-antigo", clientId: "k1" });
  });

  it("título e briefing de quem confirmou vão pro card; resumo novo é gravado junto do 'confirmada'", async () => {
    await confirmarDemanda(linha(), { quem: "Carlos", titulo: "Promo de sexta", briefing: "Pão + café", gravar: { resumo: "Promo de sexta" } });
    expect(chamadasCard[0]).toMatchObject({ titulo: "Promo de sexta", briefing: "Pão + café" });
    expect(linha()).toMatchObject({ status: "confirmada", resumo: "Promo de sexta" });
  });

  describe("pauta: um card por item", () => {
    const itens = [
      { dia: "2026-10-27", titulo: "Post A", descricao: "a", formato: "Post" },
      { dia: "2026-10-29", titulo: "Post B", descricao: "b", formato: "Post" },
      { dia: "2026-10-31", titulo: "Post C", descricao: "c", formato: "Story" },
    ];
    const pauta = () => demanda({ tipo: "pauta_semanal", message_text: JSON.stringify({ pauta: true, itens }) });

    it("nenhum card criado: continua pendente", async () => {
      banco.db.cs_demandas = [pauta()];
      resultadoPauta = { ids: [], erros: ["Post A: erro", "Post B: erro", "Post C: erro"] };
      const r = await confirmarDemanda(linha(), { quem: "Carlos" });
      expect(r).toMatchObject({ ok: false, motivo: "card_falhou", erro: "Post A: erro" });
      expect(linha().status).toBe("pendente");
    });

    it("parcial: confirma (refazer duplicaria os criados) e devolve o que faltou", async () => {
      banco.db.cs_demandas = [pauta()];
      resultadoPauta = { ids: ["c1", "c2"], erros: ["Post C: erro"] };
      const r = await confirmarDemanda(linha(), { quem: "Carlos" });
      expect(r).toMatchObject({ ok: true, cardId: "c1", criados: 2, total: 3, falhas: ["Post C: erro"] });
      expect(linha()).toMatchObject({ status: "confirmada", content_card_id: "c1" });
    });

    it("pauta sem itens legíveis: pendente, com o motivo", async () => {
      banco.db.cs_demandas = [demanda({ tipo: "pauta_semanal", message_text: "texto solto" })];
      const r = await confirmarDemanda(linha(), { quem: "Carlos" });
      expect(r).toMatchObject({ ok: false, motivo: "pauta_sem_itens" });
      expect(linha().status).toBe("pendente");
      expect(chamadasCard).toHaveLength(0);
    });
  });

  it("outra pessoa decidiu no meio: não sobrescreve a decisão dela", async () => {
    banco.db.cs_demandas = [demanda({ status: "descartada" })];
    const r = await confirmarDemanda(linha(), { quem: "Carlos" });
    expect(r.ok).toBe(true); // o card nasceu; o log avisa
    expect(linha().status).toBe("descartada");
  });
});

describe("regras puras", () => {
  it("desfecho", () => {
    expect(desfechoDaConfirmacao({ ids: [], total: 1, erros: ["x"] })).toEqual({ confirmar: false, motivo: "card_falhou", erro: "x" });
    expect(desfechoDaConfirmacao({ ids: ["a", "b"], total: 3, erros: ["C: falhou"] }))
      .toEqual({ confirmar: true, cardId: "a", criados: 2, total: 3, falhas: ["C: falhou"] });
  });

  it("cliente da demanda sem fallback", () => {
    process.env.CS_TEST_CLIENT_ID = "teste";
    expect(clienteDaDemanda({ client_id: null })).toBeNull();
    expect(clienteDaDemanda({ client_id: "" })).toBeNull();
    expect(clienteDaDemanda({ client_id: "k1" })).toBe("k1");
  });

  it("a frase de falha diz o que houve e o que fazer", () => {
    expect(textoFalhaConfirmacao("Post X", "card_falhou", "timeout")).toMatch(/continua aberta.*ok\* de novo/);
    expect(textoFalhaConfirmacao("Post X", "sem_cliente", "")).toMatch(/não tem cliente vinculado/);
    expect(textoPautaParcial(2, 3, ["C: erro"])).toMatch(/2 de 3/);
    expect(textoPautaParcial(3, 3, [])).toBe("");
  });
});

describe("a decisão nas rotas (não só a regra)", () => {
  const inbound = readFileSync(path.join(RAIZ, "app/api/cs/inbound/route.ts"), "utf8");
  const decide = readFileSync(path.join(RAIZ, "app/api/cs/decide/route.ts"), "utf8");

  it("nenhum caminho de confirmação cai mais no cliente de teste nem marca 'confirmada' por conta própria", () => {
    for (const fonte of [inbound, decide]) {
      expect(fonte).not.toMatch(/client_id as string\) \|\| process\.env\.CS_TEST_CLIENT_ID/);
      expect(fonte).not.toMatch(/status: "confirmada"/);
      expect(fonte).toContain("confirmarDemanda(");
    }
  });
});
