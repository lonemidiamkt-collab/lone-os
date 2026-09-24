// tests/trafego-hoje.test.ts — a aba "Hoje" do Tráfego (Leva 4): quem entra, qual problema vem
// primeiro, os números do dia e o que muda quando alguém marca "visto".

import { describe, it, expect } from "vitest";
import {
  clienteDoHoje, linkGerenciador, montarLinhas, numerosDoDia, ontemSP, somarDias,
  type ClienteHojeRow, type ContaHojeRow, type EntradaHoje,
} from "@/lib/traffic/hoje/montar";
import { comVisto, contarLinhas } from "@/lib/traffic/hoje/ordem";
import { mapaDeVistos } from "@/lib/traffic/hoje/visto";
import { canonizador } from "@/lib/inicio/dados";

const AGORA = new Date("2026-09-24T15:00:00Z"); // 12h em São Paulo
const ONTEM = "2026-09-23";

const cliente = (id: string, o: Partial<ClienteHojeRow> = {}): ClienteHojeRow => ({
  id, name: id, nome_fantasia: null, logo: null, doc_logo: null, active: true, churned_at: null, draft_status: null,
  paused_at: null, paused_until: null, service_type: "assessoria_trafego", assigned_traffic: "Julio",
  meta_ad_account_id: `act_${id.length}000`, ...o,
});

const conta = (clientId: string, o: Partial<ContaHojeRow> = {}): ContaHojeRow => ({
  id: `conta-${clientId}`, client_id: clientId, meta_account_id: "act_123456", account_status: 1, sync_error: null,
  last_balance: 1000, is_prepaid: true, monthly_budget: 3000, current_month_spend: 1500, last_3d_avg_spend: 100,
  last_synced_at: "2026-09-24T14:00:00Z", ...o,
});

const canon = canonizador([{ nome: "Julio", papel: "traffic" }, { nome: "Roberto Lino", papel: "admin" }]);

const entrada = (o: Partial<EntradaHoje> = {}): EntradaHoje => ({
  agora: AGORA, ontem: ONTEM, clientes: [], contas: [], configs: [], anomalias: [], metricas: [], diagnostico: [],
  vistos: new Map(), ajustes: { warningPct: 20, criticalPct: 5, contasOcultas: [] }, eu: "Julio", canon, ...o,
});

describe("quem entra no Hoje", () => {
  it("só quem comprou tráfego e está operando", () => {
    expect(clienteDoHoje(cliente("a"), AGORA)).toBe(true);
    expect(clienteDoHoje(cliente("a", { service_type: "lone_growth" }), AGORA)).toBe(true);
    expect(clienteDoHoje(cliente("a", { service_type: "assessoria_social" }), AGORA)).toBe(false); // só social
    expect(clienteDoHoje(cliente("a", { service_type: null }), AGORA)).toBe(false);
    expect(clienteDoHoje(cliente("a", { active: false }), AGORA)).toBe(false);
    expect(clienteDoHoje(cliente("a", { churned_at: "2026-09-01" }), AGORA)).toBe(false);
    expect(clienteDoHoje(cliente("a", { draft_status: "pending_invite" }), AGORA)).toBe(false);
    expect(clienteDoHoje(cliente("Loja (teste)"), AGORA)).toBe(false);
    expect(clienteDoHoje(cliente("a", { paused_at: "2026-09-20", paused_until: null }), AGORA)).toBe(false);
    // pausa vencida: volta sozinho
    expect(clienteDoHoje(cliente("a", { paused_at: "2026-09-01", paused_until: "2026-09-10" }), AGORA)).toBe(true);
  });
});

describe("problemas de cada linha", () => {
  it("saldo zerado (pré-pago) é crítico, com o motivo do mesmo motor do WhatsApp", () => {
    const [l] = montarLinhas(entrada({ clientes: [cliente("a")], contas: [conta("a", { last_balance: 0 })] }));
    expect(l.estado).toBe("aberto");
    expect(l.problemas[0]).toMatchObject({ tipo: "saldo", nivel: "critical", titulo: "Saldo acabando", visto: null });
    expect(l.problemas[0].detalhe).toMatch(/Saldo zerado/);
  });

  it("saldo ≤ 20% da verba é atenção e diz quanto dura", () => {
    const [l] = montarLinhas(entrada({ clientes: [cliente("a")], contas: [conta("a", { last_balance: 500 })] }));
    expect(l.problemas[0]).toMatchObject({ tipo: "saldo", nivel: "warning", titulo: "Saldo baixo" });
    expect(l.problemas[0].detalhe).toMatch(/dura ~5 dias/);
    expect(l.numeros).toMatchObject({ saldo: 500, diasRestantes: 5, cartao: false, statusConta: null });
  });

  it("cartão (pós-pago) não alarma por saldo baixo", () => {
    const [l] = montarLinhas(entrada({
      clientes: [cliente("a")], contas: [conta("a", { is_prepaid: false, monthly_budget: 3000, current_month_spend: 2900 })],
    }));
    expect(l.problemas.find((p) => p.tipo === "saldo")).toBeUndefined();
    expect(l.numeros.cartao).toBe(true);
    expect(l.numeros.saldo).toBe(100);
  });

  it("pagamento falhou (status 3) é crítico e vira o status da conta nos números", () => {
    const [l] = montarLinhas(entrada({ clientes: [cliente("a")], contas: [conta("a", { account_status: 3 })] }));
    expect(l.problemas[0]).toMatchObject({ tipo: "conta", nivel: "critical", titulo: "Conta: pagamento falhou" });
    expect(l.numeros.statusConta).toBe("Pagamento falhou");
    expect(l.numeros.saldo).toBeNull();
  });

  it("leitura da Meta falhou é atenção (respeita a config do cliente)", () => {
    const [l] = montarLinhas(entrada({ clientes: [cliente("a")], contas: [conta("a", { sync_error: "OAuth" })] }));
    expect(l.problemas[0]).toMatchObject({ tipo: "conta", nivel: "warning", titulo: "Leitura da Meta falhou" });
    const [l2] = montarLinhas(entrada({
      clientes: [cliente("a")], contas: [conta("a", { sync_error: "OAuth" })],
      configs: [{ client_id: "a", alert_meta_erro: false }],
    }));
    expect(l2.estado).toBe("em_dia");
  });

  it("queda de resultado: o pior sintoma, crítico se algum for crítico", () => {
    const [l] = montarLinhas(entrada({
      clientes: [cliente("a")], contas: [conta("a")],
      anomalias: [
        { client_id: "a", metric: "ctr", severity: "critical", percent_change: -60 },
        { client_id: "a", metric: "impressions", severity: "high", percent_change: -72 },
      ],
    }));
    const entrega = l.problemas.find((p) => p.tipo === "entrega")!;
    expect(entrega).toMatchObject({ nivel: "critical", titulo: "Entrega caiu 72%" });
    expect(entrega.detalhe).toMatch(/mais 1 sinal caindo/);
  });

  it("conta ativa sem gasto em 3 dias é atenção", () => {
    const [l] = montarLinhas(entrada({ clientes: [cliente("a")], contas: [conta("a", { last_3d_avg_spend: 0 })] }));
    expect(l.problemas.map((p) => p.titulo)).toContain("Conta sem gasto");
  });

  it("diagnóstico diário: um problema por tipo com a contagem; 'merece mais verba' vira dica", () => {
    const d = (funcao: string, prioridade: number, achado = `achado ${prioridade}`) =>
      ({ clientId: "a", funcao, achado, acao: "fazer algo", prioridade });
    const [l] = montarLinhas(entrada({
      clientes: [cliente("a")], contas: [conta("a")],
      diagnostico: [
        d("Desperdício", 70), d("Desperdício", 90, "o pior"), d("Criativo cansado", 60),
        d("Merece mais verba", 40, "conjunto barato"), d("Anomalias", 99),
      ],
    }));
    const desperdicio = l.problemas.find((p) => p.tipo === "desperdicio")!;
    expect(desperdicio).toMatchObject({ nivel: "warning", titulo: "2 anúncios gastando sem conversa", detalhe: "o pior", acao: "fazer algo" });
    expect(l.problemas.find((p) => p.tipo === "fadiga")).toMatchObject({ nivel: "info", titulo: "Criativo cansado" });
    expect(l.problemas.find((p) => p.tipo === "entrega")).toBeUndefined(); // "Anomalias" do diagnóstico não duplica
    expect(l.dicas).toEqual(["conjunto barato"]);
  });

  it("cliente de tráfego sem conta vinculada aparece para acompanhar", () => {
    const [l] = montarLinhas(entrada({ clientes: [cliente("a", { meta_ad_account_id: null })] }));
    expect(l.problemas[0]).toMatchObject({ tipo: "conta", nivel: "info", titulo: "Sem conta de anúncio vinculada" });
    expect(l.linkContaExterno).toBe(false);
    expect(l.linkConta).toBe("/clients/a?tab=resultados");
  });

  it("conta oculta na tela de Tráfego não entra", () => {
    const [l] = montarLinhas(entrada({
      clientes: [cliente("a")], contas: [conta("a", { last_balance: 0 })],
      ajustes: { warningPct: 20, criticalPct: 5, contasOcultas: ["act_123456"] },
    }));
    expect(l.problemas.find((p) => p.tipo === "saldo")).toBeUndefined();
  });
});

describe("visto na linha", () => {
  const base = { clientes: [cliente("a")], contas: [conta("a", { last_balance: 500 })] }; // saldo baixo (atenção)
  const marcado = (nivel: string, horasAtras = 1) => mapaDeVistos([{
    client_id: "a", tipo: "saldo", nivel, seen_by: "julio@x", seen_by_name: "Julio",
    seen_at: new Date(AGORA.getTime() - horasAtras * 3_600_000).toISOString(), until: null,
  }]);

  it("visto no mesmo nível: a linha vai para 'visto', com quem viu", () => {
    const [l] = montarLinhas(entrada({ ...base, vistos: marcado("warning") }));
    expect(l.estado).toBe("visto");
    expect(l.problemas[0].visto).toMatchObject({ por: "Julio", nivel: "warning" });
  });

  it("piorou depois do visto: volta a ficar em aberto", () => {
    const [l] = montarLinhas(entrada({ clientes: [cliente("a")], contas: [conta("a", { last_balance: 0 })], vistos: marcado("warning") }));
    expect(l.estado).toBe("aberto");
    expect(l.problemas[0].visto).toBeNull();
  });

  it("passou de 24h: volta a ficar em aberto", () => {
    const [l] = montarLinhas(entrada({ ...base, vistos: marcado("warning", 25) }));
    expect(l.estado).toBe("aberto");
  });

  it("comVisto marca e desmarca a linha inteira na tela", () => {
    const [l] = montarLinhas(entrada({ ...base, anomalias: [{ client_id: "a", metric: "spend", severity: "high", percent_change: -90 }] }));
    expect(l.problemas.every((p) => !p.visto)).toBe(true);
    const info = { por: "Julio", em: AGORA.toISOString(), ate: new Date(AGORA.getTime() + 86_400_000).toISOString(), nivel: "info" as const };
    const vista = comVisto(l, info);
    expect(vista.estado).toBe("visto");
    expect(vista.problemas.map((p) => p.visto?.nivel)).toEqual(vista.problemas.map((p) => p.nivel)); // grava o nível de cada um
    expect(comVisto(vista, null).estado).toBe("aberto");
  });
});

describe("ordem da lista", () => {
  it("crítico em aberto > atenção em aberto > info > visto > em dia; empate pelo dinheiro em jogo", () => {
    const linhas = montarLinhas(entrada({
      clientes: ["emdia", "visto", "atencao", "critico", "info", "atencao2"].map((id) => cliente(id)),
      contas: [
        conta("emdia"),
        conta("visto", { last_balance: 500 }),
        conta("atencao", { last_balance: 500, last_3d_avg_spend: 100 }),
        conta("atencao2", { last_balance: 500, last_3d_avg_spend: 50 }),
        conta("critico", { last_balance: 0 }),
        conta("info"),
      ],
      diagnostico: [{ clientId: "info", funcao: "Criativo cansado", achado: "x", acao: "", prioridade: 50 }],
      vistos: mapaDeVistos([{ client_id: "visto", tipo: "saldo", nivel: "warning", seen_at: AGORA.toISOString(), until: null }]),
    }));
    expect(linhas.map((l) => l.clientId)).toEqual(["critico", "atencao", "atencao2", "info", "visto", "emdia"]);
    expect(contarLinhas(linhas)).toEqual({ critical: 1, warning: 2, info: 1, visto: 1, em_dia: 1 });
  });
});

describe("números e links", () => {
  it("ontem e a média dos 7 dias antes (conversas e custo por conversa)", () => {
    const m = (metric_date: string, spend: number, conversions: number) => ({ client_id: "a", metric_date, spend, conversions });
    const n = numerosDoDia([
      m("2026-09-23", 120, 6),
      ...["2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"].map((d) => m(d, 100, 10)),
      m("2026-09-15", 999, 1), // fora da janela
    ], ONTEM);
    expect(n).toEqual({ gastoOntem: 120, conversasOntem: 6, custoOntem: 20, conversasMedia7d: 10, custoMedio7d: 10, tipoResultado: "mensagens" });
    expect(numerosDoDia([], ONTEM)).toEqual({ gastoOntem: null, conversasOntem: null, custoOntem: null, conversasMedia7d: null, custoMedio7d: null, tipoResultado: "mensagens" });
  });

  it("Leva 7A: resultado pelo objetivo (results) vence as conversas e diz o tipo", () => {
    const n = numerosDoDia([
      { client_id: "a", metric_date: "2026-09-23", spend: 100, conversions: 1, results: 8, result_kind: "leads" },
      { client_id: "a", metric_date: "2026-09-22", spend: 100, conversions: 0, results: 4, result_kind: "leads" },
      // Dia gravado antes da migração: sem results, vale a conversa.
      { client_id: "a", metric_date: "2026-09-21", spend: 100, conversions: 2 },
    ], ONTEM);
    expect(n.conversasOntem).toBe(8);
    expect(n.custoOntem).toBe(12.5);
    expect(n.conversasMedia7d).toBe(3);
    expect(n.tipoResultado).toBe("leads");
  });

  it("ontem é em São Paulo (às 23h de SP ainda é o mesmo dia)", () => {
    expect(ontemSP(new Date("2026-09-25T02:30:00Z"))).toBe("2026-09-23"); // 23h30 do dia 24 em SP
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("Gerenciador de Anúncios quando o id da conta é reconhecível", () => {
    expect(linkGerenciador("act_123456")).toBe("https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=123456");
    expect(linkGerenciador("123456")).toContain("act=123456");
    expect(linkGerenciador("")).toBeNull();
    expect(linkGerenciador("act_abc")).toBeNull();
    const [l] = montarLinhas(entrada({ clientes: [cliente("a")], contas: [conta("a")] }));
    expect(l).toMatchObject({ linkContaExterno: true, linkCliente: "/clients/a?tab=resultados" });
  });

  it("'meu' pelo gestor do cadastro, mesmo escrito diferente", () => {
    const linhas = montarLinhas(entrada({
      clientes: [cliente("a", { assigned_traffic: "julio" }), cliente("b", { assigned_traffic: "Roberto Lino" }), cliente("c", { assigned_traffic: "Julio e Roberto" })],
      contas: [conta("a"), conta("b"), conta("c")],
    }));
    const meu = Object.fromEntries(linhas.map((l) => [l.clientId, l.meu]));
    expect(meu).toEqual({ a: true, b: false, c: true });
  });

  it("nenhum dado financeiro da agência sai no payload", () => {
    const json = JSON.stringify(montarLinhas(entrada({
      clientes: [{ ...cliente("a"), ...({ fee: 5000, mrr: 5000, contract_value: 60000 } as object) } as ClienteHojeRow],
      contas: [conta("a")],
    })));
    expect(json).not.toMatch(/"(fee|mrr|arr|ltv|contract_value|monthly_budget)"/i);
  });
});
