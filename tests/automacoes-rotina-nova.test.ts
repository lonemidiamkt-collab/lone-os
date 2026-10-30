import { describe, it, expect } from "vitest";
import { calcularSaude, marcarVistos } from "@/lib/automacoes/saude";
import { AUTOMACOES, type Automacao } from "@/lib/automacoes/registro";

// 29/10/2026: as 4 rotinas criadas entre 19 e 26/10 (diagnóstico e relatório de vendas mensais, vigia
// da Receita no dia 2, regras esperando ok às segundas) ainda não tinham chegado à primeira data e
// já apareciam "paradas" — o silêncio contava desde o início do monitoramento, em agosto. O vigia
// avisou o grupo administrativo de erro que não existia.

const agora = new Date("2026-10-29T22:00:00Z");
const hAtras = (h: number) => new Date(agora.getTime() - h * 3600_000).toISOString();
const inicioAgosto = "2026-08-03T12:00:00Z";
const mensal = AUTOMACOES.find((a) => a.id === "crm-relatorio-mensal") as Automacao;
const semanal = AUTOMACOES.find((a) => a.id === "regras-propostas") as Automacao;

describe("rotina nova conta o silêncio do dia em que apareceu", () => {
  it("sem execução nenhuma, vista há 3 dias: ok (antes: parado)", () => {
    expect(calcularSaude(mensal, null, null, agora, inicioAgosto)).toBe("parado"); // a regra antiga
    expect(calcularSaude(mensal, null, null, agora, inicioAgosto, hAtras(72))).toBe("ok");
    expect(calcularSaude(semanal, null, null, agora, inicioAgosto, hAtras(72))).toBe("ok");
  });
  it("vista há mais tempo que a tolerância e nunca rodou: parado de verdade (faltou no crontab)", () => {
    expect(calcularSaude(semanal, null, null, agora, inicioAgosto, hAtras(semanal.maxSilencioHoras + 1))).toBe("parado");
  });
});

describe("marcarVistos", () => {
  const registro = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("marca só quem nunca teve sucesso e ainda não foi visto", () => {
    const novo = marcarVistos(registro, [{ job: "a", ultimo_sucesso_em: hAtras(1) }, { job: "b", ultimo_sucesso_em: null }], { c: hAtras(48) }, agora);
    expect(novo).toEqual({ c: hAtras(48), b: agora.toISOString() });
  });
  it("nada novo → null (não grava)", () => {
    expect(marcarVistos(registro, [{ job: "a", ultimo_sucesso_em: hAtras(1) }], { b: hAtras(5), c: hAtras(5) }, agora)).toBeNull();
  });
  it("não reescreve a data de quem já foi visto", () => {
    const novo = marcarVistos(registro, [], { a: hAtras(100) }, agora);
    expect(novo?.a).toBe(hAtras(100));
  });
});
