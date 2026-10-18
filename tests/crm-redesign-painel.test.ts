// Redesign do Comercial (Levas D1+D2, out/2026): gráficos, contas do dashboard, sino e casco.
// Dados INVENTADOS: o repositório é público.
import { describe, it, expect } from "vitest";
import { porcentagensInteiras, montarFatias, arcoDoAnel, tomDoRitmo, tomDaTaxa } from "@/lib/crm/graficos";
import {
  intervaloDoPeriodo, variacao, sugestaoDeMeta, heroiDaMeta, taxaDeGanho, followUpEmDia, leadsNovos, precisaDeAtencao,
  funilDeConversao, fatiasDeOrigem, atividadeDaSemana, tempoDePrimeiraResposta, duracaoCurta, saudacao, dataPorExtenso,
  type LeadPainel,
} from "@/lib/crm/painel";
import { ehNotificacaoComercial } from "@/lib/crm/notificacoes";
import { destinoNoComercial } from "@/lib/navegacao/casco";

describe("gráficos: matemática do anel e da rosca", () => {
  it("porcentagens inteiras sempre somam 100 (maior resto)", () => {
    expect(porcentagensInteiras([1, 1, 1])).toEqual([34, 33, 33]);
    expect(porcentagensInteiras([21, 6, 1]).reduce((a, b) => a + b)).toBe(100);
    expect(porcentagensInteiras([0, 0])).toEqual([0, 0]);
  });
  it("rosca: só valores > 0, ordem decrescente, no máximo 5 (o resto vira Outros), começando do zero", () => {
    const f = montarFatias([
      { chave: "a", rotulo: "A", valor: 1 }, { chave: "b", rotulo: "B", valor: 10 }, { chave: "c", rotulo: "C", valor: 0 },
      { chave: "d", rotulo: "D", valor: 5 }, { chave: "e", rotulo: "E", valor: 2 }, { chave: "f", rotulo: "F", valor: 3 }, { chave: "g", rotulo: "G", valor: 1 },
    ]);
    expect(f.map((x) => x.rotulo)).toEqual(["B", "D", "F", "E", "Outros"]);
    expect(f[4]).toMatchObject({ outros: true, valor: 2 });
    expect(f[0].inicio).toBe(0);
    expect(f.reduce((s, x) => s + x.pct, 0)).toBe(100);
    expect(f[4].inicio + f[4].tamanho).toBeCloseTo(100);
  });
  it("anel: passou de 100% vira selo, sem estourar o desenho; sem valor = só o trilho", () => {
    expect(arcoDoAnel(112)).toEqual({ pintar: 100, texto: "112%", passou: true });
    expect(arcoDoAnel(40.4)).toEqual({ pintar: 40.4, texto: "40%", passou: false });
    expect(arcoDoAnel(null)).toEqual({ pintar: 0, texto: "—", passou: false });
  });
  it("cor da meta pelo RITMO do mês, não pelo valor absoluto", () => {
    expect(tomDoRitmo(0.1, 0.05)).toBe("success");  // dia 2: 10% está à frente
    expect(tomDoRitmo(0.45, 0.5)).toBe("warning");  // 5 pontos atrás
    expect(tomDoRitmo(0.2, 0.8)).toBe("danger");
    expect(tomDoRitmo(1.1, 0.5)).toBe("success");
    expect(tomDoRitmo(null, 0.5)).toBe("muted");
    expect([tomDaTaxa(85), tomDaTaxa(60), tomDaTaxa(20), tomDaTaxa(null)]).toEqual(["success", "warning", "danger", "muted"]);
  });
});

const L = (id: string, o: Partial<LeadPainel> = {}): LeadPainel => ({
  id, contatoNome: "Fulano", empresa: `Empresa ${id}`, telefone: "5522998765432", estagio: "contato", origem: "Visita — Rota",
  createdAt: "2026-10-13T12:00:00Z", valorOrcamento: null, fechadoEm: null, toques: [], avancos: [], ...o,
});

describe("períodos e variação", () => {
  it("este mês compara com o mês anterior até o MESMO dia", () => {
    expect(intervaloDoPeriodo("mes", "2026-10-17")).toMatchObject({ ini: "2026-10-01", fim: "2026-10-17", antIni: "2026-09-01", antFim: "2026-09-17", mes: "2026-10", rotuloAnterior: "vs. setembro" });
    expect(intervaloDoPeriodo("mes", "2026-03-31")).toMatchObject({ antFim: "2026-02-28" }); // fevereiro curto
  });
  it("mês passado é o mês fechado contra o anterior fechado; 30 dias contra os 30 de antes", () => {
    expect(intervaloDoPeriodo("mes_passado", "2026-01-10")).toMatchObject({ ini: "2025-12-01", fim: "2025-12-31", antIni: "2025-11-01", antFim: "2025-11-30", mes: "2025-12" });
    expect(intervaloDoPeriodo("30d", "2026-10-17")).toMatchObject({ ini: "2026-09-18", fim: "2026-10-17", antIni: "2026-08-19", antFim: "2026-09-17" });
  });
  it("variação: anterior zero não vira porcentagem", () => {
    expect(variacao(120, 100)).toEqual({ pct: 20, direcao: "sobe" });
    expect(variacao(50, 100)).toEqual({ pct: -50, direcao: "desce" });
    expect(variacao(5, 0)).toEqual({ pct: null, direcao: "sem_base" });
    expect(variacao(0, 0)).toEqual({ pct: null, direcao: "igual" });
  });
});

describe("herói da meta", () => {
  const leads = [
    L("g1", { estagio: "ganho", valorOrcamento: 2000, fechadoEm: "2026-10-06" }),
    L("g0", { estagio: "ganho", valorOrcamento: 1000, fechadoEm: "2026-09-10" }),          // setembro, antes do dia 17
    L("n1", { estagio: "negociacao", valorOrcamento: 3000, probabilidade: 0.5 }),
  ];
  it("sem meta: sugestão = vendido + ponderado, arredondado para cima ao milhar", () => {
    const h = heroiDaMeta({ leads, metaValor: null, hoje: "2026-10-17", intervalo: intervaloDoPeriodo("mes", "2026-10-17") });
    expect(h.vendido).toBe(2000);
    expect(h.meta).toBeNull();
    expect(h.sugestao).toBe(4000); // 2000 + 1500
    expect(h.variacao).toEqual({ pct: 100, direcao: "sobe" }); // 2000 vs 1000 até 17/09
    expect(sugestaoDeMeta(0, 0)).toBe(1000);
  });
  it("com meta: fração do mês em dias úteis e quanto já deveria ter entrado", () => {
    const h = heroiDaMeta({ leads, metaValor: 10000, hoje: "2026-10-17", intervalo: intervaloDoPeriodo("mes", "2026-10-17") });
    expect(h.fracaoDoMes).toBeGreaterThan(0.4);
    expect(h.fracaoDoMes).toBeLessThan(0.6);
    expect(h.esperadoAteHoje).toBe(Math.round(10000 * h.fracaoDoMes));
    expect(h.falta).toBe(8000);
  });
});

describe("números da faixa 1", () => {
  it("taxa de ganho: com menos de 5 fechados marca 'poucos' (a tela mostra '2 de 3')", () => {
    const t = taxaDeGanho([L("a", { estagio: "ganho", valorOrcamento: 1000 }), L("b", { estagio: "ganho", valorOrcamento: 1000 }), L("c", { estagio: "perdido", valorOrcamento: 2000 }), L("d")]);
    expect(t).toMatchObject({ feitos: 2, total: 3, pct: 67, poucos: true, pctValor: 50 });
  });
  it("follow-up em dia: só quem tem passo na régua; estacionado com 'retomar em' fica de fora", () => {
    const hoje = "2026-10-20";
    const t = followUpEmDia([
      L("atrasado", { etapaDesde: "2026-10-01T12:00:00Z", avancos: ["2026-10-01T13:00:00Z"] }),
      L("em-dia", { etapaDesde: "2026-10-19T12:00:00Z", avancos: ["2026-10-19T13:00:00Z"] }),
      L("estacionado", { etapaDesde: "2026-10-01T12:00:00Z", retomarEm: "2026-11-03" }),
      L("ganho", { estagio: "ganho" }),
    ], hoje);
    expect(t).toMatchObject({ feitos: 1, total: 2 });
  });
  it("leads novos no período e no anterior", () => {
    const n = leadsNovos([L("a", { createdAt: "2026-10-05T12:00:00Z" }), L("b", { createdAt: "2026-09-05T12:00:00Z" }), L("c", { createdAt: "2026-09-25T12:00:00Z" })], intervaloDoPeriodo("mes", "2026-10-17"));
    expect(n).toMatchObject({ atual: 1, anterior: 1, variacao: { pct: 0, direcao: "igual" } });
  });
});

describe("precisa da sua atenção", () => {
  it("parados por etapa, sem WhatsApp; só aparece o que tem algum", () => {
    const hoje = "2026-10-20";
    const itens = precisaDeAtencao([
      L("neg-parado", { estagio: "negociacao", etapaDesde: "2026-10-10T12:00:00Z", toques: ["2026-10-10T13:00:00Z"], avancos: ["2026-10-10T13:00:00Z"] }),
      L("sem-zap", { telefone: null, etapaDesde: "2026-10-19T12:00:00Z", avancos: ["2026-10-19T13:00:00Z"], toques: ["2026-10-19T13:00:00Z"] }),
    ], hoje, new Date("2026-10-20T15:00:00Z"));
    const por = Object.fromEntries(itens.map((i) => [i.chave, i.leads.map((l) => l.id)]));
    expect(por.parados).toEqual(["neg-parado"]); // negociação: mais de 4 dias parado
    expect(por.sem_telefone).toEqual(["sem-zap"]);
    expect(itens.every((i) => i.leads.length > 0)).toBe(true);
  });
});

describe("funil, origem, semana e resposta", () => {
  it("funil: quem está mais à frente conta nas etapas de trás; perdido só no primeiro degrau", () => {
    const f = funilDeConversao([L("a", { estagio: "novo" }), L("b"), L("c", { estagio: "negociacao" }), L("d", { estagio: "ganho" }), L("e", { estagio: "perdido" })]);
    expect(f.degraus.map((d) => d.n)).toEqual([5, 3, 2, 2, 2, 1]);
    expect(f.degraus[1].pctDaAnterior).toBe(60);
    expect(f).toMatchObject({ total: 5, ganhos: 1, pctTotal: 20 });
  });
  it("origem: vazio vira 'Sem origem'; filtra pelo período", () => {
    const fat = fatiasDeOrigem([L("a"), L("b", { origem: "" }), L("c", { createdAt: "2026-08-01T12:00:00Z" })], intervaloDoPeriodo("mes", "2026-10-17"));
    expect(fat.map((x) => [x.rotulo, x.valor])).toEqual([["Visita — Rota", 1], ["Sem origem", 1]]);
  });
  it("semana: seg a dom, contatos por dia, dias futuros marcados", () => {
    const s = atividadeDaSemana([L("a", { toques: ["2026-10-19T14:00:00Z", "2026-10-19T15:00:00Z", "2026-10-21T14:00:00Z", "2026-10-12T14:00:00Z"] })], "2026-10-20");
    expect(s.dias.map((d) => d.n)).toEqual([2, 0, 1, 0, 0, 0, 0]);
    expect(s.dias[2].futuro).toBe(true);
    expect(s.total).toBe(3);
  });
  it("1ª resposta: só site/anúncio (visita é contato na hora e não entra)", () => {
    const iv = intervaloDoPeriodo("mes", "2026-10-17");
    const r = tempoDePrimeiraResposta([
      L("visita", { createdAt: "2026-10-13T12:00:00Z", primeiroContatoEm: "2026-10-13T12:00:00Z" }),
      L("site", { origem: "Site", createdAt: "2026-10-14T12:00:00Z", primeiroContatoEm: "2026-10-14T12:30:00Z" }),
    ], iv);
    expect(r).toMatchObject({ horas: 0.5, n: 1 });
    expect([duracaoCurta(0.5), duracaoCurta(3.5), duracaoCurta(2), duracaoCurta(72), duracaoCurta(null)]).toEqual(["30 min", "3,5 h", "2 h", "3 dias", "—"]);
  });
  it("saudação e data por extenso no fuso de São Paulo", () => {
    expect(saudacao(new Date("2026-10-17T12:00:00Z"))).toBe("Bom dia");   // 9h
    expect(saudacao(new Date("2026-10-17T18:00:00Z"))).toBe("Boa tarde"); // 15h
    expect(saudacao(new Date("2026-10-17T23:30:00Z"))).toBe("Boa noite"); // 20h30
    expect(dataPorExtenso("2026-10-17")).toBe("Sábado, 17 de outubro");
  });
});

describe("casco do comercial", () => {
  it("sino: só os avisos do comercial", () => {
    for (const t of ["Comercial: 20 contatos pra fazer hoje", "Comercial — semana começando", "Lead novo do site: Loja X (Varejo)", "Voltou pelo site: Loja X",
      "Ex-cliente preencheu o formulário do site: Loja X", "Lead do site sem resposta há mais de 1 h: Loja X", "3 leads do site sem resposta há mais de 1 h",
      "Meta abaixo do ritmo há 3 dias úteis", "Dia 20: a projeção está abaixo de 80% da meta"]) expect(ehNotificacaoComercial({ title: t }), t).toBe(true);
    for (const t of ["Nova demanda do Agente CS", "Revisão da arte (IA)", "Arte entregue pelo Designer", null]) expect(ehNotificacaoComercial({ title: t })).toBe(false);
  });
  it("arquivo (foto do time, imagem, fonte) passa direto no endereço do comercial", () => {
    expect(destinoNoComercial("/equipe/roberto.jpg")).toEqual({ tipo: "seguir" });
    expect(destinoNoComercial("/fonts/inter.woff2")).toEqual({ tipo: "seguir" });
    expect(destinoNoComercial("/ceo")).toEqual({ tipo: "redirecionar", para: "/" });
  });
});

describe("agenda: régua e retomadas também entram (D4)", () => {
  it("reunião, passo da régua, retomar e contato marcado; atrasado separado; fechado fora", async () => {
    const { eventosDaAgenda } = await import("@/lib/crm/agenda");
    const hoje = "2026-10-20";
    const r = eventosDaAgenda([
      L("reg", { etapaDesde: "2026-10-01T12:00:00Z", avancos: ["2026-10-01T13:00:00Z"] }),                 // régua atrasada
      L("ret", { retomarEm: "2026-11-03", etapaDesde: "2026-10-01T12:00:00Z" }),                             // estacionado
      L("reu", { estagio: "diagnostico", reuniaoData: "2026-10-22", etapaDesde: "2026-10-19T12:00:00Z", avancos: ["2026-10-19T12:00:00Z"] }),
      L("man", { estagio: "negociacao", proximoContato: "2026-10-25", etapaDesde: "2026-10-19T12:00:00Z", avancos: ["2026-10-19T12:00:00Z"] }),
      L("fim", { estagio: "ganho", reuniaoData: "2026-10-30" }),
    ], hoje);
    const tipos = (id: string) => [...r.atrasados, ...r.proximos].filter((e) => e.lead.id === id).map((e) => e.tipo);
    expect(r.atrasados.map((e) => e.lead.id)).toEqual(["reg"]);
    expect(tipos("ret")).toEqual(["retomar"]);           // retomada no lugar da régua
    expect(tipos("reu")).toContain("reuniao");
    expect(tipos("man")).toContain("contato");
    expect(tipos("fim")).toEqual([]);                    // ganho não entra
    expect(r.porDia.get("2026-11-03")?.[0].tipo).toBe("retomar");
  });
});
