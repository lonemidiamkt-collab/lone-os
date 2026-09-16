import { describe, it, expect } from "vitest";
import { podeAbordarAgora, podeResponderAgora, proximaHoraDeResposta, intervaloAleatorioMs, respeitaIntervalo, tetoDisponivel } from "@/lib/prospeccao/limites";
import { avaliarQualityGate, mensagemValida } from "@/lib/prospeccao/quality-gate";
import { pilotoRodando, diaDoPiloto } from "@/lib/prospeccao/piloto";
import { CONFIG_PADRAO } from "@/lib/prospeccao/config";
import { componentesSP, dentroDaJanela, proximaAberturaDaJanela, somarDiasUteis, candidatosDeHorario } from "@/lib/prospeccao/tempo";
import type { CampanhaRow } from "@/lib/prospeccao/tipos";
import { prospectBase } from "./prospeccao-score.test";

const campanha = (extra: Partial<CampanhaRow> = {}): CampanhaRow => ({
  id: "c1", nome: "Piloto", status: "running", iniciado_em: "2026-09-14T12:00:00Z", termina_em: "2026-10-14T12:00:00Z", duracao_dias: 30, limite_dia: 10, auto_stop: true,
  janela_abordagem: { ini: "09:00", fim: "11:00" }, janela_resposta: { ini: "09:00", fim: "18:00" }, finalizado_em: null, finalizado_motivo: null, reativado_em: null, reativado_por: null,
  relatorio_final: null, created_by: null, created_at: "2026-09-14T12:00:00Z", updated_at: "2026-09-14T12:00:00Z", ...extra,
});
// Terça 15/09/2026 — 09:30, 12:00 e 20:00 em SP (UTC-3).
const T0930 = new Date("2026-09-15T12:30:00Z"), T1200 = new Date("2026-09-15T15:00:00Z"), T2000 = new Date("2026-09-15T23:00:00Z");
const SABADO = new Date("2026-09-19T13:00:00Z");
const cfg = CONFIG_PADRAO;

describe("tempo em São Paulo", () => {
  it("lê componentes no fuso certo", () => {
    const c = componentesSP(T0930);
    expect(c.hora).toBe(9); expect(c.minuto).toBe(30); expect(c.diaSemana).toBe(2); expect(c.ymd).toBe("2026-09-15");
  });
  it("janela 09–11 em dia útil", () => {
    expect(dentroDaJanela({ ini: "09:00", fim: "11:00" }, T0930)).toBe(true);
    expect(dentroDaJanela({ ini: "09:00", fim: "11:00" }, T1200)).toBe(false);
    expect(dentroDaJanela({ ini: "09:00", fim: "18:00" }, SABADO)).toBe(false);
  });
  it("próxima abertura: hoje se ainda não abriu, senão próximo dia útil", () => {
    expect(componentesSP(proximaAberturaDaJanela({ ini: "09:00", fim: "11:00" }, new Date("2026-09-15T10:00:00Z"))).hora).toBe(9);
    expect(componentesSP(proximaAberturaDaJanela({ ini: "09:00", fim: "11:00" }, new Date("2026-09-15T10:00:00Z"))).ymd).toBe("2026-09-15");
    const dep = proximaAberturaDaJanela({ ini: "09:00", fim: "18:00" }, T2000);
    expect(componentesSP(dep).ymd).toBe("2026-09-16");
    const sex = proximaAberturaDaJanela({ ini: "09:00", fim: "18:00" }, new Date("2026-09-18T23:00:00Z"));
    expect(componentesSP(sex).ymd).toBe("2026-09-21");
  });
  it("dias úteis e candidatos a horário (10h/15h, sem fim de semana)", () => {
    expect(componentesSP(somarDiasUteis(new Date("2026-09-18T13:00:00Z"), 1)).ymd).toBe("2026-09-21");
    const cands = candidatosDeHorario(new Date("2026-09-18T13:00:00Z"), 3, () => false);
    expect(cands[0]).toMatch(/^2026-09-21T10:00:00-03:00$/);
    expect(cands[1]).toMatch(/^2026-09-22T15:00:00-03:00$/); // dias diferentes, horas alternadas
    expect(cands[2]).toMatch(/^2026-09-23T10:00:00-03:00$/);
    const soTarde = candidatosDeHorario(T0930, 2, (iso) => iso.includes("T10:"));
    expect(soTarde.every((i) => i.includes("T15:"))).toBe(true);
  });
});

describe("freios (§5, §6)", () => {
  it("abordagem só 09–11, dia útil, piloto rodando, teto livre", () => {
    expect(podeAbordarAgora({ cfg, campanha: campanha(), abordagensHoje: 3, agora: T0930 }).ok).toBe(true);
    expect(podeAbordarAgora({ cfg, campanha: campanha(), abordagensHoje: 3, agora: T1200 }).motivo).toMatch(/janela/);
    expect(podeAbordarAgora({ cfg, campanha: campanha(), abordagensHoje: 10, agora: T0930 }).motivo).toMatch(/teto/);
    expect(podeAbordarAgora({ cfg: { ...cfg, ligado: false }, campanha: campanha(), abordagensHoje: 0, agora: T0930 }).motivo).toMatch(/kill-switch/);
    expect(podeAbordarAgora({ cfg, campanha: campanha({ status: "paused" }), abordagensHoje: 0, agora: T0930 }).motivo).toMatch(/paused/);
    expect(podeAbordarAgora({ cfg, campanha: null, abordagensHoje: 0, agora: T0930 }).motivo).toMatch(/sem piloto/);
  });
  it("piloto vencido bloqueia tudo, inclusive resposta", () => {
    const vencida = campanha({ termina_em: "2026-09-15T00:00:00Z" });
    expect(pilotoRodando(vencida, T0930)).toBe(false);
    expect(podeResponderAgora({ cfg, campanha: vencida, agora: T1200 }).ok).toBe(false);
    expect(diaDoPiloto(campanha(), T0930)).toEqual({ dia: 2, total: 30 });
  });
  it("resposta vale 09–18; fora disso vai para a próxima abertura", () => {
    expect(podeResponderAgora({ cfg, campanha: campanha(), agora: T1200 }).ok).toBe(true);
    expect(podeResponderAgora({ cfg, campanha: campanha(), agora: T2000 }).ok).toBe(false);
    expect(componentesSP(proximaHoraDeResposta(campanha(), T2000))).toMatchObject({ ymd: "2026-09-16", hora: 9 });
  });
  it("intervalo aleatório entre 4 e 9 min e teto", () => {
    expect(intervaloAleatorioMs(cfg, () => 0)).toBe(240_000);
    expect(intervaloAleatorioMs(cfg, () => 1)).toBe(540_000);
    expect(respeitaIntervalo(new Date(T0930.getTime() - 60_000).toISOString(), cfg, T0930)).toBe(false);
    expect(respeitaIntervalo(new Date(T0930.getTime() - 300_000).toISOString(), cfg, T0930)).toBe(true);
    expect(tetoDisponivel(campanha(), 7)).toBe(3);
  });
});

describe("quality gate (§21)", () => {
  const ctx = { cfg, campanha: campanha(), agora: T0930, ehClienteAtual: false } as const;
  it("prospect pronto passa nos 14 itens no envio", () => {
    const g = avaliarQualityGate(prospectBase(), { ...ctx, momento: "envio", mensagem: "Olá, bom dia! Aqui é da equipe do Roberto Lino, da Lone Mídia. Consigo falar com o Marcelo?", abordagensHoje: 2 });
    expect(g.itens.length).toBe(14);
    expect(g.passed, JSON.stringify(g.itens.filter((i) => !i.ok))).toBe(true);
  });
  it("cliente atual, opt-out, já abordado, fora do RJ e score baixo reprovam", () => {
    expect(avaliarQualityGate(prospectBase(), { ...ctx, momento: "ranking", ehClienteAtual: true }).itens.find((i) => i.chave === "nao_e_cliente")?.ok).toBe(false);
    expect(avaliarQualityGate(prospectBase({ estagio: "nao_perturbe" }), { ...ctx, momento: "ranking" }).passed).toBe(false);
    expect(avaliarQualityGate(prospectBase({ primeira_abordagem_em: "2026-09-01T12:00:00Z" }), { ...ctx, momento: "ranking" }).itens.find((i) => i.chave === "nao_abordado_antes")?.ok).toBe(false);
    expect(avaliarQualityGate(prospectBase({ uf: "SP" }), { ...ctx, momento: "ranking" }).itens.find((i) => i.chave === "dentro_da_regiao")?.ok).toBe(false);
    expect(avaliarQualityGate(prospectBase({ score: 45 }), { ...ctx, momento: "ranking" }).itens.find((i) => i.chave === "score_minimo")?.ok).toBe(false);
    expect(avaliarQualityGate(prospectBase({ whatsapp_verificado: false }), { ...ctx, momento: "ranking" }).itens.find((i) => i.chave === "telefone_valido")?.ok).toBe(false);
  });
  it("no ranking a janela não conta; no envio conta", () => {
    expect(avaliarQualityGate(prospectBase(), { ...ctx, agora: T1200, momento: "ranking" }).itens.find((i) => i.chave === "janela_e_teto")?.ok).toBe(true);
    expect(avaliarQualityGate(prospectBase(), { ...ctx, agora: T1200, momento: "envio", mensagem: "Olá, bom dia! Aqui é da equipe do Roberto Lino, da Lone Mídia. Consigo falar com o Marcelo?", abordagensHoje: 0 }).passed).toBe(false);
  });
  it("mensagem com emoji, preço, placeholder ou 'faturamento' é barrada", () => {
    expect(mensagemValida("Olá, bom dia! Aqui é da equipe do Roberto Lino, da Lone Mídia. Consigo falar com o Marcelo? 😀").ok).toBe(false);
    expect(mensagemValida("Olá! Temos um desconto especial para a Casa do Piso este mês, consigo falar com o Marcelo?").ok).toBe(false);
    expect(mensagemValida("Olá, bom dia! Aqui é da equipe do Roberto Lino, da Lone Mídia. Consigo falar com {decisor}?").ok).toBe(false);
    expect(mensagemValida("Olá, bom dia! Vi que o faturamento de vocês é alto, consigo falar com o Marcelo?").ok).toBe(false);
  });
});
