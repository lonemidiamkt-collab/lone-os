import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { DADOS_VAZIOS, montarContexto, type CardRow, type ClienteRow, type Dados } from "@/lib/inicio/dados";
import { gerarItens } from "@/lib/inicio/regras";
import { deduplicar, feedPara, montarInicio, ordenar, visivelPara } from "@/lib/inicio/feed";
import type { ItemInterno, Viewer } from "@/lib/inicio/tipos";

// Quinta, 24/09/2026, 12h em São Paulo. Quinta → a lacuna olha a "semana que vem".
const AGORA = new Date("2026-09-24T15:00:00Z");
const HOJE = "2026-09-24";
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString();
const dataMenos = (n: number) => new Date(Date.parse(`${HOJE}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(AGORA); });
afterAll(() => { vi.useRealTimers(); });

function cliente(o: Partial<ClienteRow> & { id: string }): ClienteRow {
  return {
    name: o.id.toUpperCase(), nome_fantasia: null, logo: null, doc_logo: null, status: "active", active: true,
    churned_at: null, draft_status: null, paused_at: null, paused_until: null, created_at: diasAtras(200),
    assigned_social: null, assigned_traffic: null, assigned_designer: null, service_type: "lone_growth",
    current_health_level: "saudavel", current_health_score: 85, last_client_msg_at: diasAtras(1), agente_ativo: true,
    meta_ad_account_id: "act_1", public_report_enabled: true, instagram_user: "x", last_post_date: diasAtras(2),
    ...o,
  };
}

function card(o: Partial<CardRow> & { id: string; client_id: string }): CardRow {
  return {
    title: `Card ${o.id}`, status: "in_production", due_date: dataMenos(-3), social_media: null,
    designer_delivered_at: null, social_confirmed_at: null, client_approved_at: null,
    status_changed_at: diasAtras(1), column_entered_at: null, publish_verified_at: null,
    ...o,
  };
}

const TIME = [
  { nome: "Carlos Augusto", papel: "social" as const },
  { nome: "Thiago", papel: "social" as const },
  { nome: "Julio", papel: "traffic" as const },
  { nome: "Rodrigo", papel: "designer" as const },
  { nome: "Ana", papel: "comercial" as const },
];

function dados(o: Partial<Dados>): Dados {
  // Card da semana que vem para todo cliente: a regra de lacuna não polui os testes que não são dela.
  const clientes = o.clientes ?? [];
  const cobertura = clientes.map((c) => card({ id: `semana-${c.id}`, client_id: c.id, status: "ideas", due_date: "2026-09-29" }));
  return { ...DADOS_VAZIOS, time: TIME, ...o, cards: [...(o.cards ?? []), ...cobertura] };
}

const itensDe = (d: Dados) => deduplicar(gerarItens(d, montarContexto(d, AGORA)));
const doProblema = (xs: ItemInterno[], p: string) => xs.filter((i) => i.problema === p);

const GESTOR: Viewer = { nome: "Roberto Lino", papel: "admin" };
const CARLOS: Viewer = { nome: "Carlos Augusto", papel: "social" };
const THIAGO: Viewer = { nome: "Thiago", papel: "social" };
const JULIO: Viewer = { nome: "Julio", papel: "traffic" };
const RODRIGO: Viewer = { nome: "Rodrigo", papel: "designer" };
const ANA: Viewer = { nome: "Ana", papel: "comercial" };

describe("Início — severidade das regras", () => {
  it("post atrasado até 7 dias é crítico; de 8 a 30 é aviso; acima de 30 é encalhado e sai do feed", () => {
    const d = dados({
      clientes: [cliente({ id: "a", assigned_social: "Carlos" }), cliente({ id: "b", assigned_social: "Carlos" }), cliente({ id: "c", assigned_social: "Carlos" })],
      cards: [
        card({ id: "1", client_id: "a", due_date: dataMenos(3) }),
        card({ id: "2", client_id: "b", due_date: dataMenos(12) }),
        card({ id: "3", client_id: "c", due_date: dataMenos(45) }),
      ],
    });
    const atrasos = doProblema(itensDe(d), "atrasado");
    expect(atrasos.find((i) => i.cliente?.id === "a")?.severidade).toBe("critical");
    expect(atrasos.find((i) => i.cliente?.id === "b")?.severidade).toBe("warning");
    expect(atrasos.find((i) => i.cliente?.id === "c")).toBeUndefined();
  });

  it("saúde em risco é crítico e em atenção é aviso; saudável e falando no grupo não entra", () => {
    const d = dados({
      clientes: [
        cliente({ id: "r", current_health_level: "risco", current_health_score: 42 }),
        cliente({ id: "t", current_health_level: "atencao", current_health_score: 66 }),
        cliente({ id: "s" }),
      ],
      motivosSaude: { r: ["Resultado em 30"] },
    });
    const rel = doProblema(itensDe(d), "relacionamento");
    expect(rel.find((i) => i.cliente?.id === "r")).toMatchObject({ severidade: "critical", titulo: "Saúde em risco (42/100)", motivo: "Resultado em 30" });
    expect(rel.find((i) => i.cliente?.id === "t")?.severidade).toBe("warning");
    expect(rel.find((i) => i.cliente?.id === "s")).toBeUndefined();
  });

  it("pedido do grupo parado há 10+ dias escala para crítico (mesmo corte da cobrança nominal)", () => {
    const d = dados({
      clientes: [cliente({ id: "a" }), cliente({ id: "b" })],
      demandas: [
        { codigo: "D1", client_id: "a", cliente_nome: "A", tipo: "post", resumo: "Post do dia dos pais", created_at: diasAtras(11), responsavel: "Carlos" },
        { codigo: "D2", client_id: "b", cliente_nome: "B", tipo: "post", resumo: "Stories", created_at: diasAtras(2), responsavel: "Carlos" },
      ],
    });
    const ped = doProblema(itensDe(d), "pedido");
    expect(ped.find((i) => i.cliente?.id === "a")?.severidade).toBe("critical");
    expect(ped.find((i) => i.cliente?.id === "b")?.severidade).toBe("warning");
  });

  it("feed sai ordenado: crítico, depois aviso, depois acompanhar", () => {
    const d = dados({
      clientes: [
        cliente({ id: "novo", status: "onboarding", created_at: diasAtras(2), meta_ad_account_id: null, public_report_enabled: false, instagram_user: null, last_post_date: null }),
        cliente({ id: "r", current_health_level: "risco", current_health_score: 40 }),
        cliente({ id: "t", current_health_level: "atencao", current_health_score: 65 }),
      ],
    });
    const sev = ordenar(itensDe(d)).map((i) => i.severidade);
    expect(sev).toEqual([...sev].sort((a, b) => ["critical", "warning", "info"].indexOf(a) - ["critical", "warning", "info"].indexOf(b)));
    expect(sev[0]).toBe("critical");
    expect(sev.at(-1)).toBe("info");
  });
});

describe("Início — deduplicação (um item por cliente e problema)", () => {
  it("duas regras sobre o mesmo cliente+problema viram um item, fica o mais grave e os donos somam", () => {
    const base: Omit<ItemInterno, "id" | "severidade" | "donos"> = {
      area: "trafego", cliente: null, sujeito: "X", titulo: "t", motivo: "m", acao: { label: "a", href: "/" },
      chave: "cliente:x", problema: "saldo", papeis: ["traffic"], peso: 1,
    };
    const out = deduplicar([
      { ...base, id: "1", severidade: "warning", donos: ["Julio"] },
      { ...base, id: "2", severidade: "critical", donos: ["Outro"], titulo: "grave" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ severidade: "critical", titulo: "grave" });
    expect(out[0].donos.sort()).toEqual(["Julio", "Outro"]);
  });

  it("cliente com duas contas de saldo baixo tem UM alerta de saldo", () => {
    const d = dados({
      clientes: [cliente({ id: "a", assigned_traffic: "Julio" })],
      contas: [
        { id: "c1", client_id: "a", meta_account_id: "act_1", account_status: 1, sync_error: null, last_balance: 0, is_prepaid: true, monthly_budget: 3000, current_month_spend: 0, last_3d_avg_spend: 50 },
        { id: "c2", client_id: "a", meta_account_id: "act_2", account_status: 1, sync_error: null, last_balance: 100, is_prepaid: true, monthly_budget: 3000, current_month_spend: 0, last_3d_avg_spend: 50 },
      ],
    });
    const saldo = doProblema(itensDe(d), "saldo");
    expect(saldo).toHaveLength(1);
    expect(saldo[0]).toMatchObject({ severidade: "critical", motivo: expect.stringContaining("Saldo zerado") });
  });

  it("card atrasado não reaparece como 'pronto para postar'; aprovado pelo cliente não aparece como 'em aprovação'", () => {
    const d = dados({
      clientes: [cliente({ id: "a", assigned_social: "Carlos" })],
      cards: [
        card({ id: "atrasado-pronto", client_id: "a", status: "approval", due_date: dataMenos(2), designer_delivered_at: diasAtras(4) }),
        card({ id: "aprovado", client_id: "a", status: "client_approval", due_date: dataMenos(-5), client_approved_at: diasAtras(3), status_changed_at: diasAtras(5) }),
      ],
    });
    const xs = itensDe(d);
    expect(doProblema(xs, "atrasado")[0].acao.href).toBe("/social?card=atrasado-pronto");
    expect(doProblema(xs, "postar")[0].acao.href).toBe("/social?card=aprovado");
    expect(doProblema(xs, "aprovacao")).toHaveLength(0);
  });

  it("cliente em risco E calado no grupo é UM item de relacionamento, com o calado primeiro no porquê", () => {
    const d = dados({
      clientes: [cliente({ id: "a", current_health_level: "risco", current_health_score: 50, last_client_msg_at: diasAtras(12) })],
      motivosSaude: { a: ["Relacionamento em 40"] },
    });
    const rel = doProblema(itensDe(d), "relacionamento");
    expect(rel).toHaveLength(1);
    expect(rel[0].motivo).toBe("Sem falar no grupo há 12 dias · Relacionamento em 40");
  });
});

describe("Início — filtro por papel e por pessoa", () => {
  const d = dados({
    clientes: [
      cliente({ id: "doCarlos", assigned_social: "Carlos", assigned_traffic: "Julio", assigned_designer: "Rodrigo" }),
      cliente({ id: "doThiago", assigned_social: "Thiago", service_type: "assessoria_social" }),
      cliente({ id: "semSocial", assigned_social: null }),
    ],
    cards: [
      card({ id: "k1", client_id: "doCarlos", due_date: dataMenos(2) }),            // atrasado sem arte → social + designer
      card({ id: "k2", client_id: "doThiago", due_date: dataMenos(2), designer_delivered_at: diasAtras(3) }),
    ],
    contas: [
      { id: "c1", client_id: "doCarlos", meta_account_id: "act_1", account_status: 3, sync_error: null, last_balance: 500, is_prepaid: true, monthly_budget: 3000, current_month_spend: 0, last_3d_avg_spend: 50 },
      { id: "c2", client_id: "doThiago", meta_account_id: "act_2", account_status: 3, sync_error: null, last_balance: 500, is_prepaid: true, monthly_budget: 3000, current_month_spend: 0, last_3d_avg_spend: 50 },
    ],
    tarefas: [{ id: "t1", title: "Planilha", client_id: null, client_name: null, assigned_to: "Thiago", role: "social", due_date: dataMenos(1), priority: "critical", status: "pending" }],
    leads: [
      { id: "l1", contato_nome: "Maria", empresa: "Padaria", estagio: "proposta", responsavel: null, proximo_contato: dataMenos(2), reuniao_data: null, fechado_em: null },
      { id: "l2", contato_nome: "João", empresa: "Oficina", estagio: "lead", responsavel: "Outra Pessoa", proximo_contato: dataMenos(1), reuniao_data: null, fechado_em: null },
    ],
    ajustes: { ...DADOS_VAZIOS.ajustes, tokenMetaCritico: true },
  });
  const todos = itensDe(d);
  const de = (v: Viewer) => todos.filter((i) => visivelPara(i, v));

  it("gestão vê tudo, inclusive o que não tem dono", () => {
    expect(de(GESTOR)).toHaveLength(todos.length);
    expect(de(GESTOR).some((i) => i.problema === "integracao")).toBe(true);
  });

  it("social vê só os clientes dele — 'Carlos' no cadastro do cliente casa com 'Carlos Augusto' do time", () => {
    const meus = de(CARLOS);
    expect(meus.map((i) => i.cliente?.id)).toContain("doCarlos");
    expect(meus.some((i) => i.cliente?.id === "doThiago")).toBe(false);
    expect(meus.some((i) => i.area === "trafego")).toBe(false);
    expect(meus.some((i) => i.problema === "integracao")).toBe(false);
  });

  it("a tarefa vencida é de quem foi atribuída", () => {
    expect(de(THIAGO).some((i) => i.problema === "tarefas" && i.severidade === "critical")).toBe(true);
    expect(de(CARLOS).some((i) => i.problema === "tarefas")).toBe(false);
  });

  it("tráfego vê só alerta de conta dos clientes dele — e cliente só-social não gera alerta de tráfego", () => {
    const meus = de(JULIO);
    expect(meus.filter((i) => i.problema === "conta").map((i) => i.cliente?.id)).toEqual(["doCarlos"]);
    expect(todos.some((i) => i.problema === "conta" && i.cliente?.id === "doThiago")).toBe(false);
  });

  it("designer entra no post atrasado sem arte dos clientes da carteira dele, e não no resto", () => {
    const meus = de(RODRIGO);
    expect(meus.map((i) => `${i.problema}:${i.cliente?.id}`)).toEqual(["atrasado:doCarlos"]);
  });

  it("comercial vê lead sem responsável (é do papel) e não vê o lead de outra pessoa", () => {
    const meus = de(ANA).map((i) => i.chave);
    expect(meus).toContain("lead:l1");
    expect(meus).not.toContain("lead:l2");
  });

  it("problema de cliente sem social atribuído não cai no colo de nenhum social — fica com a gestão", () => {
    const d2 = dados({ clientes: [cliente({ id: "semSocial", current_health_level: "risco", current_health_score: 30 })] });
    const xs = itensDe(d2);
    expect(xs.filter((i) => visivelPara(i, CARLOS))).toHaveLength(0);
    expect(xs.filter((i) => visivelPara(i, GESTOR))).toHaveLength(1);
  });

  it("designer não vê no feed o que já está na fila dele (arte atrasada), mas a fila conta", () => {
    const d3 = dados({
      clientes: [cliente({ id: "a", assigned_designer: "Rodrigo" })],
      pedidosArte: [{ id: "p1", title: "Carrossel", client_id: "a", status: "queued", assigned_designer: null, deadline: dataMenos(2), content_card_id: null }],
    });
    expect(feedPara(gerarItens(d3, montarContexto(d3, AGORA)), RODRIGO).some((i) => i.problema === "arte_atrasada")).toBe(false);
    const r = montarInicio(d3, RODRIGO, AGORA);
    expect(r.resumo).toMatchObject({ tipo: "designer", designer: { atrasados: 1 } });
  });
});

describe("Início — carteira que não gera alerta", () => {
  it("cliente pausado, ex-cliente, rascunho e '(teste)' não geram item nenhum", () => {
    const ruim = { current_health_level: "risco", current_health_score: 20, last_client_msg_at: diasAtras(30) };
    const d = dados({
      clientes: [
        cliente({ id: "pausado", paused_at: diasAtras(3), paused_until: null, ...ruim }),
        cliente({ id: "saiu", churned_at: diasAtras(10), ...ruim }),
        cliente({ id: "rascunho", draft_status: "pending", ...ruim }),
        cliente({ id: "teste", name: "Loja (teste)", ...ruim }),
      ],
    });
    expect(itensDe(d)).toHaveLength(0);
  });

  it("conta encerrada ao lado de uma ativa não é problema; conta desconhecida (nunca sincronizada) também não", () => {
    const d = dados({
      clientes: [cliente({ id: "a", assigned_traffic: "Julio" })],
      contas: [
        { id: "velha", client_id: "a", meta_account_id: "act_0", account_status: 101, sync_error: null, last_balance: null, is_prepaid: true, monthly_budget: null, current_month_spend: null, last_3d_avg_spend: null },
        { id: "nova", client_id: "a", meta_account_id: "act_1", account_status: 1, sync_error: null, last_balance: 2000, is_prepaid: true, monthly_budget: 3000, current_month_spend: 0, last_3d_avg_spend: 50 },
        { id: "virgem", client_id: "a", meta_account_id: "act_2", account_status: null, sync_error: null, last_balance: null, is_prepaid: true, monthly_budget: null, current_month_spend: null, last_3d_avg_spend: null },
      ],
    });
    expect(itensDe(d).filter((i) => i.area === "trafego")).toHaveLength(0);
  });

  it("queda de resultado vira um item por cliente, com o pior sintoma", () => {
    const d = dados({
      clientes: [cliente({ id: "a", assigned_traffic: "Julio" })],
      anomalias: [
        { client_id: "a", metric: "ctr", severity: "high", percent_change: -55 },
        { client_id: "a", metric: "cpl", severity: "high", percent_change: 85 },
      ],
    });
    const entrega = doProblema(itensDe(d), "entrega");
    expect(entrega).toHaveLength(1);
    expect(entrega[0]).toMatchObject({ titulo: "Custo por conversa subiu 85%", severidade: "warning" });
  });
});
