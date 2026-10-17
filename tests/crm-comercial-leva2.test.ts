// Comercial — Leva 2 (out/2026): mensagem pronta, lista do Hoje, lembrete de 1 h e cobrança da meta.
// Dados INVENTADOS: o repositório é público.
import { describe, it, expect } from "vitest";
import { CADENCIAS, PASSO_NEGOCIACAO } from "@/lib/crm/cadencia";
import { mensagemDoToque, mensagemDeRetomada, primeiroNome, desafioDoSite, waComTexto } from "@/lib/crm/modelos";
import { montarFilaHoje, diasParado, type LeadHoje } from "@/lib/crm/hoje";
import { leadsParaLembrete, textosLembrete, avisoDaMeta, diasAbaixoDoRitmo, ehMarco, quemMexeNoPonteiro } from "@/lib/crm/avisos";

describe("mensagem pronta", () => {
  const lead = { contatoNome: "Ana Souza e Bruno Lima", empresa: "Madeireira Exemplo", segmento: "Madeireira", origem: "Visita — Rota Lagos", observacoes: null };
  const todos = [...Object.values(CADENCIAS).flat(), PASSO_NEGOCIACAO];

  it("todo passo tem saída: mensagem para WhatsApp, roteiro para ligação e visita", () => {
    for (const p of todos) {
      const s = mensagemDoToque(p!, lead);
      expect(s.tipo, p!.chave).toBe(p!.canal === "whatsapp" ? "mensagem" : "roteiro");
      expect(s.texto.length, p!.chave).toBeGreaterThan(30);
    }
  });
  it("regras do texto: curto, sem emoji, sem preço, sem promessa de número", () => {
    for (const p of todos) {
      const t = mensagemDoToque(p!, lead).texto;
      expect(t.length, p!.chave).toBeLessThanOrEqual(420);
      expect(t, p!.chave).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(t, p!.chave).not.toMatch(/R\$|\d+\s?%|reais|dobrar|triplicar|garant/i);
    }
  });
  it("usa o primeiro nome e a loja", () => {
    expect(mensagemDoToque(CADENCIAS.contato![0], lead).texto).toMatch(/^Oi, Ana! .*Madeireira Exemplo/);
  });
  it("lead do site: cita o desafio que a pessoa escreveu", () => {
    const t = mensagemDoToque(CADENCIAS.novo![0], { ...lead, origem: "Site", observacoes: "Desafio: Vender mais no verão\nFaturamento informado: x" }).texto;
    expect(t).toContain("Vi seu cadastro no nosso site");
    expect(t).toContain("Vender mais no verão");
  });
  it("primeiro nome: casal, apelido, nome igual à empresa", () => {
    expect(primeiroNome("Paulo Lima e João Rocha")).toBe("Paulo");
    expect(primeiroNome("Maria (Mari)")).toBe("Maria");
    expect(primeiroNome("Loja X", "Loja X")).toBeNull();
    expect(primeiroNome("Responsável — Loja X")).toBeNull();
    expect(mensagemDeRetomada({ contatoNome: "Loja X", empresa: "Loja X" }).texto).toMatch(/^Oi, tudo bem\?/);
  });
  it("desafio do site curto e link do WhatsApp com o texto", () => {
    expect(desafioDoSite("Desafio: " + "a".repeat(100))!.length).toBeLessThanOrEqual(70);
    expect(waComTexto("(22) 99876-5432", "Oi, tudo bem?")).toBe("https://web.whatsapp.com/send?phone=5522998765432&text=Oi%2C%20tudo%20bem%3F");
    expect(waComTexto(null, "x")).toBeNull();
  });
});

describe("lista de trabalho do Hoje", () => {
  const hoje = "2026-10-20";
  const agora = new Date("2026-10-20T13:00:00-03:00");
  const L = (o: Partial<LeadHoje> & { id: string }): LeadHoje => ({
    contatoNome: "Fulano Teste", empresa: `Empresa ${o.id}`, telefone: "5522998765432", estagio: "contato", origem: null,
    createdAt: "2026-10-01T12:00:00-03:00", etapaDesde: null, toques: [], avancos: [], ...o,
  });
  const leads = [
    L({ id: "site", estagio: "novo", origem: "Site", createdAt: "2026-10-20T11:30:00-03:00" }),
    L({ id: "reuniao", estagio: "diagnostico", reuniaoData: hoje, etapaDesde: "2026-10-19T10:00:00-03:00" }),
    L({ id: "retomar", estagio: "contato", retomarEm: "2026-10-20", etapaDesde: "2026-09-01T10:00:00-03:00" }),
    L({ id: "estacionado", estagio: "contato", retomarEm: "2026-11-03" }),
    L({ id: "negociando", estagio: "negociacao", etapaDesde: "2026-10-10T10:00:00-03:00", toques: ["2026-10-12T10:00:00-03:00"], avancos: ["2026-10-12T10:00:00-03:00"] }),
    L({ id: "toque", estagio: "contato", etapaDesde: "2026-10-15T10:00:00-03:00", toques: ["2026-10-15T11:00:00-03:00"], avancos: ["2026-10-15T11:00:00-03:00"] }),
    L({ id: "fechado", estagio: "ganho" }),
    L({ id: "fim", estagio: "proposta", etapaDesde: "2026-09-01T10:00:00-03:00", toques: [], avancos: [] }),
  ];
  const fila = montarFilaHoje(leads, hoje, agora);
  const grupo = (id: string) => fila.find((i) => i.lead.id === id)?.grupo;

  it("cada lead uma vez, pelo motivo mais urgente, na ordem que vende", () => {
    expect(grupo("site")).toBe("responder");
    expect(grupo("reuniao")).toBe("reuniao");
    expect(grupo("retomar")).toBe("retomar");
    expect(grupo("negociando")).toBe("esfriando");
    expect(grupo("toque")).toBe("toque");
    expect(grupo("fim")).toBe("fim");
    expect(grupo("estacionado")).toBeUndefined();
    expect(grupo("fechado")).toBeUndefined();
    expect(new Set(fila.map((i) => i.lead.id)).size).toBe(fila.length);
    expect(fila.map((i) => i.grupo)).toEqual(["responder", "reuniao", "retomar", "esfriando", "toque", "fim"]);
  });
  it("o lead do site chega com a mensagem do primeiro contato e há quanto tempo chegou", () => {
    const i = fila.find((x) => x.lead.id === "site")!;
    expect(i.passo?.chave).toBe("novo_primeiro");
    expect(i.mensagem?.tipo).toBe("mensagem");
    expect(i.motivo).toContain("chegou há 1 h");
  });
  it("o toque da régua vem com o passo certo (dia 2 por WhatsApp)", () => {
    const i = fila.find((x) => x.lead.id === "toque")!;
    expect(i.passo?.chave).toBe("contato_d2");
  });
  it("dias parado conta do último contato", () => {
    expect(diasParado(leads[4], hoje)).toBe(8);
  });
});

describe("lembrete de lead do site sem resposta", () => {
  const base = { id: "a", empresa: "Loja A", contatoNome: "Ana", segmento: "Varejo", estagio: "novo", primeiroContatoEm: null, lembreteEm: null };
  it("só depois de 1 h, sem contato, uma vez, das 8h às 20h", () => {
    const agora = new Date("2026-10-20T14:00:00-03:00");
    const leads = [
      { ...base, id: "velho", createdAt: "2026-10-20T12:30:00-03:00" },
      { ...base, id: "novinho", createdAt: "2026-10-20T13:30:00-03:00" },
      { ...base, id: "respondido", createdAt: "2026-10-20T10:00:00-03:00", primeiroContatoEm: "2026-10-20T10:10:00-03:00" },
      { ...base, id: "ja-lembrado", createdAt: "2026-10-20T10:00:00-03:00", lembreteEm: "2026-10-20T11:00:00-03:00" },
      { ...base, id: "mudou", createdAt: "2026-10-20T10:00:00-03:00", estagio: "contato" },
    ];
    expect(leadsParaLembrete(leads, agora).map((l) => l.id)).toEqual(["velho"]);
    expect(leadsParaLembrete(leads, new Date("2026-10-20T23:30:00-03:00"))).toEqual([]);
  });
  it("o WhatsApp do lembrete não leva valor", () => {
    const t = textosLembrete([{ ...base, createdAt: "2026-10-20T12:00:00-03:00" }]);
    expect(t.whatsapp).toContain("Loja A");
    expect(t.whatsapp).not.toMatch(/R\$|\d{3,}/);
  });
});

describe("cobrança da meta", () => {
  const L = (o: Record<string, unknown>) => ({ empresa: "Loja", contatoNome: "Ana", estagio: "proposta", valorOrcamento: 1000, fechadoEm: null, probabilidade: null, ...o });
  const leads = [
    L({ empresa: "Ganho Um", estagio: "ganho", valorOrcamento: 1000, fechadoEm: "2026-10-05" }),
    L({ empresa: "Alfa", estagio: "negociacao", valorOrcamento: 3000, probabilidade: 0.8 }),
    L({ empresa: "Beta", estagio: "proposta", valorOrcamento: 2000 }),
    L({ empresa: "Gama", estagio: "contato", valorOrcamento: 500 }),
    L({ empresa: "Delta", estagio: "negociacao", valorOrcamento: 9000, previsaoFechamento: "2026-12-10" }), // outro mês
  ];
  it("quem mexe no ponteiro: mensalidade × chance, deste mês", () => {
    expect(quemMexeNoPonteiro(leads, "2026-10-15").map((l) => l.empresa)).toEqual(["Alfa", "Beta", "Gama"]);
  });
  it("dias úteis seguidos abaixo do ritmo linear", () => {
    // Meta 10.000 em out/2026 (21 dias úteis): R$ 1.000 em 05/10 nunca alcança o ritmo depois de 01/10.
    expect(diasAbaixoDoRitmo(leads, 10000, "2026-10-08")).toBe(5); // 1, 2, 5, 6, 7
    expect(diasAbaixoDoRitmo(leads, 100, "2026-10-08")).toBe(0);   // meta pequena: já acima do ritmo ontem
  });
  it("marco do dia 10 e 20: primeiro dia útil a partir deles", () => {
    expect(ehMarco("2026-10-13")).toBe(true);  // 10 e 11 fim de semana, 12 feriado
    expect(ehMarco("2026-10-12")).toBe(false);
    expect(ehMarco("2026-10-20")).toBe(true);
  });
  it("segunda: resumo da semana; o WhatsApp não leva valor nem meta", () => {
    const a = avisoDaMeta({ leads, metaValor: 10000, hoje: "2026-10-19", paraFazerHoje: 7, esfriando: 2 });
    expect(a?.motivo).toBe("segunda");
    expect(a!.corpo).toContain("Faltam R$");
    expect(a!.whatsapp).toContain("7 contato(s)");
    expect(a!.whatsapp).toContain("Alfa");
    expect(a!.whatsapp).not.toMatch(/R\$|reais|\d{3,}|\d+%/);
  });
  it("ritmo: só de 3 em 3 dias úteis abaixo; fim de semana nunca", () => {
    const meta = 10000;
    const dias = ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]; // terça a sexta
    const motivos = dias.map((h) => avisoDaMeta({ leads, metaValor: meta, hoje: h, paraFazerHoje: 0, esfriando: 0 })?.motivo ?? null);
    // dias úteis abaixo do ritmo até a véspera: 06/10 → 3 (1, 2, 5) avisa; 07 → 4 e 08 → 5 calam; 09 → 6 avisa
    expect(motivos).toEqual(["ritmo", null, null, "ritmo"]);
    expect(avisoDaMeta({ leads, metaValor: meta, hoje: "2026-10-17", paraFazerHoje: 0, esfriando: 0 })).toBeNull(); // sábado
  });
  it("meta batida: sem cobrança (fora a segunda)", () => {
    expect(avisoDaMeta({ leads, metaValor: 500, hoje: "2026-10-09", paraFazerHoje: 0, esfriando: 0 })).toBeNull();
  });
});
