import { describe, it, expect } from "vitest";
import { legendaRevisao, montarRevisao, semanaAnterior, SEM_DONO, type ClienteRevisao } from "@/lib/reports/revisaoSemanal";
import { revisaoSemanalPdfHtml } from "@/lib/reports/revisaoSemanalPdf";
import type { LinhaCard, LinhaPost } from "@/lib/conteudo/no-ar";

// N31 — Revisão semanal de operação (segunda). A semana que fechou numa folha, por responsável.

describe("a semana da revisão", () => {
  it("na segunda, é a semana que acabou ontem (segunda a domingo)", () => {
    expect(semanaAnterior("2026-09-28")).toEqual({ inicio: "2026-09-21", fim: "2026-09-27", rotulo: "21/09 a 27/09" });
  });
  it("em qualquer dia, é a semana anterior inteira", () => {
    expect(semanaAnterior("2026-09-24").inicio).toBe("2026-09-14");
    expect(semanaAnterior("2026-09-27").inicio).toBe("2026-09-14"); // domingo ainda é a semana corrente
  });
});

const clientes: ClienteRevisao[] = [
  { id: "a", nome: "Ótica Alfa", social: "Carlos", designer: "Rodrigo", temInstagram: true },
  { id: "b", nome: "Beta Pisos", social: "Thiago", designer: "Rodrigo", temInstagram: true },
  { id: "c", nome: "Gama Sem IG", social: "Carlos", designer: null, temInstagram: false },
];
const semana = semanaAnterior("2026-09-28"); // 21 a 27/09
const card = (c: Partial<LinhaCard> & { id: string; client_id: string }): LinhaCard => ({ status: "scheduled", format: "Post", ...c });
const post = (media_id: string, client_id: string, posted_at: string, tipo = "IMAGE"): LinhaPost => ({ media_id, client_id, posted_at, tipo });

describe("montarRevisao", () => {
  const r = montarRevisao({
    semana, hoje: "2026-09-28", clientes,
    posts: [
      post("p1", "a", "2026-09-22T14:00:00Z"),            // seg 22, no dia
      post("p2", "a", "2026-09-25T14:00:00Z"),            // qui 25, card era qua 24 → depois do dia
      post("p3", "b", "2026-09-26T14:00:00Z"),            // casa com k7 (mesmo dia, mesmo formato)
      post("fora", "a", "2026-09-29T14:00:00Z"),          // semana seguinte
    ],
    cards: [
      card({ id: "k1", client_id: "a", due_date: "2026-09-22" }),
      card({ id: "k2", client_id: "a", due_date: "2026-09-24" }),
      card({ id: "k3", client_id: "b", due_date: "2026-09-23" }),                      // sem post
      card({ id: "k4", client_id: "c", due_date: "2026-09-23" }),                      // sem Instagram: não conta "sem post"
      card({ id: "k5", client_id: "b", due_date: "2026-09-21", status: "published", publish_verified_at: "2026-09-21T15:00:00Z" }),
      // atrasado agora: com o designer desde 20/09 → o dono é o designer do cliente
      card({ id: "k6", client_id: "a", due_date: "2026-09-20", status: "in_production", title: "Carrossel promo" }),
      // atrasado agora: com o cliente → o social do card
      card({ id: "k7", client_id: "b", due_date: "2026-09-26", status: "client_approval", title: "Reels", social_media: "Thiago" }),
      card({ id: "k8", client_id: "b", due_date: "2026-09-26", status: "ideas" }), // pauta: planejado, sem post, mas não é atraso
    ],
    reunioes: [
      { clientId: "a", responsavel: "Carlos", estado: "realizada", realizadaEm: "2026-09-23T17:00:00Z", mesReferencia: "2026-09" },
      { clientId: "b", responsavel: "Thiago", estado: "pendente", mesReferencia: "2026-09" },
      { clientId: "c", responsavel: null, estado: "agendada", startAt: "2026-09-26T13:00:00Z", mesReferencia: "2026-09" },
    ],
    tarefas: [
      { titulo: "Trocar logo", dono: "Rodrigo", cliente: "Ótica Alfa", vencimento: "2026-09-25" },
      { titulo: "Setup", dono: null, vencimento: "2026-09-20" },
      { titulo: "Ainda no prazo", dono: "Carlos", vencimento: "2026-09-30" },
    ],
  });

  it("posts: planejados × no ar × registrados, sem post e depois do dia", () => {
    // Planejado = todo card com data na semana (pauta incluída), como na aba Resultados.
    expect(r.totais).toMatchObject({ planejados: 7, noAr: 3, registrados: 1, semPost: 2, depoisDoDia: 1 });
    const carlos = r.pessoas.find((p) => p.pessoa === "Carlos")!;
    expect(carlos.posts).toMatchObject({ planejados: 3, noAr: 2, depoisDoDia: 1, semPost: 0 });
    const thiago = r.pessoas.find((p) => p.pessoa === "Thiago")!;
    expect(thiago.posts).toMatchObject({ planejados: 4, noAr: 1, registrados: 1, semPost: 2 });
  });

  it("atrasos: com o designer vai pro designer; nas outras etapas, pro social; pauta não conta", () => {
    expect(r.totais.cardsAtrasados).toBe(2);
    expect(r.pessoas.find((p) => p.pessoa === "Rodrigo")!.cardsAtrasados).toEqual([
      { cliente: "Ótica Alfa", titulo: "Carrossel promo", etapa: "Com o designer", dias: 8 },
    ]);
    expect(r.pessoas.find((p) => p.pessoa === "Thiago")!.cardsAtrasados[0]).toMatchObject({ etapa: "Com o cliente", dias: 2 });
  });

  it("reuniões: feitas na semana, do mês sem marcar e agendada que passou sem registro", () => {
    expect(r.totais).toMatchObject({ reunioesFeitas: 1, reunioesPendentes: 2 });
    expect(r.pessoas.find((p) => p.pessoa === "Carlos")!.reunioesFeitas).toEqual(["Ótica Alfa"]);
    expect(r.pessoas.find((p) => p.pessoa === "Thiago")!.reunioesPendentes[0].motivo).toBe("reunião do mês ainda não marcada");
    // Sem responsável na reunião: cai no social do cliente.
    expect(r.pessoas.find((p) => p.pessoa === "Carlos")!.reunioesPendentes[0]).toMatchObject({ cliente: "Gama Sem IG", motivo: "passou sem registro de realizada" });
  });

  it("tarefas vencidas por dono; sem dono vai para o fim da lista", () => {
    expect(r.totais.tarefasVencidas).toBe(2);
    expect(r.pessoas.at(-1)!.pessoa).toBe(SEM_DONO);
    expect(r.pessoas.find((p) => p.pessoa === "Rodrigo")!.tarefasVencidas[0]).toMatchObject({ titulo: "Trocar logo", dias: 3 });
  });

  it("legenda curta (3 linhas) e PDF com as seções", () => {
    const legenda = legendaRevisao(r);
    expect(legenda.split("\n")).toHaveLength(3);
    expect(legenda).toContain("21/09 a 27/09");
    expect(legenda).toContain("3 posts no ar de 7 planejados");
    const html = revisaoSemanalPdfHtml(r, "");
    for (const t of ["Revisão da semana", "Postagens por social", "Pendências por responsável", "Carrossel promo"]) expect(html).toContain(t);
  });
});
