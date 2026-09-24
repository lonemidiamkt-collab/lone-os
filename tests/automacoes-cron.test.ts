// tests/automacoes-cron.test.ts — próxima execução de um cron de 5 campos (UTC) e a regra de saúde
// da Central de Automações.

import { describe, it, expect } from "vitest";
import { proximaExecucao, proximaDeVarias, AUTOMACOES, type Automacao } from "@/lib/automacoes/registro";
import { calcularSaude, montarLinhas, okDaResposta, okNoTopo, podeRodar, textoVigia, type ResumoJob, type ConfigJob } from "@/lib/automacoes/saude";

const iso = (d: Date) => d.toISOString();
const px = (cron: string, agora: string) => iso(proximaExecucao(cron, new Date(agora)));

describe("proximaExecucao", () => {
  it("passo de minutos, sempre ESTRITAMENTE depois de agora", () => {
    expect(px("*/15 * * * *", "2026-09-23T10:07:30Z")).toBe("2026-09-23T10:15:00.000Z");
    expect(px("*/15 * * * *", "2026-09-23T10:15:00Z")).toBe("2026-09-23T10:30:00.000Z");
  });

  it("dias úteis: sexta à tarde → segunda", () => {
    expect(px("0 11 * * 1-5", "2026-09-25T12:00:00Z")).toBe("2026-09-28T11:00:00.000Z");
  });

  it("lista de dias do mês pula para o mês seguinte", () => {
    expect(px("0 14 20,21,22 * *", "2026-09-22T15:00:00Z")).toBe("2026-10-20T14:00:00.000Z");
  });

  it("faixa com passo de horas", () => {
    expect(px("0 11-23/2 * * *", "2026-09-23T12:30:00Z")).toBe("2026-09-23T13:00:00.000Z");
    expect(px("0 11-23/2 * * *", "2026-09-23T23:30:00Z")).toBe("2026-09-24T11:00:00.000Z");
  });

  it("lista de minutos esgotada no dia útil → próximo dia útil", () => {
    expect(px("0,15,30 11 * * 1-5", "2026-09-28T11:31:00Z")).toBe("2026-09-29T11:00:00.000Z");
  });

  it("mensal atravessa o ano", () => {
    expect(px("0 7 1 * *", "2026-12-15T00:00:00Z")).toBe("2027-01-01T07:00:00.000Z");
  });

  it("dia do mês E dia da semana restritos = basta um bater (regra do cron)", () => {
    // Dia 13 OU sexta: a primeira depois de 01/09 (terça) é a sexta 04/09.
    expect(px("0 0 13 * 5", "2026-09-01T00:00:00Z")).toBe("2026-09-04T00:00:00.000Z");
  });

  it("7 também é domingo", () => {
    expect(px("0 3 * * 7", "2026-09-26T12:00:00Z")).toBe("2026-09-27T03:00:00.000Z");
  });

  it("várias linhas do mesmo job: a mais próxima", () => {
    expect(iso(proximaDeVarias(["0 13 * * *", "0 12 * * *"], new Date("2026-09-23T12:30:00Z")))).toBe("2026-09-23T13:00:00.000Z");
  });

  it("cron inválido não passa calado", () => {
    expect(() => proximaExecucao("61 * * * *")).toThrow();
    expect(() => proximaExecucao("* * *")).toThrow();
    expect(() => proximaExecucao("0 25 * * *")).toThrow();
  });
});

describe("corpo da resposta", () => {
  it("só o ok do TOPO conta", () => {
    expect(okNoTopo('{"ok":false}')).toBe(false);
    expect(okNoTopo('{"ok":true,"detalhe":[{"ok":false}]}')).toBe(true);
    expect(okNoTopo('{"detalhe":[{"ok":false}]}')).toBe(null);
  });

  it("lê o começo truncado que o cron-call.sh manda", () => {
    expect(okNoTopo('{"ok":false,"erro":"grupo não config')).toBe(false);
    expect(okNoTopo('{"a":{"ok":false},"b":"x')).toBe(null);
    expect(okNoTopo('{"texto":"\\"ok\\": false","ok":true,"x":"trunc')).toBe(true);
    expect(okNoTopo("<html>502 Bad Gateway</html>")).toBe(null);
  });

  it("sucesso = 2xx e corpo sem ok:false", () => {
    expect(okDaResposta(200, '{"ok":true}')).toBe(true);
    expect(okDaResposta(200, "")).toBe(true);
    expect(okDaResposta(200, '{"ok":false}')).toBe(false);
    expect(okDaResposta(500, '{"ok":true}')).toBe(false);
    expect(okDaResposta(0, "")).toBe(false);
    // O shell leu o corpo inteiro: vale mais que o começo truncado.
    expect(okDaResposta(200, '{"ok":fal', true)).toBe(true);
  });
});

describe("saúde", () => {
  const agora = new Date("2026-09-23T15:00:00Z");
  const diario = AUTOMACOES.find((a) => a.id === "check-meta-token") as Automacao; // 26h
  const script = AUTOMACOES.find((a) => a.id === "backup-postgres") as Automacao;
  const hAtras = (h: number) => new Date(agora.getTime() - h * 3600_000).toISOString();
  const resumo = (p: Partial<ResumoJob>): ResumoJob => ({
    job: diario.id, ultima_em: hAtras(1), ultima_ok: true, ultima_skipped: false, ultima_status: 200,
    ultima_duracao_ms: 900, ultima_real_ok: true, ultimo_sucesso_em: hAtras(1), ok_7d: 7, erro_7d: 0, pulado_7d: 0, ...p,
  });
  const cfg = (p: Partial<ConfigJob>): ConfigJob => ({
    job: diario.id, enabled: true, paused_until: null, updated_by: "roberto@x", updated_at: hAtras(1), ultimo_alerta_em: null, ...p,
  });
  const inicioAntigo = hAtras(24 * 30);

  it("funcionando", () => {
    expect(calcularSaude(diario, resumo({}), null, agora, inicioAntigo)).toBe("ok");
  });

  it("falhou quando a última execução de verdade deu erro", () => {
    expect(calcularSaude(diario, resumo({ ultima_real_ok: false }), null, agora, inicioAntigo)).toBe("falhou");
  });

  it("parado quando passa do prazo sem sucesso", () => {
    expect(calcularSaude(diario, resumo({ ultimo_sucesso_em: hAtras(30) }), null, agora, inicioAntigo)).toBe("parado");
    expect(calcularSaude(diario, null, null, agora, inicioAntigo)).toBe("parado");
  });

  it("Central recém-instalada não acusa tudo de parado", () => {
    expect(calcularSaude(diario, null, null, agora, hAtras(2))).toBe("ok");
    expect(calcularSaude(diario, null, null, agora, null)).toBe("ok");
  });

  it("religado há pouco não vira parado na hora", () => {
    const religado = cfg({ paused_until: hAtras(1) });
    expect(calcularSaude(diario, resumo({ ultimo_sucesso_em: hAtras(24 * 10) }), religado, agora, inicioAntigo)).toBe("ok");
  });

  it("desligado e pausado", () => {
    expect(calcularSaude(diario, resumo({ ultima_real_ok: false }), cfg({ enabled: false }), agora, inicioAntigo)).toBe("desligado");
    expect(calcularSaude(diario, resumo({}), cfg({ paused_until: new Date(agora.getTime() + 3600_000).toISOString() }), agora, inicioAntigo)).toBe("desligado");
  });

  it("script que não registra fica \"sem registro\", não \"parado\"", () => {
    expect(calcularSaude(script, null, null, agora, inicioAntigo)).toBe("sem-registro");
  });

  it("portão do cron-call.sh", () => {
    expect(podeRodar(null, agora)).toEqual({ rodar: true });
    expect(podeRodar(cfg({ enabled: false }), agora).rodar).toBe(false);
    const p = podeRodar(cfg({ paused_until: new Date(agora.getTime() + 86400_000).toISOString() }), agora);
    expect(p.rodar).toBe(false);
    expect(p.motivo).toMatch(/^pausado até/);
    expect(podeRodar(cfg({ paused_until: hAtras(1) }), agora).rodar).toBe(true);
  });

  it("painel tem uma linha por job e o texto do vigia cita cada problema", () => {
    const linhas = montarLinhas([resumo({ ultima_real_ok: false })], [], agora, inicioAntigo);
    expect(linhas).toHaveLength(AUTOMACOES.length);
    const alvo = linhas.filter((l) => l.id === diario.id);
    expect(alvo[0].saude).toBe("falhou");
    expect(alvo[0].proxima).toBe("2026-09-24T11:00:00.000Z");
    const txt = textoVigia(alvo, { [diario.id]: '{"ok":false,"error":"token expirado"}' }, "https://painel/automations");
    expect(txt).toContain(diario.nome);
    expect(txt).toContain("token expirado");
    expect(txt).toContain("https://painel/automations");
  });
});
