import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  METAS, alvosDoTrimestre, avaliarMeta, formatarValorMeta, mesFechado, mesesAte, metaDaChaveGravada, trimestreDo,
} from "@/lib/goals/catalogo";
import {
  churnDoMes, clientesAtivos, designDoMes, entregaContratada, novosClientes, npsDasNotas, postsNoPrazo, reunioesDoMes,
  riscoDoMes, trafegoDoMes, type ClienteMetas,
} from "@/lib/goals/calculos";
import { contratadoPorSemana, leituraDaSemana, montarMapa, semanasDoMapa, type ClienteMapa } from "@/lib/metrics/mapa-postagem";

const RAIZ = path.resolve(__dirname, "..");

// ─── N33: metas ligadas a métricas reais ─────────────────────────────────────

describe("N33: catálogo das metas", () => {
  it("nenhuma meta de faturamento da agência", () => {
    const proibido = /\b(mrr|arr|ltv|receita|faturamento|fee|contrato|margem|lucro|revenue)\b/i;
    for (const m of METAS) expect(`${m.chave} ${m.titulo} ${m.fonte}`, m.chave).not.toMatch(proibido);
  });

  it("chaves únicas e as chaves da tela antiga continuam achando a meta (o alvo gravado vale)", () => {
    expect(new Set(METAS.map((m) => m.chave)).size).toBe(METAS.length);
    expect(metaDaChaveGravada("churn_rate")?.chave).toBe("churn_pct");
    expect(metaDaChaveGravada("leads_month")?.chave).toBe("conversas_mes");
    expect(metaDaChaveGravada("roas")).toBeUndefined(); // ROAS não é medível: fica de fora
    // "nps" da tela antiga era a SAÚDE média (não era NPS) — não pode virar alvo do NPS real.
    expect(metaDaChaveGravada("nps")).toBeUndefined();
  });

  it("alvo do trimestre: chave nova vence a antiga; sem linha, padrão", () => {
    const alvos = alvosDoTrimestre([
      { id: "1", metric_key: "churn_rate", target: 4, quarter: "2026-Q3" },
      { id: "2", metric_key: "churn_pct", target: 3, quarter: "2026-Q3" },
      { id: "3", metric_key: "posts_delivered", target: "120", quarter: "2026-Q3" },
      { id: "4", metric_key: "roas", target: 4, quarter: "2026-Q3" },
      { id: "5", metric_key: "novos_clientes", target: null, quarter: "2026-Q3" },
    ]);
    expect(alvos.get("churn_pct")).toEqual({ alvo: 3, okrId: "2" });
    expect(alvos.get("posts_publicados")?.alvo).toBe(120);
    expect(alvos.has("novos_clientes")).toBe(false);
  });

  it("meses e trimestres", () => {
    expect(mesFechado("2026-09-24")).toBe("2026-08");
    expect(mesFechado("2026-01-01")).toBe("2025-12");
    expect(mesesAte("2026-08", 3)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(trimestreDo("2026-09")).toBe("2026-Q3");
    expect(trimestreDo("2026-10")).toBe("2026-Q4");
  });

  it("avaliação: maior e menor é melhor, sem dado nunca vira 0% nem 100%", () => {
    expect(avaliarMeta(40, 40, "maior")).toEqual({ progresso: 100, status: "batida" });
    expect(avaliarMeta(34, 40, "maior")).toEqual({ progresso: 85, status: "perto" });
    expect(avaliarMeta(10, 40, "maior").status).toBe("longe");
    expect(avaliarMeta(4, 5, "menor").status).toBe("batida");
    expect(avaliarMeta(6, 5, "menor")).toEqual({ progresso: 83, status: "perto" });
    expect(avaliarMeta(0, 5, "menor").status).toBe("batida");
    expect(avaliarMeta(null, 5, "menor")).toEqual({ progresso: null, status: "sem_dado" });
  });

  it("formato do número", () => {
    const pct = { unidade: "%" as const, casas: 1 };
    expect(formatarValorMeta(pct, 12.5)).toBe("12,5%");
    expect(formatarValorMeta({ unidade: "R$", casas: 2 }, 14.2)).toBe("R$ 14,20");
    expect(formatarValorMeta(pct, null)).toBe("—");
  });

  it("a tela não lê mais mock nem calcula meta no navegador", () => {
    // Sem os comentários (que contam a história do que saiu).
    const pagina = readFileSync(path.join(RAIZ, "app/goals/page.tsx"), "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(pagina).not.toMatch(/mockAdCampaigns|useOKRMetrics|useSnapshots|localStorage/);
    expect(pagina).toMatch(/\/api\/goals/);
  });
});

const cli = (c: Partial<ClienteMetas> & { id: string }): ClienteMetas => ({
  entrada: "2026-01-10", saida: null, desativadoSemData: false, rascunho: false, temSocial: true, temInstagram: true,
  postsContratados: null, ...c,
});

describe("N33: contas de cada meta", () => {
  const carteira = [
    cli({ id: "a" }),
    cli({ id: "b", saida: "2026-08-15" }),                 // saiu em agosto
    cli({ id: "c", entrada: "2026-08-05" }),               // entrou em agosto
    cli({ id: "d", entrada: "2026-09-02" }),               // entrou depois
    cli({ id: "e", rascunho: true }),                      // rascunho não conta
    cli({ id: "f", desativadoSemData: true }),             // saiu sem data: fora de todo mês
  ];

  it("ativos, novos e churn de agosto", () => {
    expect(clientesAtivos(carteira, "2026-08").valor).toBe(2);           // a, c
    expect(novosClientes(carteira, "2026-08").valor).toBe(1);            // c
    expect(churnDoMes(carteira, "2026-08")).toMatchObject({ valor: 50, detalhe: "1 de 2 clientes" }); // base a, b
  });

  it("NPS: promotores − detratores; sem resposta não é 0", () => {
    expect(npsDasNotas([10, 9, 8, 6]).valor).toBe(25);
    expect(npsDasNotas([]).valor).toBeNull();
  });

  it("clientes em risco: última nota do mês, só a escala nova", () => {
    const r = riscoDoMes([
      { client_id: "a", level: "risco", computed_for_date: "2026-08-10" },
      { client_id: "a", level: "saudavel", computed_for_date: "2026-08-30" },
      { client_id: "b", level: "risco", computed_for_date: "2026-08-20" },
      { client_id: "c", level: "critical", computed_for_date: "2026-08-20" }, // escala antiga: fora
    ], "2026-08");
    expect(r).toMatchObject({ valor: 50, detalhe: "1 de 2 clientes" });
    expect(riscoDoMes([], "2026-08").valor).toBeNull();
  });

  it("tráfego: custo por conversa do mês; sem conta lida é sem fonte", () => {
    const t = trafegoDoMes({ conversas: 400, investido: 5000, contas: 12 });
    expect(t.conversas.valor).toBe(400);
    expect(t.custo.valor).toBe(12.5);
    expect(trafegoDoMes({ conversas: 0, investido: 0, contas: 0 }).conversas.valor).toBeNull();
  });

  it("entrega do contratado: teto por cliente (excesso de um não cobre a falta do outro)", () => {
    const base = [cli({ id: "a" }), cli({ id: "b", postsContratados: 8 }), cli({ id: "c", temInstagram: false })];
    const r = entregaContratada(base, new Map([["a", 20], ["b", 4]]), "2026-08");
    expect(r).toMatchObject({ valor: 80, detalhe: "16 de 20 posts · 2 clientes" }); // a: 12/12, b: 4/8
  });

  it("posts no prazo e reuniões do ciclo (mês sem ciclo não é 0%)", () => {
    expect(postsNoPrazo(9, 1).valor).toBe(90);
    expect(postsNoPrazo(0, 0).valor).toBeNull();
    const base = [cli({ id: "a" }), cli({ id: "b" })];
    expect(reunioesDoMes(base, [], "2026-08").valor).toBeNull();
    expect(reunioesDoMes(base, [
      { client_id: "a", estado: "realizada", realizada_em: "2026-09-10T15:00:00Z", mes_referencia: "2026-09" },
      { client_id: "b", estado: "pendente", realizada_em: null, mes_referencia: "2026-09" },
    ], "2026-09").valor).toBe(50);
  });

  it("design: entregas, no prazo (1ª versão) e retrabalho", () => {
    const d = designDoMes([
      { card_id: "x", version: 1, delivered_at: "2026-08-10T12:00:00Z" },
      { card_id: "y", version: 1, delivered_at: "2026-08-20T12:00:00Z" },
      { card_id: "x", version: 2, delivered_at: "2026-08-12T12:00:00Z" },
    ], new Map([["x", "2026-08-11"], ["y", "2026-08-15"]]), "2026-08");
    expect(d.entregues.valor).toBe(3);
    expect(d.noPrazo.valor).toBe(50);
    expect(d.retrabalho.valor).toBe(33);
  });
});

// ─── N32: mapa de postagem ───────────────────────────────────────────────────

describe("N32: mapa cliente × semana", () => {
  const hoje = "2026-09-24"; // quinta
  const semanas = semanasDoMapa(hoje, 3);

  it("semanas de segunda a domingo, a corrente por último e marcada", () => {
    expect(semanas.map((s) => [s.inicio, s.fim])).toEqual([
      ["2026-09-07", "2026-09-13"], ["2026-09-14", "2026-09-20"], ["2026-09-21", "2026-09-27"],
    ]);
    expect(semanas.map((s) => s.emAndamento)).toEqual([false, false, true]);
  });

  it("contratado: seg/qua/sex = 3; com meta própria, a meta ÷ 4", () => {
    expect(contratadoPorSemana(null)).toBe(3);
    expect(contratadoPorSemana(8)).toBe(2);
    expect(contratadoPorSemana(16)).toBe(4);
  });

  const cm = (c: Partial<ClienteMapa> & { id: string }): ClienteMapa => ({
    nome: c.id, social: "Carlos", entrada: "2026-01-01", temInstagram: true, pausado: false, contratadoSemana: 3, ...c,
  });

  it("células: ok, parcial, zerada, em andamento e antes de ser cliente; cumprimento só de semana fechada", () => {
    const m = montarMapa({
      semanas, hoje,
      clientes: [cm({ id: "a" }), cm({ id: "novo", entrada: "2026-09-16" }), cm({ id: "cego", temInstagram: false, social: "Thiago" })],
      posts: [
        ...["2026-09-07", "2026-09-09", "2026-09-11"].map((d) => ({ client_id: "a", posted_at: `${d}T15:00:00Z` })),
        { client_id: "a", posted_at: "2026-09-16T15:00:00Z" },
        { client_id: "a", posted_at: "2026-09-22T15:00:00Z" },
        { client_id: "novo", posted_at: "2026-09-18T15:00:00Z" },
      ],
    });
    const a = m.linhas.find((l) => l.clientId === "a")!;
    expect(a.celulas.map((c) => c.tom)).toEqual(["ok", "parcial", "andamento"]);
    expect(a.cumprimento).toBe(67); // (3 + 1) / (3 + 3)
    const novo = m.linhas.find((l) => l.clientId === "novo")!;
    expect(novo.celulas.map((c) => c.tom)).toEqual(["fora", "parcial", "andamento"]);
    expect(novo.cumprimento).toBe(33);
    const cego = m.linhas.find((l) => l.clientId === "cego")!;
    expect(cego.cumprimento).toBeNull();
    expect(m.linhas.at(-1)!.clientId).toBe("cego"); // sem Instagram vai pro fim
    expect(m.semInstagram).toBe(1);
    expect(m.porSocial.find((s) => s.social === "Carlos")).toMatchObject({ clientes: 2, cumprimento: 56 }); // 5/9
  });

  it("zerada conta como semana zerada", () => {
    const m = montarMapa({ semanas, hoje, clientes: [cm({ id: "z" })], posts: [] });
    expect(m.linhas[0].celulas.map((c) => c.tom)).toEqual(["zero", "zero", "andamento"]);
    expect(m.linhas[0].semanasZeradas).toBe(2);
  });

  it("leitura do dia a dia: seg/qua/sex e o que saiu fora do dia", () => {
    const s = semanas[2];
    expect(leituraDaSemana(s, ["2026-09-22", "2026-09-23"], hoje)).toBe("seg 21 — · qua 23 ✓ · sex 25 (ainda não) · +1 em ter 22");
  });
});
