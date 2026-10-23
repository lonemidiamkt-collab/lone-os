// tests/cs-reuniao-citacao.test.ts — a resposta do social à reunião (auditoria 21/10/2026, 5.1).
//
// O erro original: com UMA reunião esperando o social, qualquer "ok/sim/👍" no grupo interno a
// confirmava — de qualquer pessoa, sobre qualquer assunto, até o "ok" de aprovar card — e o cliente
// recebia "📅 Confirmado!". E qualquer link de Meet colado ia para o cliente da única reunião sem
// link. Agora a resposta precisa CITAR a mensagem do agente, e só o responsável (ou a gestão) decide.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  acharCitada, citaPedidoDeLink, citaPerguntaDaReuniao, podeResponderPelaReuniao,
  textoCobrarSocial, textoFechado, textoPedeLink, textoPerguntaAoSocial,
} from "@/lib/cs/agendar-reuniao";
import { textoConflito } from "@/lib/cs/conflito-reuniao";

const RAIZ = path.resolve(__dirname, "..");
const pergunta = textoPerguntaAoSocial("Contele", "sexta, 24 de outubro às 14:00", "@5522997226048");

describe("a mensagem citada é a pergunta do agente sobre ESTA reunião?", () => {
  it("a pergunta, a cobrança do cron e o aviso de conflito valem", () => {
    expect(citaPerguntaDaReuniao(pergunta, "Contele")).toBe(true);
    expect(citaPerguntaDaReuniao(textoCobrarSocial("Contele", "sexta às 14:00", 2, "@x"), "Contele")).toBe(true);
    const conflito = textoConflito("Contele", "sexta às 14:00", { cliente: "Padaria" } as never, "@x");
    expect(citaPerguntaDaReuniao(conflito, "Contele")).toBe(true);
    // A revalidação de proposta vencida (inbound) e o texto antigo, de antes do deploy.
    expect(citaPerguntaDaReuniao("⏳ @x a *Contele* aceitou *sexta às 14:00*, mas essa proposta é de mais de um dia atrás. Esse horário ainda está de pé? Responde *nesta mensagem*: *ok* que eu fecho.", "Contele")).toBe(true);
    expect(citaPerguntaDaReuniao("📅 @x a *Contele* quer a reunião em *sexta*.\n\nResponde aqui: *ok* — ou manda outro horário que eu levo pra ele.", "Contele")).toBe(true);
  });

  it("o erro original: o 'ok' sem citar nada, ou citando a sugestão de um card, NÃO vale", () => {
    expect(citaPerguntaDaReuniao(undefined, "Contele")).toBe(false);
    expect(citaPerguntaDaReuniao("🆕 *NOVO PEDIDO — Contele*\n👤 Carlos\n\n📩 O cliente pediu:\n*Post da promoção*\n\n👉 Responde aqui: *ok* (crio o card) · *não*", "Contele")).toBe(false);
  });

  it("pergunta de OUTRO cliente não vale, nem com nome parecido", () => {
    expect(citaPerguntaDaReuniao(pergunta, "Padaria")).toBe(false);
    const matriz = textoPerguntaAoSocial("Contele Matriz", "sexta às 14:00", "");
    expect(citaPerguntaDaReuniao(matriz, "Contele")).toBe(false);
    expect(citaPerguntaDaReuniao(matriz, "Contele Matriz")).toBe(true);
  });

  it("o 'Fechado!' não é pergunta de horário — é o pedido do link", () => {
    const fechado = textoFechado("Contele", "sexta às 14:00") + textoPedeLink("@x");
    expect(citaPerguntaDaReuniao(fechado, "Contele")).toBe(false);
    expect(citaPedidoDeLink(fechado, "Contele")).toBe(true);
    expect(citaPedidoDeLink(fechado, "Padaria")).toBe(false);
    expect(citaPedidoDeLink(pergunta, "Contele")).toBe(false);
  });
});

describe("qual reunião a resposta cita", () => {
  const reunioes = [
    { id: "r1", cliente: "Contele", msgId: "MSG-1" },
    { id: "r2", cliente: "Padaria", msgId: null },
  ];

  it("pelo id da pergunta, mesmo sem texto citado", () => {
    expect(acharCitada(reunioes, "MSG-1", null, citaPerguntaDaReuniao)).toEqual({ tipo: "uma", item: reunioes[0] });
  });

  it("pelo texto citado quando o id não bate (id de envio ≠ id do reply)", () => {
    const p = textoPerguntaAoSocial("Padaria", "sexta", "");
    expect(acharCitada(reunioes, "OUTRO-ID", p, citaPerguntaDaReuniao)).toEqual({ tipo: "uma", item: reunioes[1] });
  });

  it("citou outra coisa: nenhuma", () => {
    expect(acharCitada(reunioes, "OUTRO-ID", "bom dia time", citaPerguntaDaReuniao).tipo).toBe("nenhuma");
  });

  it("o texto casa com duas: devolve as duas (o agente pergunta)", () => {
    const duas = [{ cliente: "A", msgId: null }, { cliente: "B", msgId: null }];
    const r = acharCitada(duas, "X", "q", () => true);
    expect(r.tipo).toBe("varias");
  });
});

describe("quem pode responder pela reunião", () => {
  it("o responsável pelo cliente (nome completo ou só o primeiro nome)", () => {
    expect(podeResponderPelaReuniao({ nome: "Carlos Eduardo", papel: "social" }, "Carlos")).toBe(true);
    expect(podeResponderPelaReuniao({ nome: "Carlos", papel: "social" }, "Carlos")).toBe(true);
  });

  it("a gestão", () => {
    expect(podeResponderPelaReuniao({ nome: "Roberto", papel: "admin" }, "Carlos")).toBe(true);
    expect(podeResponderPelaReuniao({ nome: "Julio", papel: "manager" }, "Carlos")).toBe(true);
  });

  it("o erro original: qualquer pessoa do grupo — outro social, designer, número fora do time — não", () => {
    expect(podeResponderPelaReuniao({ nome: "Pedro", papel: "social" }, "Carlos")).toBe(false);
    expect(podeResponderPelaReuniao({ nome: "Rodrigo", papel: "designer" }, "Carlos")).toBe(false);
    expect(podeResponderPelaReuniao(null, "Carlos")).toBe(false);
    expect(podeResponderPelaReuniao({ nome: "Ana", papel: "comercial" }, null)).toBe(false);
  });

  it("sem responsável cadastrado: qualquer pessoa do operacional", () => {
    expect(podeResponderPelaReuniao({ nome: "Pedro", papel: "social" }, null)).toBe(true);
  });
});

describe("a decisão no inbound (não só a regra)", () => {
  const fonte = readFileSync(path.join(RAIZ, "app/api/cs/inbound/route.ts"), "utf8");

  it("a resposta à reunião é lida DEPOIS de achar a demanda citada, e só citando a pergunta", () => {
    const iDemanda = fonte.indexOf("let demandaDaSugestao");
    const iReuniao = fonte.indexOf("ar.citaPerguntaDaReuniao");
    const iLink = fonte.indexOf("ar.citaPedidoDeLink");
    expect(iDemanda).toBeGreaterThan(0);
    expect(iReuniao).toBeGreaterThan(iDemanda);
    expect(iLink).toBeGreaterThan(iDemanda);
    expect(fonte).toContain("ar.podeResponderPelaReuniao(autoridade.autor");
  });

  it("o atalho antigo ('a única reunião esperando' / 'a única sem link') não existe mais", () => {
    expect(fonte).not.toMatch(/esperando\?\.length === 1/);
    expect(fonte).not.toMatch(/semLink\?\.length === 1/);
  });
});
