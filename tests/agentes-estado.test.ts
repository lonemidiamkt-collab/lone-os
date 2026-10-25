// tests/agentes-estado.test.ts — a regra que diz se cada agente está funcionando, e o interruptor do Loninho.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { agentePorId, type Agente } from "@/lib/agentes/catalogo";
import {
  USO_VAZIO, avaliarAgente, estadoDoInterruptor, type Ambiente, type RotinaDoAgente, type UsoAgente,
} from "@/lib/agentes/estado";

let linhaLoninho: unknown = null;
let erroLoninho: { message: string } | null = null;
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: linhaLoninho, error: erroLoninho }) }) }) }),
  },
}));
const { interpretarLinha, loninhoPodeLer } = await import("@/lib/agentes/loninho-server");

const agora = new Date("2026-10-26T15:00:00Z");
const horasAtras = (h: number) => new Date(agora.getTime() - h * 3600_000).toISOString();
const ag = (id: string) => agentePorId(id) as Agente;

const rotina = (id: string, extra: Partial<RotinaDoAgente> = {}): RotinaDoAgente => ({
  id, nome: id, agendaBRT: "seg a sex, 7h30", saude: "ok", ligada: true, pausadaAte: null,
  ultimaEm: horasAtras(8), ultimoSucessoEm: horasAtras(8), erros7d: 0, maxSilencioHoras: 74, ...extra,
});

function ambiente(over: Partial<Ambiente> = {}): Ambiente {
  return {
    loninho: { ligado: true, pausadoAte: null, alteradoPor: null, alteradoEm: null },
    rotinas: {}, env: {}, ajustes: {}, ...over,
  };
}

const avaliar = (a: Agente, uso: Partial<UsoAgente>, amb: Ambiente, rotinas: RotinaDoAgente[] = []) =>
  avaliarAgente(a, { ...USO_VAZIO, ...uso }, a.interruptores.map((i) => estadoDoInterruptor(i, amb)), rotinas, agora);

describe("estado de cada agente", () => {
  it("funcionando: chamou a IA há pouco e deu certo", () => {
    const r = avaliar(ag("classificador"), { chamadas7d: 120, ultimaIa: { em: horasAtras(1), ok: true } }, ambiente());
    expect(r.estado).toBe("funcionando");
    expect(r.ultimaFonte).toBe("ia");
    expect(r.motivo).toBe("");
  });

  it("falhando: a última chamada falhou — e a causa conhecida vira frase", () => {
    const r = avaliar(ag("classificador"), {
      ultimaIa: { em: horasAtras(1), ok: false },
      ultimaFalhaIa: { em: horasAtras(1), erro: "You exceeded your current quota (insufficient_quota)" },
      falhasIa7d: 12,
    }, ambiente());
    expect(r.estado).toBe("falhando");
    expect(r.motivo).toContain("OpenAI sem crédito");
    expect(r.falhas7d).toBe(12);
  });

  it("falha solta na semana, com sucesso depois: continua funcionando e diz quantas", () => {
    const r = avaliar(ag("termometro"), { ultimaIa: { em: horasAtras(2), ok: true }, falhasIa7d: 2 }, ambiente());
    expect(r.estado).toBe("funcionando");
    expect(r.motivo).toContain("2 falhas nos últimos 7 dias");
  });

  it("parado: o que roda a cada mensagem passou de 72 h sem rodar", () => {
    const r = avaliar(ag("classificador"), { ultimaIa: { em: horasAtras(80), ok: true } }, ambiente());
    expect(r.estado).toBe("parado");
  });

  it("agente de botão sem uso não é 'parado': é 'sem registro'", () => {
    expect(avaliar(ag("diagnostico-comercial"), {}, ambiente()).estado).toBe("sem-registro");
    expect(avaliar(ag("diagnostico-comercial"), { ultimaIa: { em: horasAtras(24 * 40), ok: true } }, ambiente()).estado).toBe("funcionando");
  });

  it("Loninho desligado: quem só roda pelo webhook fica desligado, com quem e até quando", () => {
    const amb = ambiente({ loninho: { ligado: false, pausadoAte: horasAtras(-2), alteradoPor: "roberto@lone", alteradoEm: horasAtras(1) } });
    const r = avaliar(ag("classificador"), { ultimaIa: { em: horasAtras(1), ok: true } }, amb);
    expect(r.estado).toBe("desligado");
    expect(r.motivo).toMatch(/^Pausado por roberto@lone/);
  });

  it("Loninho desligado não desliga o que também roda por agenda: avisa que parte está desligada", () => {
    const amb = ambiente({
      loninho: { ligado: false, pausadoAte: null, alteradoPor: null, alteradoEm: null },
      rotinas: { "cs-roteiro-semanal": rotina("cs-roteiro-semanal") },
    });
    const r = avaliar(ag("roteiros"), { ultimaIa: { em: horasAtras(30), ok: true } }, amb, [rotina("cs-roteiro-semanal")]);
    expect(r.estado).toBe("funcionando");
    expect(r.motivo).toContain("parte dele está desligada");
  });

  it("rotina desligada na Central de Automações desliga o agente que só roda por ela", () => {
    const desligada = rotina("creative-atributos", { ligada: false, saude: "desligado" });
    const r = avaliar(ag("atributos-criativos"), { ultimaIa: { em: horasAtras(30), ok: true } }, ambiente({ rotinas: { "creative-atributos": desligada } }), [desligada]);
    expect(r.estado).toBe("desligado");
  });

  it("rotina que falhou na última vez deixa o agente 'falhando', mesmo sem chamada de IA", () => {
    const falhou = rotina("cs-releitura", { saude: "falhou", erros7d: 1, ultimaEm: horasAtras(3) });
    const r = avaliar(ag("releitura-ciclo"), { ultimaIa: { em: horasAtras(24 * 8), ok: true } }, ambiente({ rotinas: { "cs-releitura": falhou } }), [falhou]);
    expect(r.estado).toBe("falhando");
    expect(r.ultimaFonte).toBe("rotina");
  });

  it("desligado de propósito (SDR): desligado com o motivo da variável", () => {
    const r = avaliar(ag("sdr-rafaela"), {}, ambiente({ env: { PROSPECCAO_SDR: undefined } }));
    expect(r.estado).toBe("desligado");
    expect(r.motivo).toMatch(/^Desligada\./);
  });

  it("mensagem de quarta e sexta: 'revisao' conta como ligada; 'off' desliga a IA", () => {
    const a = ag("mensagem-quarta-sexta");
    const rs = { "client-messages-wed": rotina("client-messages-wed"), "client-messages-fri": rotina("client-messages-fri") };
    const comIa = avaliar(a, { ultimaIa: { em: horasAtras(30), ok: true } }, ambiente({ rotinas: rs, ajustes: { cs_msg_ia_enabled: "revisao" } }), Object.values(rs));
    expect(comIa.estado).toBe("funcionando");
    const semIa = avaliar(a, {}, ambiente({ rotinas: rs, ajustes: { cs_msg_ia_enabled: "off" } }), Object.values(rs));
    expect(semIa.estado).toBe("desligado");
  });

  it("variável do servidor em lista: mostra quantos, nunca o valor", () => {
    const i = estadoDoInterruptor(ag("classificador").interruptores[1], ambiente({ env: { CS_PILOT_GROUP_JIDS: "120363@g.us,555@g.us" } }));
    expect(i.detalhe).toMatch(/^2 na lista/);
    expect(i.detalhe).not.toContain("@g.us");
  });
});

describe("interruptor geral do Loninho", () => {
  it("sem linha = ligado; desligado; pausado até o futuro; pausa vencida = ligado", () => {
    expect(interpretarLinha(null, agora).ligado).toBe(true);
    expect(interpretarLinha({ enabled: false, paused_until: null, updated_by: "x", updated_at: null }, agora).ligado).toBe(false);
    const pausa = interpretarLinha({ enabled: true, paused_until: horasAtras(-1), updated_by: "x", updated_at: null }, agora);
    expect(pausa).toMatchObject({ ligado: false, pausadoAte: horasAtras(-1) });
    expect(interpretarLinha({ enabled: true, paused_until: horasAtras(1), updated_by: "x", updated_at: null }, agora).ligado).toBe(true);
  });

  it("desligado: o webhook não lê; banco fora: segue lendo (desligar é decisão de pessoa)", async () => {
    linhaLoninho = { enabled: false, paused_until: null, updated_by: "x", updated_at: null };
    erroLoninho = null;
    expect(await loninhoPodeLer(agora)).toEqual({ ler: false, motivo: "Loninho desligado na Central de Agentes" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    erroLoninho = { message: "conexão recusada" };
    expect(await loninhoPodeLer(agora)).toEqual({ ler: true });
    log.mockRestore();
  });

  it("o webhook confere o interruptor antes de reclamar a mensagem e antes de qualquer IA", () => {
    const inbound = readFileSync(path.resolve(__dirname, "../app/api/cs/inbound/route.ts"), "utf8");
    const portao = inbound.indexOf("await loninhoPodeLer()");
    expect(portao).toBeGreaterThan(0);
    expect(portao).toBeLessThan(inbound.indexOf(`.from("cs_processed_messages")`));
    expect(portao).toBeLessThan(inbound.indexOf("tratarGrupoVendas(msg"));
    expect(portao).toBeLessThan(inbound.indexOf("ouvirAudio("));
  });
});
