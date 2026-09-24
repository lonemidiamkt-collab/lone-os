// tests/linha-do-tempo.test.ts — a linha do tempo única do cliente (Leva 7C, N20).

import { describe, it, expect } from "vitest";
import { conversasPorDia, contarPorTipo, montarLinhaDoTempo, quandoDoRegistro } from "@/lib/clientes/linha-do-tempo";

const AGORA = new Date("2026-09-24T15:00:00Z");

describe("data do registro", () => {
  it("lê o carimbo pt-BR no fuso de São Paulo (hora do fato, não da inserção)", () => {
    expect(quandoDoRegistro("23/09/2026, 14:03:00", "2026-09-24T10:00:00Z")).toBe("2026-09-23T17:03:00.000Z");
    expect(quandoDoRegistro("23/09/2026 09:05", null)).toBe("2026-09-23T12:05:00.000Z");
  });
  it("sem carimbo legível, cai para o created_at", () => {
    expect(quandoDoRegistro("ontem", "2026-09-20T10:00:00Z")).toBe("2026-09-20T10:00:00.000Z");
    expect(quandoDoRegistro(null, null)).toBeNull();
  });
});

describe("conversa do grupo", () => {
  it("uma linha por dia, com a última mensagem do CLIENTE como assunto", () => {
    const ev = conversasPorDia([
      { created_at: "2026-09-23T12:00:00Z", is_team: false, author_name: "Ana", text: "Bom dia, conseguem mudar a arte?" },
      { created_at: "2026-09-23T12:10:00Z", is_team: true, author_name: "Carlos", text: "Consigo sim" },
      { created_at: "2026-09-23T13:00:00Z", is_team: false, author_name: "Ana", text: "Obrigada!" },
      { created_at: "2026-09-22T12:00:00Z", is_team: true, author_name: "Carlos", text: "Arte do dia" },
    ]);
    expect(ev).toHaveLength(2);
    const dia23 = ev.find((e) => e.id === "conv-2026-09-23")!;
    expect(dia23.titulo).toBe("Conversa no grupo: 3 mensagens (2 do cliente, 1 do time)");
    expect(dia23.detalhe).toBe("Ana: “Obrigada!”");
    expect(dia23.ator).toBe("Cliente");
    const dia22 = ev.find((e) => e.id === "conv-2026-09-22")!;
    expect(dia22.detalhe).toBeNull();
    expect(dia22.ator).toBe("Time");
  });
  it("mensagem das 23h de SP fica no dia de SP, não no dia UTC seguinte", () => {
    const ev = conversasPorDia([{ created_at: "2026-09-24T02:30:00Z", is_team: false, author_name: null, text: "oi" }]);
    expect(ev[0].id).toBe("conv-2026-09-23");
  });
});

describe("junção", () => {
  it("ordena do mais recente, mistura as fontes e mapeia o tipo", () => {
    const ev = montarLinhaDoTempo({
      registros: [
        { id: "r1", type: "content", actor: "Carlos", description: 'Post publicado: "Promo"', timestamp: "20/09/2026, 10:00:00", created_at: null },
        { id: "r2", type: "manual", actor: "Roberto", description: "Cliente pediu reforço no sábado", timestamp: "22/09/2026, 18:00:00", created_at: null },
        { id: "r3", type: "chat", actor: "Cliente", description: "Pedido do cliente: arte de sábado", timestamp: "21/09/2026, 09:00:00", created_at: null },
      ],
      perguntas: [{ id: "p1", origin_text: "Os anúncios estão rodando?", author_name: "Ana", status: "aberta", aberta_em: "2026-09-23T12:00:00Z", respondida_em: null }],
      nps: [{ id: "n1", nota: 9, respondido_em: "2026-09-19T12:00:00Z", motivo: null }],
      aprovacoes: [{ id: "c1", title: "Arte da promo", client_approved_at: "2026-09-19T15:00:00Z" }],
    }, { agora: AGORA });
    expect(ev.map((e) => e.tipo)).toEqual(["pedido", "nota", "pedido", "producao", "producao", "status"]);
    expect(ev[0].titulo).toBe("Pergunta do cliente (ainda sem resposta)");
    expect(ev.at(-1)!.titulo).toBe("NPS respondido: nota 9");
    expect(contarPorTipo(ev)).toEqual({ conversa: 0, reuniao: 0, producao: 2, pedido: 2, status: 1, nota: 1 });
  });

  it("reunião: a do registro vale; a da tabela só entra no dia que o registro não contou", () => {
    const ev = montarLinhaDoTempo({
      registros: [{ id: "r1", type: "meeting", actor: "Carlos", description: "Reunião mensal realizada — decisões: pausar campanha antiga", timestamp: "18/09/2026, 15:00:00", created_at: null }],
      reunioes: [
        { id: "m1", title: "Reunião mensal", start_at: "2026-09-18T17:00:00Z", estado: "realizada", responsavel: "Carlos", realizada_em: "2026-09-18T18:00:00Z" },
        { id: "m2", title: "Alinhamento de outubro", start_at: "2026-09-30T13:00:00Z", estado: "agendada", responsavel: "Carlos", realizada_em: null },
      ],
    }, { agora: AGORA });
    expect(ev.filter((e) => e.tipo === "reuniao").map((e) => e.titulo)).toEqual([
      "Reunião marcada: Alinhamento de outubro",
      "Reunião mensal realizada — decisões: pausar campanha antiga",
    ]);
  });

  it("linha repetida no mesmo dia (cron rodando duas vezes) aparece uma vez", () => {
    const r = { type: "design", actor: "Designer", description: 'Arte entregue: "Promo"', timestamp: "20/09/2026, 10:00:00", created_at: null };
    const ev = montarLinhaDoTempo({ registros: [{ id: "a", ...r }, { id: "b", ...r, timestamp: "20/09/2026, 11:00:00" }] }, { agora: AGORA });
    expect(ev).toHaveLength(1);
  });

  it("filtra por tipo e respeita o limite", () => {
    const registros = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`, type: i % 2 ? "manual" : "content", actor: null, description: `evento ${i}`,
      timestamp: `${String(10 + i).padStart(2, "0")}/09/2026, 10:00:00`, created_at: null,
    }));
    expect(montarLinhaDoTempo({ registros }, { tipos: ["nota"] })).toHaveLength(5);
    expect(montarLinhaDoTempo({ registros }, { limite: 3 }).map((e) => e.titulo)).toEqual(["evento 9", "evento 8", "evento 7"]);
  });
});
