// Teste OFFLINE do "bom dia" diário — só a lógica pura buildBomDiaDigest (sem banco/IA).
import { describe, it, expect } from "vitest";
import { buildBomDiaDigest } from "@/lib/cs/bom-dia";
import type { SnapshotCS } from "@/lib/cs/snapshot";

const vazio: SnapshotCS = {
  pendentes: [], emProducao: 0, aguardandoAprovacao: 0, aguardandoDesigner: 0, entreguesAguardandoSocial: 0,
  atrasados: [], encalhados: 0, esfriando: [], semPostsSemana: [], semPostsLabel: "essa semana", novosHoje: 0, texto: "",
};
const dia = new Date(2026, 6, 1); // quarta, 01/07 (sem data comemorativa perto)

describe("buildBomDiaDigest", () => {
  it("dia sem nada → mensagem de dia limpo", () => {
    const m = buildBomDiaDigest(vazio, dia);
    expect(m).toContain("Bom dia, time!");
    expect(m).toContain("Dia limpo");
  });

  it("com pendências e atrasados → cita números e prioriza atrasados", () => {
    const snap: SnapshotCS = {
      ...vazio,
      pendentes: [
        { codigo: "A1", cliente: "Contele", tipo: "arte_nova", resumo: "x", dias: 1 },
        { codigo: "A2", cliente: "Nova União", tipo: "duvida", resumo: "y", dias: 2 },
      ],
      emProducao: 5, aguardandoAprovacao: 2,
      atrasados: [{ cliente: "Léo Carros", titulo: "arte feira", dias: 3, responsavel: "Carlos", designerEntregou: true }],
      encalhados: 12,
    };
    const m = buildBomDiaDigest(snap, dia);
    expect(m).toContain("*2* esperando seu ok/não");
    expect(m).toContain("Contele");
    expect(m).toContain("*5* em produção");
    expect(m).toContain("prazo vencido");
    expect(m).toContain("Léo Carros");
    expect(m).toContain("*12* cards encalhados"); // higiene de board separada do atraso
    expect(m).toContain("atrasados"); // fecho prioriza atrasados
  });

  it("só esfriando → sugere reengajar", () => {
    const snap: SnapshotCS = { ...vazio, esfriando: [{ cliente: "Farmácia", dias: 9 }] };
    const m = buildBomDiaDigest(snap, dia);
    expect(m).toContain("esfriando");
    expect(m).toContain("Farmácia (9d)");
  });

  it("lacuna semanal → 'ninguém fica pra trás', com o rótulo da semana-alvo", () => {
    const snap: SnapshotCS = { ...vazio, semPostsLabel: "semana que vem", semPostsSemana: [{ nome: "Contele", social: "Pedro" }, { nome: "CIIL", social: "Carlos" }] };
    const m = buildBomDiaDigest(snap, dia);
    expect(m).toContain("*2* sem nenhum post planejado semana que vem");
    expect(m).toContain("Contele");
    expect(m).toContain("ninguém fica pra trás");
  });

  it("véspera de data comemorativa → lembra o time (mesmo em dia limpo)", () => {
    const vesperaDiaCliente = new Date(2026, 8, 14); // 14/09 → amanhã é Dia do Cliente
    const m = buildBomDiaDigest(vazio, vesperaDiaCliente);
    expect(m).toContain("Dia limpo");
    expect(m).toContain("Amanhã é");
    expect(m).toContain("Dia do Cliente");
  });
});
