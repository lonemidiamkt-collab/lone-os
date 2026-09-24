// Leva 6A — "este cliente está em risco?" tem UMA resposta (lib/saude/carteira.ts), e toda tela que diz
// "em risco" usa ela. Se um teste daqui falhar, a pergunta é: alguma tela voltou a ter régua própria?

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  compararSeveridade, diasQuietoDoCliente, distribuir, donoDoCliente, ehDaPessoa, emRisco, etapaDaJornada,
  filtroDaUrl, nivelDoCliente, passaNoFiltro, scoreDoCliente, situacaoDaSaude, tendenciaDaSerie,
} from "@/lib/saude/carteira";
import { montarCarteira, type ClienteSaudeRow } from "@/lib/saude/montar";
import { riscoConsolidado } from "@/lib/cs/jornada";
import { DADOS_VAZIOS, montarContexto, type Dados } from "@/lib/inicio/dados";
import { regraRelacionamento } from "@/lib/inicio/regras";
import { ACAO_SAUDE } from "@/lib/clientes/proxima-acao";

const AGORA = new Date("2026-09-25T15:00:00Z"); // quinta, 12h em São Paulo
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString();
const ler = (arq: string) => readFileSync(path.resolve(__dirname, "..", arq), "utf8");

function cliente(o: Partial<ClienteSaudeRow> & { id: string }): ClienteSaudeRow {
  return {
    name: o.id.toUpperCase(), nome_fantasia: null, logo: null, doc_logo: null, status: "good", active: true,
    churned_at: null, draft_status: null, paused_at: null, paused_until: null, created_at: diasAtras(200),
    assigned_social: null, assigned_traffic: null, assigned_designer: null, service_type: "lone_growth",
    current_health_level: "saudavel", current_health_score: 85, last_client_msg_at: diasAtras(1), agente_ativo: true,
    meta_ad_account_id: null, public_report_enabled: false, instagram_user: null, last_post_date: null,
    health_computed_at: diasAtras(0),
    ...o,
  };
}

const TIME = [
  { nome: "Carlos Augusto", papel: "social" as const },
  { nome: "Thiago", papel: "social" as const },
  { nome: "Julio", papel: "traffic" as const },
];

describe("nível e 'em risco' — uma régua", () => {
  it("usa o cache do escritor único; nível da escala antiga cai na faixa da nota", () => {
    expect(nivelDoCliente({ current_health_level: "risco", current_health_score: 90 })).toBe("risco");
    expect(nivelDoCliente({ currentHealthLevel: "atencao", currentHealthScore: 70 })).toBe("atencao");
    expect(nivelDoCliente({ current_health_level: "critical", current_health_score: 50 })).toBe("risco");
    expect(nivelDoCliente({ current_health_level: null, current_health_score: "80" })).toBe("saudavel");
    expect(nivelDoCliente({})).toBe("sem_dado");
    expect(scoreDoCliente({ current_health_score: "abc" })).toBeNull();
  });

  it("em risco é SÓ a saúde — resultado de anúncio ruim não é risco de churn", () => {
    expect(emRisco({ current_health_level: "risco" })).toBe(true);
    expect(emRisco({ current_health_level: "atencao" })).toBe(false);
    // clients.status = at_risk é o anúncio (CPL x meta): não entra na conta.
    expect(emRisco({ status: "at_risk", current_health_level: "saudavel" } as never)).toBe(false);
  });

  it("calado só conta com o agente ligado no grupo", () => {
    expect(diasQuietoDoCliente({ last_client_msg_at: diasAtras(9), agente_ativo: true }, AGORA.getTime())).toBe(9);
    expect(diasQuietoDoCliente({ last_client_msg_at: diasAtras(9), agente_ativo: false }, AGORA.getTime())).toBeNull();
    expect(diasQuietoDoCliente({ last_client_msg_at: null }, AGORA.getTime())).toBeNull();
    expect(diasQuietoDoCliente({ lastClientMsgAt: diasAtras(3), agenteAtivo: true }, AGORA.getTime())).toBe(3);
  });
});

describe("situação: nível + porquê + severidade", () => {
  it("risco é agir hoje, atenção e calado são esta semana, saudável e falando não pede nada", () => {
    expect(situacaoDaSaude({ nivel: "risco", score: 42, diasQuieto: 1 })).toMatchObject({ pedeAtencao: true, severidade: "critical" });
    expect(situacaoDaSaude({ nivel: "atencao", score: 65, diasQuieto: 1 })).toMatchObject({ pedeAtencao: true, severidade: "warning" });
    expect(situacaoDaSaude({ nivel: "saudavel", score: 85, diasQuieto: 9 })).toMatchObject({ pedeAtencao: true, esfriando: true, severidade: "warning" });
    expect(situacaoDaSaude({ nivel: "saudavel", score: 85, diasQuieto: 2 })).toMatchObject({ pedeAtencao: false, severidade: null });
  });

  it("pausado continua na carteira mas não pede nada", () => {
    expect(situacaoDaSaude({ nivel: "risco", score: 30, diasQuieto: 20, pausado: true })).toMatchObject({ pedeAtencao: false, severidade: null, pausado: true });
  });

  it("no máximo 3 porquês, calado primeiro, sem repetir o 'sem contato' do score", () => {
    const s = situacaoDaSaude({
      nivel: "risco", score: 40, diasQuieto: 12,
      motivos: ["12 dias sem contato no grupo", "Relacionamento em 30", "Sentimento em 40", "Pendências em 50"],
    });
    expect(s.motivos).toEqual(["sem falar no grupo há 12 dias", "Relacionamento em 30", "Sentimento em 40"]);
  });

  it("sem dado explica por que não tem nota", () => {
    expect(situacaoDaSaude({ nivel: "sem_dado", score: null, diasQuieto: null, cobertura: 15 }).motivos[0]).toContain("15%");
  });

  it("fila pior primeiro: risco, atenção, calado, sem dado, saudável, pausado", () => {
    const linha = (nome: string, e: Parameters<typeof situacaoDaSaude>[0]) => ({ nome, ...situacaoDaSaude(e) });
    const xs = [
      linha("saudavel", { nivel: "saudavel", score: 90, diasQuieto: 1 }),
      linha("pausado", { nivel: "risco", score: 10, diasQuieto: 1, pausado: true }),
      linha("semdado", { nivel: "sem_dado", score: null, diasQuieto: null }),
      linha("calado", { nivel: "saudavel", score: 80, diasQuieto: 10 }),
      linha("atencao", { nivel: "atencao", score: 70, diasQuieto: 1 }),
      linha("risco50", { nivel: "risco", score: 50, diasQuieto: 1 }),
      linha("risco40", { nivel: "risco", score: 40, diasQuieto: 1 }),
    ];
    expect(xs.sort(compararSeveridade).map((x) => x.nome)).toEqual(["risco40", "risco50", "atencao", "calado", "semdado", "saudavel", "pausado"]);
  });

  it("distribuição, filtros e o endereço antigo ?filter=at_risk", () => {
    const sits = [
      situacaoDaSaude({ nivel: "risco", score: 40, diasQuieto: 10 }),
      situacaoDaSaude({ nivel: "atencao", score: 65, diasQuieto: 1 }),
      situacaoDaSaude({ nivel: "saudavel", score: 90, diasQuieto: 1 }),
      situacaoDaSaude({ nivel: "sem_dado", score: null, diasQuieto: null }),
    ];
    expect(distribuir(sits)).toEqual({ total: 4, risco: 1, atencao: 1, saudavel: 1, semDado: 1, esfriando: 1, pedemAtencao: 2 });
    expect(sits.filter((s) => passaNoFiltro(s, "pedem_atencao"))).toHaveLength(2);
    expect(sits.filter((s) => passaNoFiltro(s, "esfriando"))).toHaveLength(1);
    expect(sits.filter((s) => passaNoFiltro(s, "todos"))).toHaveLength(4);
    expect(filtroDaUrl("at_risk")).toBe("risco");
    expect(filtroDaUrl("Atenção")).toBe("atencao");
    expect(filtroDaUrl("qualquer")).toBeNull();
  });

  it("tendência de 14 dias: cair é piorar (100 = saudável)", () => {
    expect(tendenciaDaSerie([80, 72, 60])).toEqual({ tendencia: "piorando", delta: -20 });
    expect(tendenciaDaSerie([60, 70])).toEqual({ tendencia: "melhorando", delta: 10 });
    expect(tendenciaDaSerie([70, 72])).toEqual({ tendencia: "estavel", delta: 2 });
    expect(tendenciaDaSerie([70])).toBeNull();
  });

  it("dono, 'meus' e etapa da jornada", () => {
    expect(donoDoCliente({ assigned_social: " ", assigned_traffic: "Julio" })).toBe("Julio");
    expect(ehDaPessoa({ social: "Carlos Augusto", trafego: null }, "carlos augusto")).toBe(true);
    expect(ehDaPessoa({ social: "Thiago", trafego: null }, "Carlos Augusto")).toBe(false);
    const risco = situacaoDaSaude({ nivel: "risco", score: 40, diasQuieto: 1 });
    expect(etapaDaJornada({ status: "good" }, risco)).toBe("risco");
    expect(etapaDaJornada({ status: "good", estadoManual: "renovação" }, risco)).toBe("renovacao");
    expect(etapaDaJornada({ status: "onboarding" }, situacaoDaSaude({ nivel: "sem_dado", score: null, diasQuieto: null }))).toBe("onboarding");
  });
});

describe("a mesma resposta em toda tela", () => {
  it("quem pede atenção aqui é exatamente quem o Início põe no feed de relacionamento", () => {
    const clientes = [
      cliente({ id: "r", current_health_level: "risco", current_health_score: 42 }),
      cliente({ id: "a", current_health_level: "atencao", current_health_score: 66 }),
      cliente({ id: "s", current_health_level: "saudavel", current_health_score: 88 }),
      cliente({ id: "c", current_health_level: "saudavel", current_health_score: 80, last_client_msg_at: diasAtras(10) }),
      cliente({ id: "off", current_health_level: "saudavel", current_health_score: 80, last_client_msg_at: diasAtras(30), agente_ativo: false }),
      cliente({ id: "v", current_health_level: "critical", current_health_score: 50 }), // escala antiga: vale a nota
      cliente({ id: "p", current_health_level: "risco", current_health_score: 30, paused_at: diasAtras(3) }),
    ];
    const d: Dados = { ...DADOS_VAZIOS, clientes, time: TIME };
    const doInicio = new Set(regraRelacionamento(d, montarContexto(d, AGORA)).map((i) => i.cliente!.id));
    const daqui = montarCarteira({ agora: AGORA, clientes, time: TIME, historico: [], recomendacoes: [], jornadas: [], viewer: { nome: "Julio", papel: "manager" } });
    expect(new Set(daqui.linhas.filter((l) => l.pedeAtencao).map((l) => l.id))).toEqual(doInicio);
    expect(doInicio).toEqual(new Set(["r", "a", "c", "v"]));
  });

  it("a Jornada (preparo de reunião) lê o mesmo nível: 14 dias calado é atenção, não risco", () => {
    const base = { attentionLevel: "low", reclamacaoRecente: false };
    expect(riscoConsolidado({ ...base, healthLevel: "saudavel", diasSemFalar: 14 }).nivel).toBe("atencao");
    expect(riscoConsolidado({ ...base, healthLevel: "saudavel", diasSemFalar: 1, reclamacaoRecente: true }))
      .toMatchObject({ nivel: "saudavel", motivos: ["reclamação nos últimos 14 dias"] });
    expect(riscoConsolidado({ ...base, healthLevel: "risco", diasSemFalar: 1, attentionLevel: "critical" }).nivel).toBe("critico");
    expect(riscoConsolidado({ ...base, healthLevel: "saudavel", diasSemFalar: 1, attentionLevel: "critical" }).nivel).toBe("saudavel");
  });

  it("nenhuma tela que diz 'em risco' voltou a ler clients.status = at_risk", () => {
    const telas = [
      "components/Sidebar.tsx", "components/conteudo/QuadroProducao.tsx", "app/ceo/page.tsx",
      "lib/metrics/cockpit.ts", "lib/priority/fontes/index.ts", "lib/hooks/useSnapshots.ts",
      "app/api/system/cs-saude/route.ts", "app/api/system/cs-risco-semanal/route.ts",
    ];
    for (const t of telas) {
      const src = ler(t);
      expect(src, t).not.toMatch(/status\s*===\s*"at_risk"/);
      expect(src, t).toMatch(/lib\/saude\/carteira/);
    }
    // "Em risco" não é mais rótulo de resultado de anúncio (Tráfego diz "Resultados ruins").
    expect(ler("app/traffic/page.tsx")).not.toMatch(/"Em Risco"/);
    expect(ler("lib/traffic/status-resultado.ts")).not.toMatch(/at_risk: "Em risco"/);
    // O "Em Risco" de Clientes filtra pela saúde; o select de anúncio continua existindo, com outro nome.
    const lista = ler("app/clients/page.tsx");
    expect(lista).toMatch(/setSaudeFiltro\(f === "at_risk" \? "risco" : "all"\)/);
    expect(lista).toMatch(/nivelDoCliente\(c\) === saudeFiltro/);
  });

  it("as três telas antigas redirecionam para a Saúde da carteira, na vista equivalente", () => {
    expect(ler("app/churn/page.tsx")).toMatch(/redirect\("\/saude\?nivel=todos&resp=all"\)/);
    expect(ler("app/jornada/page.tsx")).toMatch(/redirect\("\/saude\?view=jornada"\)/);
    expect(ler("app/carteira/page.tsx")).toMatch(/redirect\("\/saude\?view=responsaveis&resp=all"\)/);
  });

  it("a fonte 'saude' do feed e a próxima ação sugerida usam o mesmo texto", () => {
    const fonte = ler("lib/priority/fontes/saude.ts");
    expect(fonte).toMatch(/ACAO_SAUDE\.risco/);
    expect(fonte).toMatch(/ACAO_SAUDE\.atencao/);
    expect(ACAO_SAUDE.risco).toMatch(/^Ligar para o cliente hoje/);
  });
});

describe("montarCarteira", () => {
  const historico = [
    { client_id: "r", score: 70, level: "atencao", breakdown: {}, computed_for_date: "2026-09-12" },
    { client_id: "r", score: 42, level: "risco", computed_for_date: "2026-09-25",
      breakdown: { componentes: { relacionamento: 30, entrega: 80, resultado: null }, motivos: ["Relacionamento em 30"], cobertura: 55 } },
  ];

  it("uma linha por cliente vivo, pior primeiro, com porquê, tendência, componentes e dono canônico", () => {
    const r = montarCarteira({
      agora: AGORA,
      clientes: [
        cliente({ id: "s", assigned_social: "Thiago" }),
        cliente({ id: "r", current_health_level: "risco", current_health_score: 42, assigned_social: "Carlos" }),
        cliente({ id: "x", churned_at: diasAtras(10) }),
        cliente({ id: "t", name: "Loja (teste)" }),
      ],
      time: TIME, historico, recomendacoes: [], jornadas: [], viewer: { nome: "Julio", papel: "manager" },
    });
    expect(r.linhas.map((l) => l.id)).toEqual(["r", "s"]);
    const l = r.linhas[0];
    expect(l).toMatchObject({ nivel: "risco", score: 42, severidade: "critical", tendencia: "piorando", delta: -28, dono: "Carlos Augusto", cobertura: 55 });
    expect(l.motivos).toEqual(["Relacionamento em 30"]);
    expect(l.componentes.map((c) => c.chave)).toEqual(["resultado", "entrega", "relacionamento"]);
    expect(l.proximaAcao).toMatchObject({ estado: "sugerida", texto: ACAO_SAUDE.risco, porque: "Relacionamento em 30" });
    expect(r.distribuicao).toMatchObject({ total: 2, risco: 1, saudavel: 1 });
    expect(r.notaDoDia).toBe("2026-09-25");
    expect(r.donos).toEqual(["Carlos Augusto", "Thiago"]);
  });

  it("a ficha de relacionamento (notas do handoff) só vai para a gestão; o social edita só os dele", () => {
    const entrada = {
      agora: AGORA, time: TIME, historico: [], recomendacoes: [],
      clientes: [cliente({ id: "meu", assigned_social: "Carlos" }), cliente({ id: "outro", assigned_social: "Thiago" })],
      jornadas: [{ client_id: "meu", notas: "handoff: valor fechado" }],
    };
    const gestor = montarCarteira({ ...entrada, viewer: { nome: "Julio", papel: "manager" } });
    expect(gestor.linhas.find((l) => l.id === "meu")!.relacionamento?.notas).toBe("handoff: valor fechado");
    expect(gestor.linhas.every((l) => l.podeEditar)).toBe(true);

    const social = montarCarteira({ ...entrada, viewer: { nome: "Carlos Augusto", papel: "social" } });
    expect(social.linhas.every((l) => l.relacionamento === null)).toBe(true);
    expect(social.linhas.find((l) => l.id === "meu")!.podeEditar).toBe(true);
    expect(social.linhas.find((l) => l.id === "outro")!.podeEditar).toBe(false);
    expect(JSON.stringify(social)).not.toContain("handoff");
  });
});
