// tests/crm-externo.test.ts — o CRM do cliente no relatório e no portal (lib/crm-externo, 18/11/2026).
//
// O que isto protege:
//   · falha virando zero (bloco que o CRM não respondeu tem de sair como indisponível, nunca 0);
//   · dado pessoal passando (nome de contato do Âncora, telefone/e-mail na API aberta);
//   · número da janela errada (perdido de outro mês contado na semana);
//   · endereço do Kommo digitado livre virando chamada para qualquer host (SSRF);
//   · a folha do PDF com "undefined", "NaN" ou HTML do nome da etapa sem escapar.
// Nomes e números inventados.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { deAncora, dosEventos, faixasDeResposta, percentil, type EventoCrm, type TipoEvento } from "@/lib/crm-externo/metricas";
import { deKommo, hostDoKommo, lerFunis, lerLeads, KOMMO_GANHO, KOMMO_PERDIDO } from "@/lib/crm-externo/kommo";
import { validarLote, pareceDadoPessoal } from "@/lib/crm-externo/eventos";
import { montarRelatorioCrm, formatarDuracao, formatarHoras, formatarCrm } from "@/lib/crm-externo/relatorio";
import { folhaCrm } from "@/lib/reports/relatorioCrmPdf";
import { janelaDoRelatorio, janelaAnterior } from "@/lib/reports/relatorioCliente";

const ler = (p: string) => readFileSync(p, "utf8");

// A resposta da porta de parceiro do Âncora (forma de 18/11/2026).
const ancoraCompleto = {
  resumo: {
    receita_janela: 1_250_000, vendas_janela: 5, receita_anterior: 900_000, vendas_anterior: 4,
    leads_janela: 40, leads_anterior: 32, coorte: { leads: 40, convertidos: 6 },
    funil_por_etapa: [{ stage_id: "s2", negocios: 3 }, { stage_id: "s1", negocios: 7 }, { stage_id: "s9", negocios: 0 }],
    por_vendedor: [{ user_id: "u1", nome: "Vendedora Exemplo", leads: 40, convertidos: 6, orcamentos: 9, ganhos: 5, receita_cents: 1_250_000 }],
  },
  atendimento: {
    sla: { mediana_secs: 180, p90_secs: 900, faixas: { boa: 20, atencao: 5, estourada: 3 }, respondidas: 28, acervo: 2, total: 30 },
    contato: { chegaram: 40, contatados: 35, iniciadas_por_nos: 4 },
    sla_por_vendedor: [{ user_id: "u1", nome: "Vendedora Exemplo", mediana_secs: 180 }],
    proximos_leads: [{ conversation_id: "c1", contact_id: "k1", nome: "Contato Secreto da Silva", awaiting_since: "2026-11-17T10:00:00Z", qual_score: 3, open_value_cents: 0 }],
  },
  recuperadas: { janela_dias: 90, ganhos_no_periodo: 5, reversao: { negocios: 1, receita_cents: 200_000 }, reconquista: { negocios: 1, receita_cents: 100_000, com_data_estimada: 0 } },
  vendas: {
    periodo: { ciclo_mediana_horas: 52.5, ciclos_contados: 5, perdidos: 4, orcamentos_criados: 12, orcamentos_criados_cents: 3_000_000 },
    agora: { abertos: 10, pipeline_cents: 4_500_000, parados: 2 },
  },
  etapas: [
    { id: "s1", nome: "Novo contato", posicao: 1, funil: "f1" },
    { id: "s2", nome: "Orçamento enviado", posicao: 3, funil: "f1" },
  ],
};

describe("Âncora → língua comum", () => {
  it("traduz todos os blocos", () => {
    const m = deAncora(ancoraCompleto);
    expect(m.leads).toBe(40);
    expect(m.vendas).toEqual({ quantidade: 5, valorCentavos: 1_250_000 });
    expect(m.resposta).toEqual({ medianaSeg: 180, p90Seg: 900, respondidas: 28, faixas: { boa: 20, atencao: 5, estourada: 3 } });
    expect(m.orcamentos).toEqual({ quantidade: 12, valorCentavos: 3_000_000 });
    expect(m.ciclo).toEqual({ medianaHoras: 52.5, contados: 5 });
    expect(m.perdidos).toBe(4);
    expect(m.recuperadas).toEqual({ negocios: 2, valorCentavos: 300_000 });
    expect(m.abertos).toEqual({ quantidade: 10, valorCentavos: 4_500_000 });
    expect(m.conversao).toEqual({ leads: 40, convertidos: 6 });
    expect(m.indisponivel).toEqual([]);
    expect(m.naoOferece).toEqual([]);
  });

  it("funil na ordem das etapas, com nome, sem etapa vazia", () => {
    expect(deAncora(ancoraCompleto).funil).toEqual([{ etapa: "Novo contato", negocios: 7 }, { etapa: "Orçamento enviado", negocios: 3 }]);
  });

  it("nome de contato e de vendedor NUNCA passam", () => {
    const txt = JSON.stringify(deAncora(ancoraCompleto));
    expect(txt).not.toContain("Contato Secreto");
    expect(txt).not.toContain("Vendedora Exemplo");
  });

  it("bloco null (falhou lá) é indisponível — não zero", () => {
    const m = deAncora({ ...ancoraCompleto, atendimento: null, vendas: null });
    expect(m.resposta).toBeNull();
    expect(m.indisponivel).toEqual(expect.arrayContaining(["resposta", "ciclo", "perdidos", "orcamentos"]));
    expect(m.leads).toBe(40); // os outros blocos seguem
  });

  it("Âncora antigo (sem vendas e etapas) = não oferece, não falha", () => {
    const { vendas: _v, etapas: _e, ...antigo } = ancoraCompleto;
    const m = deAncora(antigo);
    expect(m.indisponivel).toEqual([]);
    expect(m.naoOferece).toEqual(expect.arrayContaining(["ciclo", "perdidos", "orcamentos", "funil"]));
    expect(m.funil).toBeNull();
  });

  it("forma torta num bloco derruba só aquele bloco", () => {
    const m = deAncora({ ...ancoraCompleto, resumo: { ...ancoraCompleto.resumo, leads_janela: "muitos" } });
    expect(m.leads).toBeNull();
    expect(m.indisponivel).toEqual(expect.arrayContaining(["leads", "vendas", "conversao", "funil"]));
    expect(m.resposta?.medianaSeg).toBe(180);
  });
});

describe("contas", () => {
  it("percentil e régua de 5/10 minutos", () => {
    expect(percentil([], 0.5)).toBeNull();
    expect(percentil([10], 0.9)).toBe(10);
    expect(percentil([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(faixasDeResposta([299, 300, 600, 601])).toEqual({ boa: 1, atencao: 2, estourada: 1 });
  });
  it("formatos", () => {
    expect(formatarDuracao(45)).toBe("45 s");
    expect(formatarDuracao(240)).toBe("4 min");
    expect(formatarDuracao(4800)).toBe("1 h 20 min");
    expect(formatarDuracao(3 * 86_400)).toBe("3 dias");
    expect(formatarHoras(5)).toBe("5 h");
    expect(formatarHoras(60)).toBe("2,5 dias");
    expect(formatarCrm(null, "inteiro")).toBe("—");
    expect(formatarCrm(Number.NaN, "pct")).toBe("—");
    expect(formatarCrm(1_250_000, "dinheiro")).toMatch(/R\$\s?12\.500/);
  });
});

describe("API aberta: eventos → métricas", () => {
  const ev = (tipo: TipoEvento, ocorreu_em: string, x: Partial<EventoCrm> = {}): EventoCrm =>
    ({ tipo, ocorreu_em, negocio_ref: null, valor_centavos: null, segundos: null, etapa: null, ...x });
  const de = "2026-11-09T00:00:00.000-03:00", ate = "2026-11-15T23:59:59.999-03:00";
  const todos = new Set<TipoEvento>(["lead", "resposta", "orcamento", "venda", "perda", "etapa"]);
  const eventos: EventoCrm[] = [
    ev("lead", "2026-11-01T12:00:00Z", { negocio_ref: "n1" }), // antes da janela: conta para o ciclo, não para leads
    ev("lead", "2026-11-10T12:00:00Z", { negocio_ref: "n2" }),
    ev("lead", "2026-11-11T12:00:00Z", { negocio_ref: "n3" }),
    ev("resposta", "2026-11-10T12:02:00Z", { negocio_ref: "n2", segundos: 120 }),
    ev("resposta", "2026-11-11T12:20:00Z", { negocio_ref: "n3", segundos: 1200 }),
    ev("orcamento", "2026-11-12T12:00:00Z", { negocio_ref: "n2", valor_centavos: 50_000 }),
    ev("etapa", "2026-11-10T13:00:00Z", { negocio_ref: "n2", etapa: "Proposta" }),
    ev("etapa", "2026-11-11T13:00:00Z", { negocio_ref: "n3", etapa: "Qualificado" }),
    ev("etapa", "2026-11-02T13:00:00Z", { negocio_ref: "n1", etapa: "Proposta" }),
    ev("venda", "2026-11-13T12:00:00Z", { negocio_ref: "n1", valor_centavos: 100_000 }), // 12 dias após o lead
    ev("perda", "2026-11-20T12:00:00Z", { negocio_ref: "n3" }), // DEPOIS da janela: não conta como perdido do período, mas fecha n3 no funil de agora
  ];

  it("conta só a janela, com ciclo pelo primeiro lead do mesmo negócio", () => {
    const m = dosEventos(eventos, de, ate, todos);
    expect(m.leads).toBe(2);
    expect(m.resposta?.medianaSeg).toBe(660);
    expect(m.resposta?.faixas).toEqual({ boa: 1, atencao: 0, estourada: 1 });
    expect(m.vendas).toEqual({ quantidade: 1, valorCentavos: 100_000 });
    expect(m.orcamentos).toEqual({ quantidade: 1, valorCentavos: 50_000 });
    expect(m.perdidos).toBe(0);
    expect(m.ciclo).toEqual({ medianaHoras: 288, contados: 1 });
  });

  it("funil = última etapa dos negócios abertos AGORA (como no Âncora e no Kommo)", () => {
    const m = dosEventos(eventos, de, ate, todos);
    // n1 vendido, n3 perdido depois da janela: só n2 segue aberto
    expect(m.funil).toEqual([{ etapa: "Proposta", negocios: 1 }]);
    expect(m.abertos?.quantidade).toBe(1);
  });

  it("tipo que a conexão nunca mandou = não oferece (não zero)", () => {
    const m = dosEventos(eventos, de, ate, new Set<TipoEvento>(["lead", "venda"]));
    expect(m.resposta).toBeNull();
    expect(m.orcamentos).toBeNull();
    expect(m.perdidos).toBeNull();
    expect(m.naoOferece).toEqual(expect.arrayContaining(["resposta", "orcamentos", "perdidos", "funil"]));
  });
});

describe("API aberta: o contrato do lote", () => {
  const agora = Date.parse("2026-11-18T12:00:00Z");
  const ok = { id: "e1", tipo: "venda", quando: "2026-11-17T10:00:00-03:00", negocio: "neg-881", valor: 1250.5 };

  it("lote válido vira linhas, valor em centavos", () => {
    const v = validarLote({ eventos: [ok, { id: "e2", tipo: "resposta", quando: "2026-11-17T10:00:00Z", segundos: 90 }] }, agora);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.linhas[0]).toMatchObject({ id_externo: "e1", tipo: "venda", valor_centavos: 125_050, negocio_ref: "neg-881" });
  });

  it.each([
    ["telefone no negocio", { ...ok, negocio: "+55 (11) 98888-7777" }],
    ["e-mail no negocio", { ...ok, negocio: "fulano@exemplo.com" }],
    ["resposta sem segundos", { id: "e3", tipo: "resposta", quando: ok.quando }],
    ["etapa sem nome da etapa", { id: "e4", tipo: "etapa", quando: ok.quando, negocio: "n1" }],
    ["data no futuro", { ...ok, quando: "2026-12-30T10:00:00Z" }],
    ["data sem fuso", { ...ok, quando: "2026-11-17T10:00:00" }],
    ["tipo desconhecido", { ...ok, tipo: "reuniao" }],
    ["campo a mais (nome do contato)", { ...ok, nome: "Contato Exemplo" }],
    ["nome de pessoa no negocio", { ...ok, negocio: "Maria Exemplo" }],
    ["telefone com DDI dentro do negocio", { ...ok, negocio: "wa-5511999999999" }],
    ["jid do WhatsApp no id", { ...ok, id: "5511999999999@s.whatsapp.net" }],
    ["telefone com DDI no id", { ...ok, id: "lead-5511988887777" }],
  ])("recusa o lote inteiro: %s", (_t, ruim) => {
    const v = validarLote({ eventos: [ok, ruim] }, agora);
    expect(v.ok).toBe(false);
  });

  it("id repetido no mesmo lote e corpo fora do formato", () => {
    expect(validarLote({ eventos: [ok, ok] }, agora).ok).toBe(false);
    expect(validarLote({ eventos: [] }, agora).ok).toBe(false);
    expect(validarLote([ok], agora).ok).toBe(false);
  });

  it("id de negócio comum não é confundido com telefone", () => {
    expect(pareceDadoPessoal("neg-881")).toBe(false);
    expect(pareceDadoPessoal("123456")).toBe(false);
    expect(pareceDadoPessoal("lead_9988776655_x")).toBe(false);
    expect(pareceDadoPessoal("11988887777")).toBe(true);
    expect(pareceDadoPessoal("lead 11 99999-9999")).toBe(true);
    expect(pareceDadoPessoal("(11) 3333-4444")).toBe(true);
    expect(pareceDadoPessoal("evt-1731940000")).toBe(false); // carimbo de tempo
    expect(pareceDadoPessoal("lead-20261118-1030")).toBe(false);
  });
});

describe("Kommo", () => {
  it("só endereço do Kommo/amoCRM (nada de host livre)", () => {
    expect(hostDoKommo("minhaempresa")).toBe("minhaempresa.kommo.com");
    expect(hostDoKommo("https://MinhaEmpresa.kommo.com/leads/pipeline")).toBe("minhaempresa.kommo.com");
    expect(hostDoKommo("loja.amocrm.ru")).toBe("loja.amocrm.ru");
    expect(hostDoKommo("evil.com")).toBeNull();
    expect(hostDoKommo("x.kommo.com.evil.com")).toBeNull();
    expect(hostDoKommo("127.0.0.1")).toBeNull();
    expect(hostDoKommo("a.b.kommo.com")).toBeNull();
    expect(hostDoKommo("")).toBeNull();
  });

  const funis = lerFunis({ _embedded: { pipelines: [{ id: 10, name: "Vendas", is_main: true, _embedded: { statuses: [
    { id: 1, name: "Entrada", sort: 10 }, { id: 2, name: "Orçamento", sort: 20 }, { id: KOMMO_GANHO, name: "Ganho", sort: 1000 }, { id: KOMMO_PERDIDO, name: "Perdido", sort: 1001 },
  ] } }] } });
  const de = Date.parse("2026-11-09T03:00:00Z") / 1000, ate = Date.parse("2026-11-16T02:59:59Z") / 1000;
  const lead = (id: number, status: number, criado: string, fechado: string | null, price = 1000) =>
    ({ id, price, status_id: status, pipeline_id: 10, created_at: Date.parse(criado) / 1000, closed_at: fechado ? Date.parse(fechado) / 1000 : null });

  it("204 do Kommo é lista vazia; formato torto é erro", () => {
    expect(lerLeads(null)).toEqual([]);
    expect(() => lerLeads({ coisa: 1 })).toThrow();
    expect(funis[0].etapas.map((e) => e.fechada)).toEqual([false, false, true, true]);
  });

  it("vendas, perdidos e ciclo da janela; funil de agora; sem tempo de resposta", () => {
    const m = deKommo({
      de, ate, funis, funilId: null, entradasNoOrcamento: 3,
      criados: [lead(1, 1, "2026-11-10T12:00:00Z", null), lead(2, KOMMO_GANHO, "2026-11-10T12:00:00Z", "2026-11-11T12:00:00Z", 2500)],
      fechados: [
        lead(2, KOMMO_GANHO, "2026-11-10T12:00:00Z", "2026-11-11T12:00:00Z", 2500),
        lead(3, KOMMO_PERDIDO, "2026-11-01T12:00:00Z", "2026-11-12T12:00:00Z"),
        lead(4, KOMMO_GANHO, "2026-10-01T12:00:00Z", "2026-11-20T12:00:00Z"), // fora da janela
      ],
      abertos: [lead(1, 1, "2026-11-10T12:00:00Z", null), lead(5, 2, "2026-11-05T12:00:00Z", null, 400), lead(6, 2, "2026-11-05T12:00:00Z", null, 600)],
    });
    expect(m.leads).toBe(2);
    expect(m.conversao).toEqual({ leads: 2, convertidos: 1 });
    expect(m.vendas).toEqual({ quantidade: 1, valorCentavos: 250_000 });
    expect(m.perdidos).toBe(1);
    expect(m.ciclo).toEqual({ medianaHoras: 24, contados: 1 });
    expect(m.orcamentos).toEqual({ quantidade: 3, valorCentavos: null });
    expect(m.funil).toEqual([{ etapa: "Entrada", negocios: 1 }, { etapa: "Orçamento", negocios: 2 }]);
    expect(m.abertos).toEqual({ quantidade: 3, valorCentavos: 200_000 });
    expect(m.naoOferece).toEqual(expect.arrayContaining(["resposta", "recuperadas"]));
  });

  it("leitura que falhou é indisponível; etapa de orçamento não escolhida é 'não oferece'", () => {
    const m = deKommo({ de, ate, funis, funilId: null, entradasNoOrcamento: undefined, criados: null, fechados: [], abertos: [] });
    expect(m.leads).toBeNull();
    expect(m.indisponivel).toEqual(expect.arrayContaining(["leads", "conversao"]));
    expect(m.naoOferece).toContain("orcamentos");
    expect(m.vendas).toEqual({ quantidade: 0, valorCentavos: 0 }); // leu e não houve: zero de verdade
  });
});

describe("o bloco do relatório", () => {
  const janela = janelaDoRelatorio("2026-11-09", "2026-11-15");
  const atual = deAncora(ancoraCompleto);
  const anterior = deAncora({ ...ancoraCompleto, resumo: { ...ancoraCompleto.resumo, leads_janela: 32, vendas_janela: 4, receita_janela: 900_000 } });

  it("KPIs com comparação e frase legível", () => {
    const r = montarRelatorioCrm({ provedor: "ancora", janela, anterior: janelaAnterior(janela), atual, doAnterior: anterior });
    const k = (c: string) => r.kpis.find((x) => x.chave === c)!;
    expect(k("leads").variacaoPct).toBeCloseTo(25);
    expect(k("leads").tom).toBe("bom");
    expect(k("resposta").natureza).toBe("inversa");
    expect(k("resposta_boa").valor).toBeCloseTo((20 / 28) * 100);
    expect(r.frase.replace(/\u00a0/g, " ")).toBe("Na última semana, chegaram 40 leads (25% a mais que na semana anterior), a primeira resposta saiu em 3 min (mediana) e foram fechadas 5 vendas, somando R$ 12.500 (39% a mais que na semana anterior).");
    expect(r.faltando).toEqual([]);
    expect(r.semDados).toBe(false);
  });

  it("sem o anterior: número sem comparação", () => {
    const r = montarRelatorioCrm({ provedor: "ancora", janela, anterior: janelaAnterior(janela), atual, doAnterior: null });
    expect(r.anterior).toBeNull();
    expect(r.kpis.every((k) => k.variacaoPct == null)).toBe(true);
  });

  it("tudo indisponível = sem folha; parte indisponível vai em `faltando`", () => {
    const nada = deAncora({ resumo: null, atendimento: null, recuperadas: null, vendas: null, etapas: null });
    expect(montarRelatorioCrm({ provedor: "ancora", janela, anterior: null, atual: nada, doAnterior: null }).semDados).toBe(true);
    const meio = montarRelatorioCrm({ provedor: "ancora", janela, anterior: null, atual: deAncora({ ...ancoraCompleto, atendimento: null }), doAnterior: null });
    expect(meio.faltando).toContain("tempo de resposta");
    expect(meio.kpis.some((k) => k.chave === "resposta")).toBe(false);
  });

  it("folha do PDF: sem undefined/NaN, nome de etapa escapado", () => {
    const comHtml = deAncora({ ...ancoraCompleto, etapas: [{ id: "s1", nome: "<b>Novo</b>", posicao: 1, funil: "f1" }, { id: "s2", nome: "Orçamento", posicao: 2, funil: "f1" }] });
    const r = montarRelatorioCrm({ provedor: "ancora", janela, anterior: janelaAnterior(janela), atual: comHtml, doAnterior: anterior });
    const html = folhaCrm(r, "Loja Exemplo & Cia")!;
    expect(html).toContain("Atendimento e vendas · Âncora CRM");
    expect(html).toContain("Loja Exemplo &amp; Cia");
    expect(html).toContain("&lt;b&gt;Novo&lt;/b&gt;");
    expect(html).not.toMatch(/undefined|NaN/);
    expect(folhaCrm({ ...r, semDados: true }, "x")).toBeNull();
    expect(folhaCrm(null, "x")).toBeNull();
  });
});

describe("costuras (leitura do código)", () => {
  it("a API aberta é pública só no caminho dela, e a rota exige o token", () => {
    const mw = ler("middleware.ts");
    expect(mw).toContain('"/api/crm-externo/eventos"');
    expect(mw).not.toMatch(/"\/api\/crm-externo"[,\]]/);
    const rota = ler("app/api/crm-externo/eventos/route.ts");
    expect(rota.indexOf("conexaoDoToken(")).toBeGreaterThan(-1);
    expect(rota.indexOf("autenticar(req)")).toBeLessThan(rota.indexOf("req.text()"));
  });

  it("segredo nunca sai: a conexão pública não tem segredo nem hash; servidor só", () => {
    const s = ler("lib/crm-externo/servidor.ts");
    expect(s).toContain('import "server-only"');
    const pub = s.slice(s.indexOf("export function conexaoPublica"), s.indexOf("/** A conexão do cliente"));
    expect(pub).not.toMatch(/segredo:|token_hash/);
    expect(ler("lib/crm-externo/kommo-server.ts")).toContain('import "server-only"');
    expect(ler("lib/crm-externo/kommo-server.ts")).toContain('redirect: "error"');
    // o token do Kommo é gravado cifrado
    expect(ler("app/api/clients/[id]/crm/route.ts")).toContain("cifrado = encryptVault(token)");
  });

  it("relatório lê fresco e o portal com cache; falha vira aviso, não folha", () => {
    expect(ler("lib/traffic/weekly-report.ts")).toContain("lerRelatorioCrm(client.id, janela, { fresco: true })");
    const portal = ler("app/api/portal/[token]/crm/route.ts");
    expect(portal).toContain("lerRelatorioCrm(c.id, janela, { anterior })");
    expect(portal).not.toContain("r.avisos,");
  });

  it("falha não vira 'sem CRM' nem zero (vistoria de 18/11)", () => {
    const s = ler("lib/crm-externo/servidor.ts");
    // erro de banco que não é tabela inexistente LANÇA
    expect(s).toContain("throw new Error(`Não consegui conferir as tabelas de CRM");
    // API aberta parada há mais de 7 dias = não sei, não zero
    expect(s).toContain("O CRM não manda eventos desde");
    // conexão pausada continua recebendo
    expect(s).not.toMatch(/provedor === "api_aberta" && c\.ativa/);
    const k = ler("lib/crm-externo/kommo-server.ts");
    expect(k).toContain("O funil escolhido não existe mais no Kommo");
    expect(k).toContain("r.status === 429");
    const rota = ler("app/api/clients/[id]/crm/route.ts");
    expect(rota).toContain("link: null"); // tráfego não recebe o link de cadastro
    expect(rota).toContain("esquecerLeituras(atual.id)");
  });

  it("toda tabela nova com RLS", () => {
    const sql = ler("supabase/migrations/20261118150000_crm_conexoes.sql");
    for (const t of ["crm_conexoes", "crm_eventos", "crm_leituras"]) expect(sql).toContain(`alter table public.${t}`);
    expect((sql.match(/enable row level security/g) ?? []).length).toBe(3);
  });
});
