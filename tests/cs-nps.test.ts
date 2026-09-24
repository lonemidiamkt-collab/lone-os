// tests/cs-nps.test.ts — NPS pós-reunião (Leva 6B, E6): leitura da nota, quem recebe, a resposta
// no grupo e o peso na saúde. Tudo puro (lib/cs/nps.ts) — o banco fica em lib/cs/nps-server.ts.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  lerNota, ehSoANota, textoPergunta, primeiroNome, TEXTO_FOLLOWUP, precisaFollowUp, categoriaNps,
  selecionarEnvios, decidirResposta, componenteSatisfacao, JOB_NPS,
  type ClienteParaNps, type ReuniaoParaNps,
} from "@/lib/cs/nps";
import { calcularSaude } from "@/lib/scores/health";
import { automacaoPorId } from "@/lib/automacoes/registro";

const RAIZ = path.resolve(__dirname, "..");
const agora = new Date("2026-09-24T15:00:00Z");
const hAtras = (h: number) => new Date(agora.getTime() - h * 3600_000).toISOString();

describe("lerNota: só número de 0 a 10, sem adivinhar", () => {
  it.each([
    ["9", 9], ["10", 10], ["0", 0], ["nota 10!", 10], ["10/10", 10], ["8 de 10", 8],
    ["Nota 10, vocês são demais 👏", 10], ["9,5", 9], ["dez", 10], ["nota nove", 9],
    ["  7  ", 7], ["10 10 10", 10], ["Dou 8", 8],
  ])("%s → %s", (texto, nota) => {
    expect(lerNota(texto)).toBe(nota);
  });

  it.each([
    "8 ou 9", "100", "11", "às 10 tá bom?", "dia 10 a gente fala", "10/09", "5 posts por semana",
    "R$ 10", "10h", "nove horas", "manda a arte amanhã", "", "um minuto", "50%",
    "Bom dia! Vou mandar as fotos do produto novo amanhã cedo, pode ser? Aí vocês montam o post.",
  ])("%s → null", (texto) => {
    expect(lerNota(texto)).toBeNull();
  });

  it("só a nota para o fluxo; nota com pedido junto segue", () => {
    expect(ehSoANota("10")).toBe(true);
    expect(ehSoANota("Nota 10, vocês são demais")).toBe(true);
    expect(ehSoANota("10, e faz um post pra sexta da promoção")).toBe(false);
  });
});

describe("textos", () => {
  it("pergunta curta, calorosa, com o primeiro nome do contato", () => {
    const t = textoPergunta("maria clara souza");
    expect(t.startsWith("Oi, Maria!")).toBe(true);
    expect(t).toContain("de 0 a 10");
    expect(t).toContain("Lone Mídia");
    expect(textoPergunta(null).startsWith("Oi, pessoal!")).toBe(true);
    expect(primeiroNome("  ")).toBe("pessoal");
  });

  it("follow-up só até 8, e é o 'o que faria virar 10'", () => {
    expect(precisaFollowUp(8)).toBe(true);
    expect(precisaFollowUp(9)).toBe(false);
    expect(TEXTO_FOLLOWUP).toContain("o que faria essa nota virar 10?");
  });

  it("régua clássica", () => {
    expect(categoriaNps(10)).toBe("promotor");
    expect(categoriaNps(7)).toBe("neutro");
    expect(categoriaNps(6)).toBe("detrator");
  });
});

describe("selecionarEnvios: quem recebe a pergunta", () => {
  const cli = (o: Partial<ClienteParaNps> = {}): ClienteParaNps => ({
    id: "c1", nome: "Padaria", contato: "João", groupJid: "123@g.us", agenteAtivo: true, podeReceber: true, ...o,
  });
  const reu = (o: Partial<ReuniaoParaNps> = {}): ReuniaoParaNps => ({
    id: "r1", clientId: "c1", estado: "realizada", realizadaEm: hAtras(2), tipo: "mensal", ...o,
  });
  const rodar = (reunioes: ReuniaoParaNps[], clientes: ClienteParaNps[] = [cli()], anteriores = [] as { clientId: string; meetingId: string | null; perguntadoEm: string }[]) =>
    selecionarEnvios({ reunioes, clientes: new Map(clientes.map((c) => [c.id, c])), anteriores, agora });

  it("reunião realizada há 2h entra, com o texto exato", () => {
    const r = rodar([reu()]);
    expect(r.envios).toHaveLength(1);
    expect(r.envios[0].texto).toBe(textoPergunta("João"));
    expect(r.envios[0].groupJid).toBe("123@g.us");
  });

  it("espera 30 min, ignora reunião velha (72h+), agendada e de prospecção", () => {
    expect(rodar([reu({ realizadaEm: hAtras(0.2) })]).envios).toHaveLength(0);
    expect(rodar([reu({ realizadaEm: hAtras(80) })]).envios).toHaveLength(0);
    expect(rodar([reu({ estado: "agendada" })]).envios).toHaveLength(0);
    expect(rodar([reu({ tipo: "comercial_online" })]).envios).toHaveLength(0);
    expect(rodar([reu({ deletedAt: hAtras(1) })]).envios).toHaveLength(0);
  });

  it("nunca duas vezes pela mesma reunião, nem duas no mesmo mês pro mesmo cliente", () => {
    expect(rodar([reu()], [cli()], [{ clientId: "c1", meetingId: "r1", perguntadoEm: hAtras(1) }]).envios).toHaveLength(0);
    expect(rodar([reu()], [cli()], [{ clientId: "c1", meetingId: "outra", perguntadoEm: hAtras(24 * 10) }]).envios).toHaveLength(0);
    expect(rodar([reu()], [cli()], [{ clientId: "c1", meetingId: "outra", perguntadoEm: hAtras(24 * 30) }]).envios).toHaveLength(1);
    const duas = rodar([reu({ id: "a", realizadaEm: hAtras(5) }), reu({ id: "b", realizadaEm: hAtras(1) })]);
    expect(duas.envios.map((e) => e.meetingId)).toEqual(["b"]);
  });

  it("pausado, agente desligado ou sem grupo: fica de fora com o motivo (o ensaio mostra)", () => {
    expect(rodar([reu()], [cli({ podeReceber: false })]).ignorados[0].motivo).toMatch(/pausado/);
    expect(rodar([reu()], [cli({ agenteAtivo: false })]).ignorados[0].motivo).toMatch(/Agente/);
    expect(rodar([reu()], [cli({ groupJid: null })]).ignorados[0].motivo).toMatch(/grupo/);
  });
});

describe("decidirResposta: o que o inbound faz com a mensagem do cliente", () => {
  const pend = (o = {}) => ({
    status: "aguardando" as const, perguntadoEm: hAtras(1), motivoPerguntadoEm: null, messageId: "m1", motivoMessageId: null, ...o,
  });

  it("nota dentro do prazo → grava; até 8 pede o motivo", () => {
    expect(decidirResposta({ pendente: pend(), texto: "7", agora })).toEqual({ tipo: "nota", nota: 7, followUp: true, soANota: true });
    expect(decidirResposta({ pendente: pend(), texto: "10", agora })).toMatchObject({ tipo: "nota", nota: 10, followUp: false });
  });

  it("texto que não é nota, prazo vencido ou citação de outra mensagem → ignora", () => {
    expect(decidirResposta({ pendente: pend(), texto: "manda a arte", agora }).tipo).toBe("ignorar");
    expect(decidirResposta({ pendente: pend({ perguntadoEm: hAtras(80) }), texto: "9", agora }).tipo).toBe("ignorar");
    expect(decidirResposta({ pendente: pend(), texto: "9", citadaId: "outra", agora }).tipo).toBe("ignorar");
    expect(decidirResposta({ pendente: pend(), texto: "9", citadaId: "m1", agora }).tipo).toBe("nota");
  });

  it("aguardando o motivo: texto de verdade vira motivo; 'ok' não", () => {
    const p = pend({ status: "aguardando_motivo", motivoPerguntadoEm: hAtras(1), motivoMessageId: "m2" });
    expect(decidirResposta({ pendente: p, texto: "Se as artes saíssem mais rápido", agora }))
      .toEqual({ tipo: "motivo", texto: "Se as artes saíssem mais rápido" });
    expect(decidirResposta({ pendente: p, texto: "ok", agora }).tipo).toBe("ignorar");
    expect(decidirResposta({ pendente: { ...p, motivoPerguntadoEm: hAtras(60) }, texto: "Mais vídeo", agora }).tipo).toBe("ignorar");
  });
});

describe("saúde: satisfação é opcional e pesa pouco", () => {
  it("última nota dos últimos 120 dias × 10; mais velha não conta", () => {
    expect(componenteSatisfacao([{ nota: 6, respondidoEm: hAtras(24 * 40) }, { nota: 9, respondidoEm: hAtras(24) }], agora)).toBe(90);
    expect(componenteSatisfacao([{ nota: 9, respondidoEm: hAtras(24 * 130) }], agora)).toBeNull();
    expect(componenteSatisfacao([], agora)).toBeNull();
  });

  it("sem NPS, a nota e a cobertura não mudam; com NPS 0, cai ~13 pontos no máximo", () => {
    const base = { entrega: 80, relacionamento: 80, sentimento: 80, pendencias: 80, engajamento: 80 };
    const sem = calcularSaude({ clientId: "1", cliente: "X", componentes: base });
    const semNps = calcularSaude({ clientId: "1", cliente: "X", componentes: { ...base, satisfacao: null } });
    expect(semNps.score).toBe(sem.score);
    expect(semNps.cobertura).toBe(sem.cobertura);
    const zero = calcularSaude({ clientId: "1", cliente: "X", componentes: { ...base, satisfacao: 0 } });
    expect(zero.cobertura).toBe(sem.cobertura);
    expect((sem.score as number) - (zero.score as number)).toBeLessThanOrEqual(11);
    expect(zero.motivos.join(" ")).toMatch(/Satisfação \(NPS\) em 0/);
  });

  it("só o NPS medido não vira nota (cobertura continua 0)", () => {
    const s = calcularSaude({ clientId: "1", cliente: "X", componentes: { satisfacao: 100 } });
    expect(s.score).toBeNull();
    expect(s.nivel).toBe("sem_dado");
  });
});

describe("trava: fala com cliente, nasce desligado", () => {
  it("registrado na Central como envio a cliente, com ensaio ?dry=1", () => {
    const a = automacaoPorId(JOB_NPS);
    expect(a?.enviaParaCliente).toBe(true);
    expect(a?.ensaio).toBe("dry=1");
  });

  it("a migration grava o job desligado, e a rota exige o job ligado de propósito", () => {
    const mig = readFileSync(path.join(RAIZ, "supabase/migrations/20260924213000_cs_nps_pesquisas.sql"), "utf8");
    expect(mig).toMatch(/values \('cs-nps', false/);
    expect(mig).toMatch(/enable row level security/);
    expect(mig.trim().endsWith("notify pgrst, 'reload schema';")).toBe(true);
    const srv = readFileSync(path.join(RAIZ, "lib/cs/nps-server.ts"), "utf8");
    expect(srv).toMatch(/if \(!c\) return \{ ligado: false/);
    expect(srv).toMatch(/c\.enabled !== true/);
    const rota = readFileSync(path.join(RAIZ, "app/api/system/cs-nps/route.ts"), "utf8");
    expect(rota).toMatch(/if \(!trava\.ligado\)/);
  });
});
