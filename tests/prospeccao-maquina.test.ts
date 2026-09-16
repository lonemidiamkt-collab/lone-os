import { describe, it, expect } from "vitest";
import { podeIr, proximaAcaoPadrao, etapaPipeline, resolverQuando, ESTAGIOS, TERMINAIS, exigirProximaAcao, CADENCIA_DIAS } from "@/lib/prospeccao/maquina";
import { componentesSP } from "@/lib/prospeccao/tempo";

// Terça, 15/09/2026, 10:00 em SP.
const AGORA = new Date("2026-09-15T13:00:00Z");

describe("máquina de estados", () => {
  it("caminho feliz: descoberto → … → cliente", () => {
    const caminho = ["descoberto", "enriquecido", "icp_aprovado", "fila_prospeccao", "abordado", "atendente", "decisor_identificado", "decisor_contatado", "interesse", "horario_proposto", "aguardando_confirmacao", "reuniao_agendada", "handoff", "reuniao_realizada", "proposta", "cliente"] as const;
    for (let i = 0; i < caminho.length - 1; i++) expect(podeIr(caminho[i], caminho[i + 1]), `${caminho[i]} → ${caminho[i + 1]}`).toBe(true);
  });
  it("opt-out vale de qualquer estágio ativo e é terminal", () => {
    for (const e of ESTAGIOS) if (!TERMINAIS.has(e)) expect(podeIr(e, "nao_perturbe"), e).toBe(true);
    expect(podeIr("nao_perturbe", "abordado")).toBe(false);
    expect(podeIr("nao_perturbe", "interesse")).toBe(false);
  });
  it("não pula etapas de governança", () => {
    expect(podeIr("descoberto", "abordado")).toBe(false);
    expect(podeIr("icp_aprovado", "abordado")).toBe(false); // só via fila do dia
    expect(podeIr("cliente", "abordado")).toBe(false);
  });
  it("todo estágio ativo tem próxima ação; terminais não", () => {
    for (const e of ESTAGIOS) {
      const acao = proximaAcaoPadrao(e, { agora: AGORA, followups: 0, reuniaoEm: new Date("2026-09-17T13:00:00Z") });
      if (TERMINAIS.has(e)) expect(acao, e).toBeNull();
      else { expect(acao, e).not.toBeNull(); expect(() => exigirProximaAcao(e, acao)).not.toThrow(); expect(acao!.at).toBeTruthy(); }
    }
    expect(() => exigirProximaAcao("abordado", null)).toThrow(/regra de ouro/);
  });
  it("cadência 2/5/12: follow-up 1 em 2 dias úteis às 09:30", () => {
    const a = proximaAcaoPadrao("abordado", { agora: AGORA, followups: 0 })!;
    expect(a.type).toBe("FOLLOWUP_1");
    const c = componentesSP(new Date(a.at!));
    expect(c.ymd).toBe("2026-09-17"); expect(c.hora).toBe(9); expect(c.minuto).toBe(30);
    const b = proximaAcaoPadrao("followup", { agora: AGORA, followups: 1 })!;
    expect(b.type).toBe("FOLLOWUP_2");
    expect(componentesSP(new Date(b.at!)).ymd).toBe("2026-09-18"); // +3 dias úteis (dia 5 da cadência)
    const n = proximaAcaoPadrao("followup", { agora: AGORA, followups: CADENCIA_DIAS.length })!;
    expect(n.type).toBe("NUTRIR");
  });
  it("follow-up pula o fim de semana", () => {
    const sexta = new Date("2026-09-18T13:00:00Z");
    const a = proximaAcaoPadrao("abordado", { agora: sexta, followups: 0 })!;
    expect(componentesSP(new Date(a.at!)).ymd).toBe("2026-09-22"); // terça
  });
  it("depois da reunião o dono é o Roberto (owner na transição)", () => {
    const a = proximaAcaoPadrao("reuniao_realizada", { agora: AGORA })!;
    expect(a.owner).toBe("ROBERTO");
    const h = proximaAcaoPadrao("handoff", { agora: AGORA, reuniaoEm: new Date("2026-09-17T18:00:00Z") })!;
    expect(h.type).toBe("LEMBRETE_24H");
    expect(componentesSP(new Date(h.at!)).ymd).toBe("2026-09-16");
  });
  it("pipeline 01–17 cobre todos os estágios", () => {
    for (const e of ESTAGIOS) expect(etapaPipeline(e)).toMatch(/^\d{2} — /);
    expect(etapaPipeline("nutricao_30d")).toMatch(/^15/);
    expect(etapaPipeline("fora_icp")).toMatch(/^17/);
  });
});

describe("'me chama mês que vem' vira data", () => {
  it("lê expressões comuns", () => {
    expect(componentesSP(resolverQuando("me chama mês que vem", AGORA)!).ymd).toBe("2026-10-15");
    expect(componentesSP(resolverQuando("em 45 dias", AGORA)!).ymd).toBe("2026-10-30");
    expect(componentesSP(resolverQuando("depois da reforma", AGORA)!).ymd).toBe("2026-10-30");
    expect(componentesSP(resolverQuando("semana que vem", AGORA)!).ymd).toBe("2026-09-22");
    expect(resolverQuando("obrigado", AGORA)).toBeNull();
  });
});

describe("conversa anda em qualquer direção", () => {
  it("primeira resposta já com interesse ou horário", () => {
    expect(podeIr("abordado", "interesse")).toBe(true);
    expect(podeIr("abordado", "aguardando_confirmacao")).toBe(true);
    expect(podeIr("decisor_contatado", "reuniao_agendada")).toBe(true);
    expect(podeIr("nutricao_30d", "horario_proposto")).toBe(true);
    expect(podeIr("reuniao_agendada", "interesse")).toBe(false); // depois da reunião não volta sozinho
  });
});
