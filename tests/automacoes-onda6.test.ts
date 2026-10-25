// @vitest-environment node
// tests/automacoes-onda6.test.ts — Central de Automações, 25/10/2026 (auditoria 10.2, 10.3, 10.5, 10.6). Dados INVENTADOS.
//
// O QUE ACONTECIA:
//  10.2 — "Rodar agora" dizia "X rodou." quando a rota tinha pulado (trava interna desligada, rodada já feita), e a
//         Central mostrava "Funcionando" com a trava segurando tudo.
//  10.3 — sem trava: o 2º clique, outro gestor ou o cron disparavam de novo e mandavam o PDF de novo ao grupo.
//  10.5 — erro de banco no portão do cron devolvia rodar:true — job de cliente desligado saía se o banco piscasse.
//  10.6 — qualquer erro ao abrir a Central virava "aplique a migração 20260924100000".

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { naoExecutou, fraseDoErroDaCentral, ErroDaCentral, MIGRACAO_PENDENTE } from "@/lib/automacoes/execucao";

describe("10.2 — a rota pulou?", () => {
  it("lê executado/motivo do primeiro nível, inteiro ou truncado (o cron guarda só 300 caracteres)", () => {
    const corpo = '{"ok":true,"executado":false,"motivo":"envio aos clientes desligado (traffic_client_msgs_enabled = false)","status":"disabled"}';
    expect(naoExecutou(corpo)).toEqual({ motivo: "envio aos clientes desligado (traffic_client_msgs_enabled = false)", esperado: false });
    expect(naoExecutou(corpo.slice(0, 110))).toEqual({ motivo: "envio aos clientes desligado (traffic_client_msgs_enabled = false)", esperado: false });
  });
  it("pulo esperado pela agenda é marcado como tal", () => {
    expect(naoExecutou('{"ok":true,"executado":false,"esperado":true,"motivo":"hoje não é o dia de envio — o deste mês é o dia 20"}'))
      .toEqual({ motivo: "hoje não é o dia de envio — o deste mês é o dia 20", esperado: true });
  });
  it("executou (ou não disse), e `executado` aninhado não conta", () => {
    expect(naoExecutou('{"ok":true,"enviados":3}')).toBeNull();
    expect(naoExecutou('{"ok":true,"detalhe":{"executado":false}}')).toBeNull();
    expect(naoExecutou("")).toBeNull();
  });
});

describe("10.6 — erro ao abrir a Central", () => {
  it("a frase da migração só quando a tabela/função falta de verdade", () => {
    expect(fraseDoErroDaCentral(new ErroDaCentral('relation "automation_runs" does not exist', "42P01"))).toBe(MIGRACAO_PENDENTE);
    expect(fraseDoErroDaCentral(new ErroDaCentral("Could not find the function public.automation_resumo", "PGRST202"))).toBe(MIGRACAO_PENDENTE);
  });
  it("o erro original: timeout virava 'aplique a migração' — agora diz o que houve", () => {
    const f = fraseDoErroDaCentral(new ErroDaCentral("canceling statement due to statement timeout", "57014"));
    expect(f).not.toBe(MIGRACAO_PENDENTE);
    expect(f).toMatch(/Não consegui carregar a Central de Automações \(canceling statement due to statement timeout\)/);
  });
});

// ─── Rotas ────────────────────────────────────────────────────────────────────

const trava = vi.hoisted(() => ({ conseguiu: true, motivo: undefined as string | undefined, liberados: [] as string[] }));
vi.mock("@/lib/automacoes/trava-execucao", () => ({
  reservarExecucao: async () => ({ conseguiu: trava.conseguiu, motivo: trava.motivo }),
  liberarExecucao: async (job: string) => { trava.liberados.push(job); },
  execucoesEmAndamento: async () => ({}),
}));
const gravadas = vi.hoisted(() => ({ lista: [] as Record<string, unknown>[] }));
const config = vi.hoisted(() => ({ falhar: false, rodar: true as boolean, motivo: undefined as string | undefined }));
vi.mock("@/lib/automacoes/painel", () => ({
  gravarExecucao: async (e: Record<string, unknown>) => { gravadas.lista.push(e); },
  podeRodarJob: async () => { if (config.falhar) throw new Error("timeout"); return { rodar: config.rodar, motivo: config.motivo }; },
}));
vi.mock("@/lib/api/require-role", () => ({ GESTAO: ["admin"], requireRole: async () => ({ user: { id: "u1", email: "roberto@lone" } }) }));
vi.mock("@/lib/api/cron-guard", () => ({ requireCron: () => null }));

const rodar = await import("@/app/api/system/automacoes/rodar/route");
const registrar = await import("@/app/api/system/automacoes/registrar/route");
const podeRodar = await import("@/app/api/system/automacoes/pode-rodar/route");

let respostaDoJob = '{"ok":true}';
beforeEach(() => {
  trava.conseguiu = true; trava.motivo = undefined; trava.liberados.length = 0;
  gravadas.lista.length = 0;
  config.falhar = false; config.rodar = true; config.motivo = undefined;
  respostaDoJob = '{"ok":true}';
  process.env.CRON_SECRET = "segredo";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(respostaDoJob, { status: 200 })));
});

const pedirRodar = async (corpo: Record<string, unknown>) => {
  const r = await rodar.POST(new NextRequest("http://x/api/system/automacoes/rodar", { method: "POST", body: JSON.stringify(corpo) }));
  return { status: r.status, corpo: await r.json() };
};

describe("Rodar agora", () => {
  it("10.2 — o erro original: a rota pulou e a tela dizia 'rodou' — agora volta executado:false com o motivo", async () => {
    respostaDoJob = '{"ok":true,"executado":false,"motivo":"envio aos clientes desligado (traffic_client_msgs_enabled = false)","status":"disabled"}';
    const r = await pedirRodar({ job: "client-messages-monday", confirmado: true });
    expect(r.corpo).toMatchObject({ executado: false, motivo: "envio aos clientes desligado (traffic_client_msgs_enabled = false)" });
    expect(gravadas.lista[0]).toMatchObject({ skipped: true, ok: null });
    expect(String(gravadas.lista[0].resumo)).toMatch(/^\[manual por roberto@lone\] pulado: envio aos clientes desligado/);
  });

  it("10.3 — já rodando (cron, outro gestor ou o clique anterior): 409 e não chama a rota", async () => {
    trava.conseguiu = false; trava.motivo = "outra execução começou há 2 min e ainda está rodando";
    const r = await pedirRodar({ job: "traffic-diagnostico" });
    expect(r.status).toBe(409);
    expect(r.corpo.error).toMatch(/já está rodando \(outra execução começou há 2 min/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("10.3 — terminou: solta a trava; ensaio não disputa a vez", async () => {
    await pedirRodar({ job: "traffic-diagnostico" });
    expect(trava.liberados).toEqual(["traffic-diagnostico"]);
    trava.conseguiu = false;
    const ensaio = await pedirRodar({ job: "traffic-diagnostico", ensaio: true });
    expect(ensaio.status).toBe(200);
  });
});

describe("registro do cron", () => {
  const reg = async (corpo: Record<string, unknown>) =>
    registrar.POST(new NextRequest("http://x/api/system/automacoes/registrar", { method: "POST", body: JSON.stringify(corpo) }));

  it("10.2 — rota que pulou pela trava interna é registrada como PULADA, com o motivo (antes: ok)", async () => {
    await reg({ job: "client-messages-monday", http_status: 200, resumo: '{"ok":true,"executado":false,"motivo":"envio aos clientes desligado (traffic_client_msgs_enabled = false)"', corpo_ok: true });
    expect(gravadas.lista[0]).toMatchObject({ skipped: true, ok: null });
    expect(String(gravadas.lista[0].resumo)).toMatch(/^pulado: envio aos clientes desligado/);
  });
  it("pulo esperado pela agenda (fora do dia do calendário) segue como rodada normal", async () => {
    await reg({ job: "monthly-calendar", http_status: 200, resumo: '{"ok":true,"executado":false,"esperado":true,"motivo":"hoje não é o dia"}', corpo_ok: true });
    expect(gravadas.lista[0]).toMatchObject({ skipped: false, ok: true });
  });
  it("10.3 — fim de execução solta a reserva; pulo do portão não solta (a reserva é de quem está rodando)", async () => {
    await reg({ job: "cs-relatorio", http_status: 200, resumo: '{"ok":true}' });
    expect(trava.liberados).toEqual(["cs-relatorio"]);
    await reg({ job: "cs-relatorio", skipped: true, resumo: "pulado: já está rodando" });
    expect(trava.liberados).toEqual(["cs-relatorio"]);
  });
});

describe("portão do cron (pode-rodar)", () => {
  const perguntar = async (job: string) => (await podeRodar.GET(new NextRequest(`http://x/api/system/automacoes/pode-rodar?job=${job}`))).json();

  it("10.5 — o erro original: banco fora = rodar:true; agora 'indisponível' e o cron-call.sh usa o último estado", async () => {
    config.falhar = true;
    const r = await perguntar("client-messages-monday");
    expect(r).toMatchObject({ rodar: null, indisponivel: true, ligado: null, cliente: true });
  });
  it("desligado: rodar:false, ligado:false (é o estado que o cron-call.sh guarda)", async () => {
    config.rodar = false; config.motivo = "desligado na Central de Automações";
    expect(await perguntar("client-messages-monday")).toMatchObject({ rodar: false, ligado: false, motivo: "desligado na Central de Automações" });
  });
  it("10.3 — ligado mas já rodando: pula com o motivo (e continua 'ligado')", async () => {
    trava.conseguiu = false; trava.motivo = "outra execução começou há 5 min e ainda está rodando";
    expect(await perguntar("traffic-diagnostico")).toMatchObject({ rodar: false, ligado: true, motivo: expect.stringMatching(/^já está rodando/) });
  });
  it("ligado e livre: roda", async () => {
    expect(await perguntar("traffic-diagnostico")).toMatchObject({ rodar: true, ligado: true });
  });
});
