// tests/prospeccao-disparo-manual.test.ts — o que a Prospecção grava e manda à mão (auditoria 25/10/2026,
// 14.1 a 14.3). O piloto SDR está DESLIGADO desde 17/10: nada aqui o liga.

import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resumoDaAbordagem, resumoDoRanking, textoConfirmarDisparo, textoConfirmarReuniao } from "@/lib/prospeccao/resumo-disparo";

const RAIZ = path.resolve(__dirname, "..");
const ler = (f: string) => readFileSync(path.join(RAIZ, f), "utf8");

describe("14.1 — 'Disparar próxima' diz o que aconteceu de verdade", () => {
  it("o erro original: piloto desligado aparecia como 'Abordagem: ok'", () => {
    // A rota devolve `pulados[]` (a tela lia `pulado`, que não existe nessa rota).
    const r = resumoDaAbordagem({ abordagens: [], followups: [], retomadas: [], pulados: ["agente desligado (kill-switch)"] });
    expect(r.tom).toBe("aviso");
    expect(r.texto).toMatch(/Nada foi enviado: agente desligado/);
  });

  it("envio que falhou é erro, com o nome do prospect", () => {
    const r = resumoDaAbordagem({ abordagens: [{ nome: "Casa das Tintas", ok: false, erro: "HTTP 400" }], pulados: [] });
    expect(r.tom).toBe("erro");
    expect(r.texto).toMatch(/Casa das Tintas: HTTP 400/);
  });

  it("enviado de verdade: diz para quem", () => {
    expect(resumoDaAbordagem({ abordagens: [{ nome: "Casa das Tintas", ok: true }] })).toEqual({ tom: "sucesso", texto: "Abordagem enviada para Casa das Tintas." });
  });

  it("fila vazia não é 'ok'", () => {
    expect(resumoDaAbordagem({ abordagens: [], pulados: [] }).tom).toBe("aviso");
    expect(resumoDoRanking({ pulado: "piloto não está rodando" }).tom).toBe("aviso");
  });

  it("antes de disparar, pergunta dizendo a quem vai e que não dá para desfazer", () => {
    expect(textoConfirmarDisparo({ nome: "Casa das Tintas", decisor_nome: "Marcos" })).toMatch(/Casa das Tintas \(Marcos\)[\s\S]*não dá para desfazer/);
    const tela = ler("components/prospeccao/FilaConversasAgenda.tsx");
    expect(tela).toContain("window.confirm(textoConfirmarDisparo(");
    expect(tela).not.toContain("const pulado = r.data?.pulado as string | undefined;");
  });
});

describe("14.2 — timeout no envio ao prospect é 'pode ter saído'", () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });

  it("o erro original: timeout contava como 'não foi' e a pessoa reenviava", async () => {
    process.env.EVOLUTION_API_URL = "http://evo";
    process.env.EVOLUTION_API_KEY_NEW = "k";
    process.env.EVOLUTION_INSTANCE_NEW = "i";
    vi.stubGlobal("fetch", async () => { const e = new Error("timeout"); e.name = "TimeoutError"; throw e; });
    const { enviarTexto } = await import("@/lib/prospeccao/envio");
    const r = await enviarTexto("5522999990000@s.whatsapp.net", "Oi");
    expect(r).toMatchObject({ ok: false, incerto: true });
    expect(r.error).toMatch(/pode ter saído/);
  });

  it("recusa clara (4xx) continua 'não saiu' — pode tentar de novo", async () => {
    process.env.EVOLUTION_API_URL = "http://evo";
    process.env.EVOLUTION_API_KEY_NEW = "k";
    process.env.EVOLUTION_INSTANCE_NEW = "i";
    vi.stubGlobal("fetch", async () => new Response("número inválido", { status: 400 }));
    const { enviarTexto } = await import("@/lib/prospeccao/envio");
    expect(await enviarTexto("x@s.whatsapp.net", "Oi")).toMatchObject({ ok: false, incerto: false });
  });

  it("a mensagem manual incerta pausa o agente e avisa; a tela pede confirmação para reenviar", () => {
    const rota = ler("app/api/prospeccao/prospects/[id]/enviar/route.ts");
    expect(rota).toContain("if (r.incerto) return NextResponse.json({ ok: true, incerto: true, aviso: AVISO_INCERTO");
    const ficha = ler("components/prospeccao/FichaProspect.tsx");
    expect(ficha).toContain("incertoTexto === texto && !window.confirm(");
    expect(ficha).toContain("if (!texto.trim() || ocupado) return;");
  });

  it("na automática (piloto desligado), incerto tira da fila e pausa o agente — o tick seguinte não reenvia", () => {
    const abordagem = ler("lib/prospeccao/abordagem.ts");
    expect(abordagem).toContain("} else if (r.incerto) {");
    expect(abordagem).toContain('modo_agente: "pausado"');
  });
});

describe("14.3 — Marcar reunião mostra o convite antes e grava antes do Google", () => {
  it("a prévia diz quem recebe e quando", () => {
    const t = textoConfirmarReuniao({ nome: "Marcos", email: "marcos@loja.com", quandoIso: "2026-10-28T13:00:00Z", tipo: "online" });
    expect(t).toMatch(/Reunião online \(Google Meet\) com Marcos/);
    expect(t).toMatch(/28\/10/);
    expect(t).toMatch(/10:00/);
    expect(t).toMatch(/convite vai AGORA para marcos@loja\.com/);
    expect(textoConfirmarReuniao({ nome: "Marcos", email: null, quandoIso: "2026-10-28T13:00:00Z", tipo: "visita" })).toMatch(/nenhum convite sai/);
  });

  it("meetings é gravado ANTES do evento do Google (o convite só sai com a reunião no banco)", () => {
    const agenda = ler("lib/prospeccao/agenda.ts");
    const corpo = agenda.slice(agenda.indexOf("export async function marcarReuniao"));
    expect(corpo.indexOf('from("meetings").insert(')).toBeGreaterThan(0);
    expect(corpo.indexOf('from("meetings").insert(')).toBeLessThan(corpo.indexOf("criarEvento("));
    expect(corpo).toContain('from("meetings").delete().eq("id", meetingId)');
  });
});
