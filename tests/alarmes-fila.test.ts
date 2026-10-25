// tests/alarmes-fila.test.ts — o que os alarmes põem na fila de prioridades e o silêncio depois de decidir.

import { describe, it, expect } from "vitest";
import { emSilencio } from "@/lib/priority/silencio";
import { pesoDoRitmo } from "@/lib/priority/fontes/alarmes";
import { lerRitmoVerba, type EntradaRitmo } from "@/lib/traffic/alarmes/ritmo-verba";

const agora = new Date("2026-10-25T15:00:00Z");
const horasAtras = (h: number) => new Date(agora.getTime() - h * 3_600_000).toISOString();

describe("silêncio depois da decisão", () => {
  it("Feito cala por 24 h; depois disso o problema que continua volta", () => {
    expect(emSilencio([{ fingerprint: "a", estado: "executada", decidido_em: horasAtras(5) }], agora).has("a")).toBe(true);
    expect(emSilencio([{ fingerprint: "a", estado: "executada", decidido_em: horasAtras(25) }], agora).has("a")).toBe(false);
  });

  it("Ignorar e Incorreta calam por 7 dias", () => {
    expect(emSilencio([{ fingerprint: "b", estado: "ignorada", decidido_em: horasAtras(6 * 24) }], agora).has("b")).toBe(true);
    expect(emSilencio([{ fingerprint: "c", estado: "incorreta", decidido_em: horasAtras(8 * 24) }], agora).has("c")).toBe(false);
  });

  it("vale a decisão mais recente do mesmo fingerprint; estado sem silêncio não cala", () => {
    const s = emSilencio([
      { fingerprint: "d", estado: "ignorada", decidido_em: horasAtras(6 * 24) },
      { fingerprint: "d", estado: "executada", decidido_em: horasAtras(30) },
      { fingerprint: "e", estado: "resolvida", decidido_em: horasAtras(1) },
      { fingerprint: "f", estado: "executada", decidido_em: null },
    ], agora);
    expect(s.has("d")).toBe(false); // a última foi "Feito" há 30 h
    expect(s.has("e")).toBe(false);
    expect(s.has("f")).toBe(false);
  });
});

const entrada = (o: Partial<EntradaRitmo>): EntradaRitmo => ({
  verba: 1000, gastoMes: 500, gastoHoje: 0, hoje: "2026-10-24", serie7d: [20, 20, 20, 20, 20, 20, 20],
  isPrepaid: true, saldo: 500, contaAtiva: true, ...o,
});

describe("peso do ritmo na fila", () => {
  it("verba estourada pesa mais que abaixo do ritmo, e não é reversível", () => {
    const estourou = pesoDoRitmo(lerRitmoVerba(entrada({ gastoMes: 1010, serie7d: [60, 60, 60, 60, 60, 60, 60] })));
    const abaixo = pesoDoRitmo(lerRitmoVerba(entrada({})));
    expect(estourou.severidade).toBeGreaterThan(abaixo.severidade);
    expect(estourou.reversivel).toBe(false);
    expect(abaixo.reversivel).toBe(true);
  });

  it("quanto mais longe da verba, mais severo; R$ em jogo é a diária que falta", () => {
    const longe = pesoDoRitmo(lerRitmoVerba(entrada({ gastoMes: 100, serie7d: [0, 0, 5, 5, 5, 5, 5] })));
    const perto = pesoDoRitmo(lerRitmoVerba(entrada({ gastoMes: 700, serie7d: [28, 28, 28, 28, 28, 28, 28] })));
    expect(longe.severidade).toBeGreaterThan(perto.severidade);
    expect(longe.exposicaoRs).toBeGreaterThan(0);
  });
});
