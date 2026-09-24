import { describe, it, expect } from "vitest";
import { agregar } from "@/lib/priority/agregar";
import { normalizarDono } from "@/lib/priority/dono";
import { ranquear, fingerprintDe } from "@/lib/priority/motor";
import type { ItemBruto } from "@/lib/priority/tipos";

// Primeiro feed real (14/09): 263 itens, Império com 10 cards atrasados como 10 cartões, Carlos
// como duas pessoas. Isto é o que impede o feed de repetir o ruído do WhatsApp.

const equipe = [
  { nome: "Carlos Augusto", papel: "social" as const }, { nome: "Thiago", papel: "social" as const },
  { nome: "Julio", papel: "manager" as const }, { nome: "Rodrigo", papel: "designer" as const }, { nome: "Roberto Lino", papel: "admin" as const },
];
const card = (titulo: string, dias: number, extra: Partial<ItemBruto> = {}): ItemBruto => ({
  fonte: "producao", clientId: "imp", cliente: "Império", entityRef: titulo, motivo: "card_atrasado",
  titulo: `Império: "${titulo}" atrasado há ${dias} dias`, fato: [`Post "${titulo}" está ${dias} dias depois da data`],
  recomendacao: "Postar", severidade: 50 + dias * 8, urgencia: 90, confianca: 0.95, exposicaoRs: null, reversivel: false,
  ownerRole: "social", owner: "Carlos Augusto", nivelPolicy: "C", ...extra,
});

describe("dono com o nome do cadastro", () => {
  it("'Carlos' e 'Carlos Augusto' são a mesma pessoa; papel escrito vira papel; escalada fica com o primeiro", () => {
    expect(normalizarDono("Carlos", "social", equipe)).toEqual({ owner: "Carlos Augusto", ownerRole: "social" });
    expect(normalizarDono("carlos augusto", "designer", equipe)).toEqual({ owner: "Carlos Augusto", ownerRole: "social" });
    expect(normalizarDono("social", "social", equipe)).toEqual({ owner: null, ownerRole: "social" });
    expect(normalizarDono("time", "social", equipe)).toEqual({ owner: null, ownerRole: "manager" });
    expect(normalizarDono("Julio e Roberto", "social", equipe)).toEqual({ owner: "Julio", ownerRole: "manager" });
    expect(normalizarDono("Pedro Henrique", "social", equipe)).toEqual({ owner: "Pedro Henrique", ownerRole: "social" }); // ex-funcionário: fica como veio
    expect(normalizarDono(null, "traffic", equipe)).toEqual({ owner: null, ownerRole: "traffic" });
  });
});

describe("uma recomendação por problema", () => {
  it("10 cards atrasados do mesmo cliente viram 1 item, com a lista dentro e severidade com teto", () => {
    const itens = Array.from({ length: 10 }, (_, i) => card(`Piso ${i + 1}`, 11));
    const r = agregar(itens);
    expect(r).toHaveLength(1);
    expect(r[0].titulo).toBe("Império: 10 posts atrasados (11 dias)");
    expect(r[0].fato[0]).toMatch(/10 posts atrasados, há 11 dias: "Piso 1", .* e mais 4/);
    expect(r[0].severidade).toBe(Math.min(100, 50 + 11 * 8 + 15));
    expect(fingerprintDe(r[0])).toBe("producao|imp|-|card_atrasado"); // continua o mesmo enquanto o problema durar
  });

  it("faixa de dias quando variam; item único não muda; clientes diferentes não se misturam", () => {
    const r = agregar([card("A", 11), card("B", 26), card("C", 3, { clientId: "bru", cliente: "Bruno" })]);
    const imp = r.find((x) => x.cliente === "Império")!;
    expect(imp.titulo).toBe("Império: 2 posts atrasados (11–26 dias)");
    const bru = r.find((x) => x.cliente === "Bruno")!;
    expect(bru.titulo).toContain('"C" atrasado há 3 dias');
  });

  it("tarefas vencidas agregam por PESSOA, com fingerprint por pessoa", () => {
    const t = (n: string, owner: string): ItemBruto => ({
      fonte: "tarefa", clientId: null, cliente: "Lone", entityRef: n, motivo: "tarefa_atrasada", titulo: `Tarefa "${n}" vencida há 5 dias`,
      fato: ["Prazo era 09/09"], recomendacao: "Concluir", severidade: 60, urgencia: 85, confianca: 0.95, reversivel: true, ownerRole: "social", owner, nivelPolicy: "C",
    });
    const r = ranquear(agregar([t("a", "Thiago"), t("b", "Thiago"), t("c", "Thiago"), t("d", "Carlos Augusto"), t("e", "Carlos Augusto")]), { importanciaCliente: {} });
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.fingerprint).sort()).toEqual(["tarefa|-|pessoa:Carlos Augusto|tarefa_atrasada", "tarefa|-|pessoa:Thiago|tarefa_atrasada"]);
    expect(r.find((x) => x.owner === "Thiago")!.titulo).toBe("Thiago: 3 tarefas vencidas (5 dias)");
  });
});

describe("pedidos esperando ok/não continuam decidíveis no feed (Leva 7C, N25)", () => {
  const pedido = (codigo: string, dias: number): ItemBruto => ({
    fonte: "cs", clientId: "imp", cliente: "Império", entityRef: codigo, motivo: "sugestao_sem_decisao",
    titulo: `Império: pedido "arte ${codigo}" espera ok/não há ${dias} dias`, fato: ["O agente pegou"],
    recomendacao: "Decidir aqui", acaoProposta: { tipo: "decidir_demanda", codigo },
    severidade: 40, urgencia: 50, confianca: 0.9, exposicaoRs: null, reversivel: true, ownerRole: "social", owner: "Carlos Augusto", nivelPolicy: "C",
  });

  it("o agregado leva TODOS os códigos e segue como decidir_demanda (antes virava abrir_board)", () => {
    const r = agregar([pedido("a1", 2), pedido("b2", 5), pedido("c3", 3)]);
    expect(r).toHaveLength(1);
    expect(r[0].acaoProposta).toMatchObject({ tipo: "decidir_demanda", codigos: ["a1", "b2", "c3"], itens: 3 });
  });

  it("card atrasado agregado continua abrindo o quadro", () => {
    expect(agregar([card("A", 11), card("B", 12)])[0].acaoProposta).toMatchObject({ tipo: "abrir_board", itens: 2 });
  });
});
