import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/supabase/queries", () => ({}));

import { cadastrosDuplicados, paresParaLigar, type ClienteLig, type LeadLig } from "@/lib/crm/ligar-cadastro";
import { separarFechados } from "@/lib/crm/fechados";

// DADOS SINTÉTICOS (o repositório é público: nada de nome de cliente real).
const C = (id: string, nome: string, p: Partial<ClienteLig> = {}): ClienteLig => ({ id, nome, leadId: null, rascunho: false, criadoEm: "2026-10-16T12:00:00Z", ...p });
const Ld = (id: string, nome: string, estagio = "negociacao"): LeadLig => ({ id, nome, estagio });

describe("cadastro do Lone OS ↔ lead do Comercial pelo nome", () => {
  it("cadastro aberto para a mesma empresa do funil é aquele lead: liga (acento, caixa e Ltda não atrapalham)", () => {
    const { pares, ambiguos } = paresParaLigar([C("c1", "XYZ Pneus Ltda", { rascunho: true })], [Ld("l1", "xyz pneus"), Ld("l2", "Outra Loja")]);
    expect(ambiguos).toEqual([]);
    expect(pares).toEqual([{ clienteId: "c1", cliente: "XYZ Pneus Ltda", leadId: "l1", lead: "xyz pneus", etapa: expect.stringMatching(/negocia/i) }]);
  });

  it("dois leads parecidos: não liga sozinho, avisa para escolher", () => {
    const { pares, ambiguos } = paresParaLigar([C("c1", "Depósito Exemplo")], [Ld("l1", "Deposito Exemplo"), Ld("l2", "Depósito Exemplo Centro")]);
    expect(pares).toEqual([]);
    expect(ambiguos).toEqual([{ cliente: "Depósito Exemplo", leads: ["Deposito Exemplo", "Depósito Exemplo Centro"] }]);
  });

  it("dois cadastros livres parecidos com o mesmo lead também é ambíguo (único nos dois sentidos)", () => {
    const { pares } = paresParaLigar([C("c1", "Loja Exemplar"), C("c2", "Loja Exemplar Ltda")], [Ld("l1", "Loja Exemplar")]);
    expect(pares).toEqual([]);
  });

  it("lead já ligado, cadastro já ligado e lead perdido ficam de fora", () => {
    const clientes = [C("c1", "Loja Alfa Modas", { leadId: "l1" }), C("c2", "Loja Beta Modas")];
    const leads = [Ld("l1", "Loja Alfa Modas"), Ld("l2", "Loja Beta Modas", "perdido")];
    expect(paresParaLigar(clientes, leads).pares).toEqual([]);
  });
});

describe("cadastro duplicado", () => {
  it("rascunho pendente com nome parecido a um cadastro preenchido é o que sobra", () => {
    const d = cadastrosDuplicados([
      C("c1", "Armazém Exemplo"),
      C("c2", "Armazem Exemplo", { rascunho: true, criadoEm: "2026-10-10T12:00:00Z" }),
      C("c3", "Loja Sozinha", { rascunho: true }),
    ]);
    expect(d).toEqual([{ pendenteId: "c2", pendente: "Armazem Exemplo", criadoEm: "2026-10-10T12:00:00Z", feito: "Armazém Exemplo" }]);
  });
  it("dois rascunhos pendentes sem nenhum preenchido não acusa nada (ainda não dá para saber qual vale)", () => {
    expect(cadastrosDuplicados([C("c1", "Loja Gama", { rascunho: true }), C("c2", "Loja Gama", { rascunho: true })])).toEqual([]);
  });
});

describe("Fechados: link enviado × cadastrado", () => {
  it("ganho com cadastro pendente fica em 'Cadastro enviado' (qualquer mês), não em 'Cadastrados'", () => {
    const f = separarFechados([
      { id: "a", estagio: "ganho", fechadoEm: "2026-09-10", clienteId: "c1", cadastroPendente: true },
      { id: "b", estagio: "ganho", fechadoEm: "2026-10-12", clienteId: "c2", cadastroPendente: false },
      { id: "c", estagio: "ganho", fechadoEm: "2026-10-13", clienteId: null },
    ], "2026-10");
    expect(f.aguardando.map((l) => l.id)).toEqual(["a"]);
    expect(f.clientes.map((l) => l.id)).toEqual(["b"]);
    expect(f.converter.map((l) => l.id)).toEqual(["c"]);
  });
});
