import { describe, it, expect } from "vitest";
import { funil, conversas, sla, esperasDeResposta, temposEntreEstagios, distribuicao, aging, gargalos, filaDoDia, eficiencia, formatarDuracao, type ProspectMin, type EventoMin, type MensagemMin } from "@/lib/prospeccao/metricas";
import { CONFIG_PADRAO } from "@/lib/prospeccao/config";
import type { CampanhaRow } from "@/lib/prospeccao/tipos";

// Terça 15/09/2026 10:00 SP.
const AGORA = new Date("2026-09-15T13:00:00Z");
const camp: CampanhaRow = {
  id: "c", nome: "Piloto", status: "running", iniciado_em: "2026-09-08T12:00:00Z", termina_em: "2026-10-08T12:00:00Z", duracao_dias: 30, limite_dia: 10, auto_stop: true,
  janela_abordagem: { ini: "09:00", fim: "11:00" }, janela_resposta: { ini: "09:00", fim: "18:00" }, finalizado_em: null, finalizado_motivo: null, reativado_em: null, reativado_por: null,
  relatorio_final: null, created_by: null, created_at: "2026-09-08T12:00:00Z", updated_at: "2026-09-08T12:00:00Z",
};
const p = (id: string, estagio: ProspectMin["estagio"], extra: Partial<ProspectMin> = {}): ProspectMin => ({
  id, nome: id, estagio, owner: "SDR_AI", modo_agente: "ativo", precisa_humano: false, primeira_abordagem_em: null, ultima_msg_de: null, ultima_interacao_em: null,
  next_action_at: null, next_action_type: null, score: 80, classe: "A", ranking_dia: null, ranking_pos: null, updated_at: "2026-09-14T12:00:00Z", reuniao_em: null, ...extra,
});
const ev = (prospect_id: string, para: string, created_at: string, tipo = "transicao"): EventoMin => ({ prospect_id, tipo, para, created_at });
const msg = (prospect_id: string, direcao: "in" | "out", created_at: string, autor = direcao === "in" ? "prospect" : "agente"): MensagemMin => ({ prospect_id, direcao, autor, enviado: true, eh_primeira_abordagem: false, created_at });

// 6 prospects: 5 abordados, 3 responderam, 2 chegaram no decisor, 1 marcou reunião, 1 só descoberto.
const PS: ProspectMin[] = [
  p("a", "reuniao_agendada", { primeira_abordagem_em: "2026-09-09T12:30:00Z", ultima_msg_de: "agente", owner: "ROBERTO", modo_agente: "observacao", reuniao_em: "2026-09-17T18:00:00Z" }),
  p("b", "decisor_contatado", { primeira_abordagem_em: "2026-09-10T12:30:00Z", ultima_msg_de: "prospect", ultima_interacao_em: "2026-09-15T12:40:00Z", next_action_at: "2026-09-16T12:30:00Z", next_action_type: "FOLLOWUP_1" }),
  p("c", "atendente", { primeira_abordagem_em: "2026-09-10T12:30:00Z", ultima_msg_de: "agente" }),
  p("d", "followup", { primeira_abordagem_em: "2026-09-08T12:30:00Z", next_action_at: "2026-09-12T12:30:00Z" }),
  p("e", "aguardando_resposta", { primeira_abordagem_em: "2026-09-15T12:10:00Z" }),
  p("f", "descoberto", { score: null, classe: null }),
];
const EV: EventoMin[] = [
  ev("a", "icp_aprovado", "2026-09-09T11:00:00Z"), ev("a", "abordado", "2026-09-09T12:30:00Z"), ev("a", "decisor_contatado", "2026-09-09T14:30:00Z"), ev("a", "interesse", "2026-09-09T15:00:00Z"), ev("a", "reuniao_agendada", "2026-09-09T16:00:00Z"), ev("a", "handoff", "2026-09-09T16:01:00Z"),
  ev("b", "icp_aprovado", "2026-09-10T11:00:00Z"), ev("b", "abordado", "2026-09-10T12:30:00Z"), ev("b", "atendente", "2026-09-10T13:00:00Z"), ev("b", "decisor_identificado", "2026-09-11T13:00:00Z"), ev("b", "decisor_contatado", "2026-09-11T13:30:00Z"),
  ev("c", "icp_aprovado", "2026-09-10T11:00:00Z"), ev("c", "abordado", "2026-09-10T12:30:00Z"), ev("c", "atendente", "2026-09-10T15:00:00Z"),
  ev("d", "icp_aprovado", "2026-09-08T11:00:00Z"), ev("d", "abordado", "2026-09-08T12:30:00Z"), ev("d", "followup", "2026-09-10T12:30:00Z"),
  ev("e", "icp_aprovado", "2026-09-15T11:00:00Z"), ev("e", "abordado", "2026-09-15T12:10:00Z"),
  ev("b", "precisa_humano", "2026-09-11T14:00:00Z", "precisa_humano"),
];
const MS: MensagemMin[] = [
  msg("a", "out", "2026-09-09T12:30:00Z"), msg("a", "in", "2026-09-09T14:00:00Z"), msg("a", "out", "2026-09-09T14:02:00Z"), msg("a", "in", "2026-09-09T15:00:00Z"), msg("a", "out", "2026-09-09T15:01:00Z"),
  msg("b", "out", "2026-09-10T12:30:00Z"), msg("b", "in", "2026-09-10T22:00:00Z" /* fora do horário */), msg("b", "out", "2026-09-11T12:03:00Z" /* 09:03 SP */), msg("b", "in", "2026-09-15T12:40:00Z" /* 09:40 hoje, sem resposta ainda */),
  msg("c", "out", "2026-09-10T12:30:00Z"), msg("c", "in", "2026-09-10T14:50:00Z"), msg("c", "out", "2026-09-10T15:00:00Z" /* 10 min: fora do SLA */),
  msg("d", "out", "2026-09-08T12:30:00Z"), msg("d", "out", "2026-09-10T12:30:00Z"),
  msg("e", "out", "2026-09-15T12:10:00Z"),
];

describe("funil por macroestágio (alcançou)", () => {
  it("conta quem passou por cada passo e a % sobre o anterior", () => {
    const f = funil(PS, EV, MS);
    const n = Object.fromEntries(f.map((x) => [x.chave, x.n]));
    expect(n.encontrados).toBe(6); expect(n.icp_aprovado).toBe(5); expect(n.abordados).toBe(5); expect(n.responderam).toBe(3);
    expect(n.decisor_identificado).toBe(2); // a (via decisor_contatado) e b
    expect(n.decisor_contatado).toBe(2); expect(n.interessados).toBe(1); expect(n.reuniao_marcada).toBe(1); expect(n.cliente).toBe(0);
    expect(f.find((x) => x.chave === "responderam")!.pct_anterior).toBe(60);
    expect(f.find((x) => x.chave === "abordados")!.ids).toContain("e");
  });
});

describe("conversas: quem deve a próxima mensagem", () => {
  it("separa aguardando Lone × aguardando prospect", () => {
    const c = conversas(PS, MS, AGORA);
    expect(c.abordagens).toBe(5); expect(c.responderam).toBe(3); expect(c.nao_responderam).toBe(2); expect(c.taxa_resposta).toBe(60);
    expect(c.responderam_hoje).toBe(1);
    expect(c.abertas).toBe(2); // b e c (a já está com o Roberto)
    expect(c.ids_aguardando_lone).toEqual(["b"]); expect(c.ids_aguardando_prospect).toEqual(["c"]);
    expect(c.ids_sem_resposta.sort()).toEqual(["d", "e"]);
  });
});

describe("SLA de resposta", () => {
  it("mede só dentro do horário e acha quem espera agora", () => {
    const esperas = esperasDeResposta(MS, camp.janela_resposta);
    expect(esperas.length).toBe(4); // a×2, b×1 (22h → conta das 09:00, 3 min), c×1 (10 min)
    expect(esperas).toContain(180); expect(esperas).toContain(600);
    const s = sla(PS, MS, CONFIG_PADRAO, camp, AGORA);
    expect(s.meta_min).toBe(5); expect(s.amostra).toBe(4); expect(s.fora).toBe(1); expect(s.pct_dentro).toBe(75); expect(s.semaforo).toBe("vermelho");
    expect(s.ids_aguardando).toEqual(["b"]); expect(s.maior_espera_agora_s).toBe(20 * 60); expect(s.ids_fora_agora).toEqual(["b"]);
  });
});

describe("velocity, distribuição, aging, gargalos, eficiência", () => {
  it("tempo entre estágios", () => {
    const t = Object.fromEntries(temposEntreEstagios(PS, EV, MS).map((x) => [x.chave, x]));
    expect(t.abordagem_resposta.n).toBe(3);
    expect(t.abordagem_resposta.media_s).toBe(Math.round((90 * 60 + 9.5 * 3600 + 140 * 60) / 3));
    expect(t.interesse_reuniao.media_s).toBe(3600);
    expect(formatarDuracao(t.interesse_reuniao.media_s)).toBe("1h");
    expect(formatarDuracao(3.7 * 86400)).toBe("3,7 dias"); expect(formatarDuracao(108)).toBe("1m 48s");
  });
  it("distribuição só de ativos e aging por última transição", () => {
    const d = Object.fromEntries(distribuicao(PS).map((x) => [x.estagio, x.n]));
    expect(d.reuniao_agendada).toBe(1); expect(d.decisor_contatado).toBe(1); expect(d.descoberto).toBeUndefined();
    const a = Object.fromEntries(aging(PS, EV, AGORA).map((x) => [x.chave, x.ids]));
    expect(a.ate_24h).toEqual(["e"]); expect(a["4_7d"].sort()).toEqual(["a", "b", "c", "d"]);
  });
  it("gargalos: cedo demais, e depois os cálculos", () => {
    const f = funil(PS, EV, MS);
    const g = gargalos(f, temposEntreEstagios(PS, EV, MS), sla(PS, MS, CONFIG_PADRAO, camp, AGORA), PS, MS, AGORA);
    expect(g.map((x) => x.tipo)).toContain("atencao");
    expect(g.find((x) => x.texto.includes("follow-up há mais de 5 dias"))?.ids).toEqual(["d"]);
    expect(g.find((x) => x.texto.includes("esperando o agente"))?.ids).toEqual(["b"]);
    expect(g.find((x) => x.texto.includes("atrasada"))?.ids).toEqual(["d"]);
  });
  it("fila do dia e próximo envio", () => {
    const ps = [p("x", "fila_prospeccao", { ranking_dia: "2026-09-15", ranking_pos: 1, score: 90 }), p("y", "abordado", { ranking_dia: "2026-09-15", ranking_pos: 2, score: 82, primeira_abordagem_em: "2026-09-15T12:05:00Z", classe: "B" })];
    const k = filaDoDia(ps, camp, { usado: 1, limite: 10 }, true, AGORA);
    expect(k.selecionados).toBe(2); expect(k.abordados).toBe(1); expect(k.aguardando).toBe(1); expect(k.score_medio).toBe(86); expect(k.classe_a).toBe(1); expect(k.classe_b).toBe(1);
    expect(k.melhor?.id).toBe("x"); expect(k.proximo_envio_texto).toBe("hoje às 10:05");
    expect(filaDoDia(ps, camp, { usado: 10, limite: 10 }, true, AGORA).proximo_envio_texto).toBe("teto do dia atingido");
    expect(filaDoDia(ps, camp, { usado: 0, limite: 10 }, true, new Date("2026-09-15T20:00:00Z")).proximo_envio_texto).toBe("amanhã às 09:00");
  });
  it("eficiência e autonomia", () => {
    const f = funil(PS, EV, MS);
    const e = eficiencia(f, sla(PS, MS, CONFIG_PADRAO, camp, AGORA), PS, EV, camp, AGORA);
    expect(e.abordagens_por_dia).toBe(0.8); // 5 abordados em 6 dias úteis (08→15/09)
    expect(e.taxa_resposta).toBe(60); expect(e.taxa_reuniao).toBe(20);
    expect(e.handoffs_humanos).toBe(1); expect(e.autonomia).toBe(66.7); expect(e.acoes_no_prazo).toBe(50); // d atrasado, b em dia
  });
});
