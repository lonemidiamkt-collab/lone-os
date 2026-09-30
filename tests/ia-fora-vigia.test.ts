import { describe, it, expect } from "vitest";
import { causaDoErro, erroDoResumo, rotuloDaOrigem } from "@/lib/ia/causa-erro";
import { iaFora, type FalhaIa } from "@/lib/ia/saude-ia";
import { textoVigia, avisoDoVigia, type LinhaPainel } from "@/lib/automacoes/saude";

// O caso real de 30/09/2026: o saldo pré-pago da OpenAI zerou em 25/09 às 7h30. Cinco dias sem uma
// chamada de IA dar certo. O grupo administrativo recebeu seis "falhou" com JSON cortado, um por
// rotina, e nada sobre o Loninho — que não é rotina e ficou cego sem aviso.
const SEM_CREDITO = "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.";

const linha = (id: string, nome: string, saude: "falhou" | "parado" = "falhou"): LinhaPainel => ({
  id, nome, saude, agendaBRT: "seg a sex, 7h30",
  ultima: { em: "2026-09-30T10:30:00Z", ok: false, pulado: false, status: 200, duracaoMs: 1000 },
  ultimoSucessoEm: "2026-09-24T10:30:00Z",
} as unknown as LinhaPainel);

const SEIS = [
  linha("creative-atributos", "Atributos dos criativos"),
  linha("creative-vencedores", "Análise dos vencedores"),
  linha("creative-social", "Vencedor vira pauta orgânica"),
  linha("creative-estilo", "Estilo visual dos clientes"),
  linha("radar-inteligencia", "Trend Radar — pautas"),
  linha("cs-briefing-inicial", "Briefing de quem não tem"),
];
// Como o banco guarda hoje: os 300 primeiros caracteres + a linha do erro que o registrar anexa.
const RESUMOS = Object.fromEntries(SEIS.map((l) => [l.id, `{"ok":false,"pendentes":566,"gerados":0,"erros":["1202408…\n⟶ erro: 120240838496030033: ${SEM_CREDITO}`]));

describe("causa conhecida", () => {
  it("reconhece as três formas da mensagem de saldo zerado", () => {
    expect(causaDoErro(SEM_CREDITO)?.chave).toBe("openai-sem-credito");
    expect(causaDoErro('{"error":{"code":"insufficient_quota"}}')?.chave).toBe("openai-sem-credito");
    expect(causaDoErro("You exceeded your current quota, please check your plan")?.chave).toBe("openai-sem-credito");
  });

  it("429 sozinho NÃO é falta de crédito — é limite de velocidade, que passa sozinho", () => {
    expect(causaDoErro("HTTP 429")).toBeNull();
    expect(causaDoErro("Rate limit reached for gpt-4o-mini")).toBeNull();
  });

  it("reconhece chave recusada e token da Meta vencido", () => {
    expect(causaDoErro("Incorrect API key provided: sk-...")?.chave).toBe("openai-chave-invalida");
    expect(causaDoErro('{"error":{"message":"Error validating access token: Session has expired","code":190}}')?.chave).toBe("meta-token-vencido");
  });

  it("o que não conhece devolve null, e ninguém inventa causa", () => {
    expect(causaDoErro("timeout depois de 180 s")).toBeNull();
    expect(causaDoErro(null)).toBeNull();
  });

  it("toda causa conhecida diz o que fazer", () => {
    expect(causaDoErro(SEM_CREDITO)?.acao).toContain("platform.openai.com/settings/organization/billing");
  });
});

describe("erro legível do resumo", () => {
  it("prefere a linha do erro anexada — o JSON do resumo vem cortado", () => {
    expect(erroDoResumo(RESUMOS["creative-atributos"])).toContain("You have no credits remaining");
  });

  it("tira a primeira mensagem de erro de JSON cortado no meio", () => {
    expect(erroDoResumo('{"ok":false,"vencedores":15,"erros":["Maicon minerais: You have no cred'))
      .toBe("Maicon minerais: You have no cred");
    expect(erroDoResumo('{"ok":false,"error":"token expirado"}')).toBe("token expirado");
  });

  it("JSON só de contadores não tem erro pra mostrar; texto solto passa como veio", () => {
    expect(erroDoResumo('{"ok":false,"lidos":0,"aindaSemLeitura":10')).toBeNull();
    expect(erroDoResumo("pulado: desligado na Central")).toBe("pulado: desligado na Central");
  });
});

describe("a IA está fora?", () => {
  const agora = new Date("2026-09-30T14:00:00Z");
  const falha = (origem: string, created_at: string, erro: string | null = SEM_CREDITO): FalhaIa => ({ origem, erro, created_at });

  it("o caso de 25/09: acusa a causa, desde quando e o que parou, o agente primeiro", () => {
    const falhas: FalhaIa[] = [
      falha("cron:creative-atributos", "2026-09-25T10:30:00Z"),
      ...Array.from({ length: 6 }, (_, i) => falha("inbound", `2026-09-2${6 + (i % 3)}T1${i}:00:00Z`)),
      falha("cs:revisao-arte", "2026-09-29T15:00:00Z"),
      falha("cs:transcribe", "2026-09-29T16:00:00Z", "HTTP 429"),
      falha("inbound", "2026-09-30T13:10:00Z"),
    ];
    const r = iaFora(falhas, agora);
    expect(r?.causa.chave).toBe("openai-sem-credito");
    expect(r?.desde).toBe("2026-09-25T10:30:00Z");
    expect(r?.falhas).toBe(10);
    expect(r?.porFrente[0]).toEqual({ rotulo: "Loninho lendo as mensagens dos grupos dos clientes", falhas: 7 });
    // O áudio devolve só "HTTP 429": não decide a causa, mas conta no que parou.
    expect(r?.porFrente.map((f) => f.rotulo)).toContain("transcrição de áudio");
  });

  it("duas falhas podem ser azar; não avisa", () => {
    expect(iaFora([falha("inbound", "2026-09-30T13:00:00Z"), falha("inbound", "2026-09-30T13:30:00Z")], agora)).toBeNull();
  });

  it("falha antiga sem nenhuma recente é história, não problema de agora", () => {
    const velhas = [1, 2, 3, 4].map((h) => falha("inbound", `2026-09-30T0${h}:00:00Z`));
    expect(iaFora(velhas, agora)).toBeNull();
  });

  it("erro 500 e limite de velocidade passam sozinhos: sem causa conhecida, sem aviso", () => {
    const ruido = [1, 2, 3, 4].map((m) => falha("inbound", `2026-09-30T13:1${m}:00Z`, "HTTP 500"));
    expect(iaFora(ruido, agora)).toBeNull();
  });
});

describe("aviso do vigia", () => {
  const ia = iaFora([
    { origem: "inbound", erro: SEM_CREDITO, created_at: "2026-09-25T10:31:00Z" },
    { origem: "inbound", erro: SEM_CREDITO, created_at: "2026-09-29T12:00:00Z" },
    { origem: "cs:revisao-arte", erro: SEM_CREDITO, created_at: "2026-09-30T13:00:00Z" },
  ], new Date("2026-09-30T14:00:00Z"));

  it("seis rotinas com a mesma causa viram UM bloco, com a ação e sem JSON", () => {
    const t = textoVigia(SEIS, RESUMOS, "https://painel/automations", ia);
    expect(t.match(/OpenAI sem crédito/g)?.length).toBe(1);
    expect(t).toContain("platform.openai.com/settings/organization/billing");
    expect(t).toContain("Loninho lendo as mensagens dos grupos dos clientes");
    expect(t).toContain("6 rotinas:");
    for (const l of SEIS) expect(t).toContain(l.nome);
    expect(t).not.toContain('"ok":false');
    expect(t).not.toContain("falhou"); // nenhuma linha "— falhou" solta
  });

  it("causa conhecida e problema desconhecido: dois blocos, título conta os dois", () => {
    const outra = linha("cs-datas", "Radar de datas comemorativas");
    const t = textoVigia([...SEIS, outra], { ...RESUMOS, "cs-datas": '{"ok":false,"error":"timeout depois de 180 s"}' }, undefined, ia);
    expect(t).toContain("*2 problemas nas automações*");
    expect(t).toContain("🔴 *Radar de datas comemorativas* — falhou");
    expect(t).toContain("timeout depois de 180 s");
  });

  it("job parado continua saindo do jeito de antes", () => {
    const t = textoVigia([linha("cs-datas", "Radar de datas", "parado")]);
    expect(t).toContain("🟡 *Radar de datas* — parado");
  });

  const agora = new Date("2026-09-30T14:00:00Z");
  const base = { comProblema: SEIS, resumos: RESUMOS, ia, agora, repetirAposMs: 24 * 3600_000 };

  it("primeira vez: manda tudo e marca as rotinas E a IA", () => {
    const r = avisoDoVigia({ ...base, ultimoAlerta: new Map() });
    expect(r.texto).toContain("OpenAI sem crédito");
    expect(r.marcar).toEqual(expect.arrayContaining([...SEIS.map((l) => l.id), "ia:openai-sem-credito"]));
  });

  it("tudo avisado há menos de 24h: silêncio", () => {
    const recente = "2026-09-30T08:00:00Z";
    const ultimoAlerta = new Map([...SEIS.map((l) => [l.id, recente] as const), ["ia:openai-sem-credito", recente] as const]);
    expect(avisoDoVigia({ ...base, ultimoAlerta })).toEqual({ texto: null, marcar: [] });
  });

  it("uma parte do grupo venceu: o grupo sai INTEIRO, não picado", () => {
    const recente = "2026-09-30T08:00:00Z";
    const ultimoAlerta = new Map([...SEIS.slice(1).map((l) => [l.id, recente] as const), ["ia:openai-sem-credito", recente] as const]);
    const r = avisoDoVigia({ ...base, ultimoAlerta });
    for (const l of SEIS) expect(r.texto).toContain(l.nome);
    expect(r.marcar).toHaveLength(7);
  });

  it("saldo recarregado depois da falha: a rotina não é avisada — o erro de 30/09 às 12h05", () => {
    // As rotinas falharam às 7h30 (l.ultima.em), o saldo voltou às 11h49. Pedir recarga às 12h05
    // era mandar fazer o que já tinha sido feito.
    const r = avisoDoVigia({ ...base, ia: null, ultimoOkIa: "2026-09-30T14:49:00Z", ultimoAlerta: new Map() });
    expect(r).toEqual({ texto: null, marcar: [] });
  });

  it("IA respondeu ANTES da falha da rotina: a causa é de agora, avisa normalmente", () => {
    const r = avisoDoVigia({ ...base, ia: null, ultimoOkIa: "2026-09-30T09:00:00Z", ultimoAlerta: new Map() });
    expect(r.texto).toContain("OpenAI sem crédito");
  });

  it("a volta da IA não esconde problema que não é da OpenAI", () => {
    const outra = linha("cs-datas", "Radar de datas comemorativas");
    const r = avisoDoVigia({
      ...base, comProblema: [...SEIS, outra], ia: null, ultimoOkIa: "2026-09-30T14:49:00Z", ultimoAlerta: new Map(),
      resumos: { ...RESUMOS, "cs-datas": '{"ok":false,"error":"timeout depois de 180 s"}' },
    });
    expect(r.texto).toContain("Radar de datas comemorativas");
    expect(r.texto).not.toContain("OpenAI sem crédito");
    expect(r.marcar).toEqual(["cs-datas"]);
  });

  it("a IA caiu e nenhuma rotina falhou ainda: avisa só da IA — é o caso do Loninho", () => {
    const r = avisoDoVigia({ ...base, comProblema: [], ultimoAlerta: new Map() });
    expect(r.texto).toContain("OpenAI sem crédito");
    expect(r.texto).toContain("Loninho");
    expect(r.marcar).toEqual(["ia:openai-sem-credito"]);
  });
});

describe("rótulo das frentes", () => {
  it("o time lê o nome da coisa, não a origem técnica", () => {
    expect(rotuloDaOrigem("inbound")).toBe("Loninho lendo as mensagens dos grupos dos clientes");
    expect(rotuloDaOrigem("app/.next/server/app/api/ai/morning-briefing/route")).toBe("resumo da manhã");
    expect(rotuloDaOrigem("prospeccao:descoberta")).toBe("SDR (prospecção)");
    expect(rotuloDaOrigem("algo-novo")).toBe("algo-novo");
  });
});
