// Loninho no grupo de vendas (out/2026): a IA interpreta, o código decide. Dados INVENTADOS.
import { describe, it, expect } from "vitest";
import {
  chamaOLoninho, chamadaDireta, dataPorFrase, montarPedido, leadsDoPedido, planejarPassos, resolverLead, dataValida, diaPorExtenso,
  textoAgendado, textoRegistrado, textoConsulta, textoCadastrado, SCHEMA_ASSISTENTE, AJUDA, type AcaoIA, type LeadAssistente,
} from "@/lib/crm/assistente";

const L = (id: string, empresa: string, o: Partial<LeadAssistente> = {}): LeadAssistente =>
  ({ id, empresa, contatoNome: "Fulano", telefone: null, estagio: "contato", ...o });
const todos = [
  L("1", "Madeireira Exemplo", { contatoNome: "Ana e Bruno", telefone: "5522998765432" }),
  L("2", "Telhas Exemplo", { estagio: "negociacao" }),
  L("3", "Ferragens Alfa"),
  L("4", "Ferragens Beta"),
  L("5", "Loja Fechada", { estagio: "ganho" }),
  L("6", "JC Exemplo Madeireira", { estagio: "novo" }),
];
const lista = leadsDoPedido(todos);
const A = (o: Partial<AcaoIA>): AcaoIA => ({ tipo: "nada", lead_num: null, lead_texto: null, data: null, canal: null, resumo: null, empresa: null, contato: null, telefone: null, ...o });
const num = (empresa: string) => lista.findIndex((l) => l.empresa === empresa) + 1;
const hoje = "2026-10-20"; // terça

describe("quando o Loninho ouve", () => {
  it("só pelo nome; 'Lone Mídia' não é chamada", () => {
    expect(chamaOLoninho("Loninho, marca follow-up com a Telhas quinta")).toBe(true);
    expect(chamaOLoninho("lone o que tem pra hoje")).toBe(true);
    expect(chamaOLoninho("liguei pra Telhas Exemplo")).toBe(false);
    expect(chamaOLoninho("a Lone Mídia fechou mais um")).toBe(false);
  });
});

describe("pedido para a IA", () => {
  it("lista só os leads abertos, numerados, e um calendário com hoje e os dias da semana", () => {
    expect(lista.map((l) => l.id)).not.toContain("5");
    const { system, user } = montarPedido({ texto: "Loninho, marca a Telhas quinta", autor: "Roberto", hoje, leads: lista });
    expect(system).toContain("2026-10-20 = terça (HOJE)");
    expect(system).toContain("2026-10-22 = quinta");
    expect(system).toContain("semana que vem (sem dia) = 2026-10-26"); // hoje é terça 20/10 → segunda 26/10
    const sabado = montarPedido({ texto: "x", autor: "R", hoje: "2026-10-17", leads: [] }).system;
    expect(sabado).toContain("semana que vem (sem dia) = 2026-10-19"); // o caso do ensaio: sábado → segunda 19/10
    expect(system).toMatch(/\d+\. Telhas Exemplo — Fulano \(Negociação\)/);
    expect(system).not.toContain("Loja Fechada");
    expect(user).toBe("Roberto: Loninho, marca a Telhas quinta");
  });
  it("schema estrito: toda propriedade obrigatória (exigência do modo strict da OpenAI)", () => {
    const item = ((SCHEMA_ASSISTENTE.properties as Record<string, { items: { properties: object; required: string[] } }>).acoes).items;
    expect(Object.keys(item.properties).sort()).toEqual([...item.required].sort());
  });
});

describe("qual lead", () => {
  it("pelo número conferido com o nome", () => {
    expect(resolverLead({ lead_num: num("Telhas Exemplo"), lead_texto: "Telhas" }, lista)).toEqual({ lead: lista[num("Telhas Exemplo") - 1] });
  });
  it("número que não bate com o nome dito não vale: procura pelo nome", () => {
    const r = resolverLead({ lead_num: num("Ferragens Alfa"), lead_texto: "Madeireira Exemplo" }, lista);
    expect("lead" in r && r.lead.id).toBe("1");
  });
  it("pelo nome: parcial, pelo contato, palavras fora de ordem", () => {
    const id = (t: string) => { const r = resolverLead({ lead_num: null, lead_texto: t }, lista); return "lead" in r ? r.lead.id : null; };
    expect(id("a telhas")).toBe("2");
    expect(id("Ana e Bruno")).toBe("1");
    expect(id("jc exemplo")).toBe("6");
  });
  it("ambíguo pede o nome completo; não achou diz que não achou", () => {
    expect(resolverLead({ lead_num: null, lead_texto: "Ferragens" }, lista)).toHaveProperty("candidatos");
    expect(resolverLead({ lead_num: 99, lead_texto: "Inexistente" }, lista)).toEqual({ nenhum: "Inexistente" });
  });
});

describe("datas", () => {
  it("'semana que vem' sem dia é a próxima segunda, decidido no código (a IA errou no ensaio)", () => {
    expect(dataPorFrase("visitei a loja, pediu mensagem semana que vem", "2026-10-17")).toBe("2026-10-19");
    expect(dataPorFrase("volta na próxima semana", "2026-10-20")).toBe("2026-10-26");
    expect(dataPorFrase("semana que vem na quinta", "2026-10-17")).toBeNull();
    expect(dataPorFrase("semana que vem, dia 21", "2026-10-17")).toBeNull();
    expect(dataPorFrase("marca pra quinta", "2026-10-17")).toBeNull();
    const p = planejarPassos({ resposta: { acoes: [A({ tipo: "agendar", lead_num: num("Telhas Exemplo"), lead_texto: "Telhas", data: "2026-10-24" })] }, lista, todos, clientes: [], hoje: "2026-10-17", texto: "Loninho, volta na Telhas semana que vem" });
    expect(p[0]).toMatchObject({ tipo: "agendar", data: "2026-10-19" });
  });
  it("só de hoje até 1 ano, e data que existe", () => {
    expect(dataValida("2026-10-20", hoje)).toBe(true);
    expect(dataValida("2026-10-19", hoje)).toBe(false);
    expect(dataValida("2027-12-01", hoje)).toBe(false);
    expect(dataValida("2026-02-31", "2026-01-01")).toBe(false);
    expect(dataValida("quinta", hoje)).toBe(false);
    expect(diaPorExtenso("2026-10-22")).toBe("quinta, 22/10");
  });
});

describe("decisão: ações viram passos conferidos", () => {
  const plan = (acoes: AcaoIA[], clientes: { nome: string; telefones: (string | null)[] }[] = []) =>
    planejarPassos({ resposta: { acoes }, lista, todos, clientes, hoje });

  it("registrar vem antes de agendar ('liguei, volta quinta')", () => {
    const p = plan([
      A({ tipo: "agendar", lead_num: num("Telhas Exemplo"), lead_texto: "Telhas", data: "2026-10-22" }),
      A({ tipo: "registrar", lead_num: num("Telhas Exemplo"), lead_texto: "Telhas", canal: "ligacao", resumo: "Pediu proposta" }),
    ]);
    expect(p.map((x) => x.tipo)).toEqual(["registrar", "agendar"]);
    expect(p[0]).toMatchObject({ atividade: "ligacao", resumo: "Pediu proposta" });
    expect(p[1]).toMatchObject({ data: "2026-10-22" });
  });
  it("agendar sem data válida pergunta o dia, não grava", () => {
    const p = plan([A({ tipo: "agendar", lead_num: num("Telhas Exemplo"), lead_texto: "Telhas", data: "2026-10-01" })]);
    expect(p).toEqual([{ tipo: "responder", texto: expect.stringContaining("Para quando marco") }]);
  });
  it("nada ou vazio: nenhum passo (o servidor só explica se foi chamado direto)", () => {
    expect(plan([A({ tipo: "nada" })])).toEqual([]);
    expect(planejarPassos({ resposta: null, lista, todos, clientes: [], hoje })).toEqual([]);
    expect(chamadaDireta("Loninho, tudo bem?")).toBe(true);
    expect(chamadaDireta("@lone me ajuda")).toBe(true);
    expect(chamadaDireta("acho que a lone vai bater a semana")).toBe(false);
    expect(AJUDA).toContain("marca follow-up");
  });
  it("cadastrar: telefone normalizado; duplicado no funil e cliente não entram", () => {
    expect(plan([A({ tipo: "cadastrar", empresa: "Loja Nova", contato: "Carla", telefone: "(22) 99111-2222" })]))
      .toEqual([{ tipo: "cadastrar", empresa: "Loja Nova", contato: "Carla", telefone: "5522991112222" }]);
    expect(plan([A({ tipo: "cadastrar", empresa: "Outro Nome", telefone: "22 99876-5432" })])[0]).toMatchObject({ tipo: "responder", texto: expect.stringContaining("já está no funil") });
    expect(plan([A({ tipo: "cadastrar", empresa: "Cliente X" })], [{ nome: "Cliente X", telefones: [] }])[0]).toMatchObject({ tipo: "responder", texto: expect.stringContaining("já é cliente") });
  });
  it("no máximo 3 ações por mensagem", () => {
    const muitas = Array.from({ length: 5 }, () => A({ tipo: "consultar_hoje" }));
    expect(plan(muitas)).toHaveLength(3);
  });
});

describe("respostas: texto fixo, sem valor", () => {
  const lead = todos[0];
  const SEM_VALOR = /R\$|reais|mensalidade|meta\b/i;
  it("agendado: hoje, amanhã e outro dia", () => {
    expect(textoAgendado(lead, hoje, hoje)).toContain("hoje");
    expect(textoAgendado(lead, "2026-10-21", hoje)).toContain("amanhã (quarta, 21/10)");
    expect(textoAgendado(lead, "2026-10-23", hoje)).toContain("sexta, 23/10");
  });
  it("registrado, consulta e cadastro", () => {
    const t = [
      textoRegistrado(lead, "ligacao", "Pediu proposta", true),
      textoConsulta({ lead, ultimo: { tipo: "visita", quando: "2026-10-13" }, proximo: "WhatsApp do dia 2 · atrasado 5d", hoje }),
      textoCadastrado("Loja Nova", "Carla", "5522991112222"),
    ];
    expect(t[0]).toContain("Saiu de Novo para Contato feito");
    expect(t[1]).toContain("Último contato: visita em 13/10");
    expect(t[1]).toContain("wa.me/5522998765432");
    expect(t[2]).toContain("(22) 99111-2222");
    for (const x of t) expect(x).not.toMatch(SEM_VALOR);
  });
});
