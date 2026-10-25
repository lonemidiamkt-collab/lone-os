// tests/cs-plano-confirmacao.test.ts — o "cria" só abre os cards do plano CITADO (auditoria 25/10/2026,
// 11.2) e o calendário diz o que aconteceu com o PDF (11.9).
//
// O erro original: um "ok" solto, dado para confirmar uma demanda, abria os N cards do plano mais novo
// do grupo (janela de até 7 dias) e a demanda ficava sem confirmar. "O planejamento do B está aprovado"
// abria os do A. "ok" + "cria" em seguida duplicavam.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  decidirPedidoDoPlano, ehConfirmacaoSolta, pediuDesfazer, textoCalendarioPronto, textoCardsAbertos, textoCiteOPlano,
  textoPerguntaCriar,
} from "@/lib/cs/plano-confirmacao";
import { pediuParaCriar } from "@/lib/cs/plano-em-cards";

const RAIZ = path.resolve(__dirname, "..");

describe("o 'cria' só vale citando o plano", () => {
  it("o erro original: 'ok' solto com plano pendente NÃO abre cards — segue para a demanda", () => {
    for (const t of ["ok", "ok c6d4", "isso", "show", "fechou"]) {
      expect(pediuParaCriar(t)).toBe(true); // ainda é um "sim"...
      expect(decidirPedidoDoPlano({ texto: t, citouPlano: false, temPlanoPendente: true })).toBe("seguir"); // ...mas não do plano
    }
  });

  it("citando a mensagem do plano, qualquer 'sim' abre os cards DAQUELE plano", () => {
    expect(decidirPedidoDoPlano({ texto: "ok", citouPlano: true, temPlanoPendente: true })).toBe("criar");
    expect(decidirPedidoDoPlano({ texto: "cria", citouPlano: true, temPlanoPendente: false })).toBe("criar");
  });

  it("pedido explícito sem citar: pede a citação em vez de adivinhar o plano", () => {
    expect(decidirPedidoDoPlano({ texto: "cria os cards", citouPlano: false, temPlanoPendente: true })).toBe("pedir_citacao");
    expect(decidirPedidoDoPlano({ texto: "Lone, o planejamento do Bazar está aprovado", citouPlano: false, temPlanoPendente: true })).toBe("pedir_citacao");
  });

  it("sem plano pendente no grupo, nada a ver com plano: segue", () => {
    expect(decidirPedidoDoPlano({ texto: "cria os cards", citouPlano: false, temPlanoPendente: false })).toBe("seguir");
  });

  it("confirmação solta é curta e sem objeto", () => {
    expect(ehConfirmacaoSolta("ok")).toBe(true);
    expect(ehConfirmacaoSolta("ok mas antes muda o gancho do segundo post")).toBe(false);
    expect(ehConfirmacaoSolta("cria os cards")).toBe(false);
  });

  it("a instrução diz como confirmar e quais planos estão esperando", () => {
    const t = textoCiteOPlano([{ clienteNome: "Bazar", total: 12 }, { clienteNome: "Dijana", total: 8 }]);
    expect(t).toMatch(/citando a mensagem do plano/);
    expect(t).toContain("*Bazar* — 12 card(s)");
    expect(t).toContain("*Dijana* — 8 card(s)");
  });

  it("a pergunta pede a citação; a confirmação diz como desfazer", () => {
    expect(textoPerguntaCriar(12)).toMatch(/12 cards.*citando esta mensagem/);
    const ok = textoCardsAbertos({ criados: 10, total: 12, falharam: ["2026-11-03", "2026-11-05"] }, "Bazar");
    expect(ok).toMatch(/10 de 12/);
    expect(ok).toMatch(/Não consegui 2/);
    expect(ok).toMatch(/desfaz.*citando esta mensagem/);
    expect(textoCardsAbertos({ criados: 0, total: 3, falharam: ["a", "b", "c"] }, "Bazar")).not.toMatch(/desfaz/);
  });

  it("'desfaz' é curto e explícito", () => {
    expect(pediuDesfazer("desfaz")).toBe(true);
    expect(pediuDesfazer("cancela isso")).toBe(true);
    expect(pediuDesfazer("o cliente pediu pra desfazer a promoção do post de sexta e trocar a foto")).toBe(false);
  });
});

describe("o calendário diz o que aconteceu com o PDF (11.9)", () => {
  const pecas = [{ data: "2026-11-03", titulo: "Promoção de tintas" }, { data: "2026-11-05", titulo: "Antes e depois" }];

  it("PDF entregue: 'Pronto!' na legenda do próprio PDF", () => {
    expect(textoCalendarioPronto({ cliente: "Bazar", rotuloModo: "mensal", pecas, pdf: "enviado", salvo: true })).toMatch(/^📅 Pronto!/);
  });

  it("PDF que não saiu: nada de 'Pronto!' — a lista vai em texto", () => {
    const t = textoCalendarioPronto({ cliente: "Bazar", rotuloModo: "mensal", pecas, pdf: "falhou", salvo: true });
    expect(t).not.toMatch(/Pronto!/);
    expect(t).toMatch(/não consegui mandar o PDF/);
    expect(t).toContain("• 03/11 — Promoção de tintas");
    expect(textoCalendarioPronto({ cliente: "Bazar", rotuloModo: "mensal", pecas, pdf: "incerto", salvo: true })).toMatch(/pode ter chegado/);
  });

  it("'ficou salvo' só quando o planejamento foi gravado", () => {
    expect(textoCalendarioPronto({ cliente: "Bazar", rotuloModo: "mensal", pecas, pdf: "falhou", salvo: true })).toMatch(/ficou salvo/);
    const naoSalvo = textoCalendarioPronto({ cliente: "Bazar", rotuloModo: "mensal", pecas, pdf: "falhou", salvo: false });
    expect(naoSalvo).not.toMatch(/ficou salvo/);
    expect(naoSalvo).toMatch(/Não consegui salvar o planejamento/);
  });
});

describe("a decisão no inbound", () => {
  const inbound = readFileSync(path.join(RAIZ, "app/api/cs/inbound/route.ts"), "utf8");

  it("não existe mais o 'plano mais novo do grupo' sem citação", () => {
    expect(inbound).not.toContain("planoPendenteDe(");
    expect(inbound).toContain("planoCitado(msg.groupJid, msg.quotedMsgId)");
  });

  it("reserva o plano ANTES de criar os cards", () => {
    const i = inbound.indexOf("reservarPlano(citado.jobId)");
    const j = inbound.indexOf("criarCardsDoPlano(citado)");
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
  });

  it("o planejamento salvo é conferido (o upsert não é mais engolido)", () => {
    expect(inbound).not.toContain('}, { onConflict: "client_id,periodo" }).then(() => {}, () => {});');
  });
});
