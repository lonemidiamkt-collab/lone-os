// Aba "Resultados" do Social: contada nos posts reais do Instagram (lib/conteudo/resultados.ts).
import { describe, it, expect } from "vitest";
import { montarResultados, limitesDoMes, pctNoPrazo, SEM_SOCIAL, type ClienteResultado } from "@/lib/conteudo/resultados";
import type { LinhaCard, LinhaPost } from "@/lib/conteudo/no-ar";

const cliente = (id: string, social: string | null, temInstagram = true): ClienteResultado =>
  ({ id, nome: id.toUpperCase(), social, temInstagram, meta: 12, ultimoPost: null });
const post = (media_id: string, quandoSP: string, client_id = "a", tipo = "IMAGE"): LinhaPost =>
  ({ media_id, client_id, posted_at: new Date(`${quandoSP}-03:00`).toISOString(), tipo, permalink: null });
const card = (id: string, due_date: string, over: Partial<LinhaCard> = {}): LinhaCard =>
  ({ id, client_id: "a", status: "scheduled", format: "Post", due_date, ...over });

describe("limites e percentuais", () => {
  it("mês de 30 e de 28 dias", () => {
    expect(limitesDoMes("2026-09")).toEqual({ inicio: "2026-09-01", fim: "2026-09-30" });
    expect(limitesDoMes("2026-02")).toEqual({ inicio: "2026-02-01", fim: "2026-02-28" });
  });
  it("% no prazo só entre posts planejados", () => {
    expect(pctNoPrazo({ noPrazo: 3, atrasados: 1 })).toBe(75);
    expect(pctNoPrazo({ noPrazo: 0, atrasados: 0 })).toBeNull();
  });
});

describe("montarResultados", () => {
  const base = {
    mes: "2026-09",
    hoje: "2026-09-24",
    clientes: [cliente("a", "Bia"), cliente("b", "Bia"), cliente("c", "Léo"), cliente("d", null, false)],
  };

  it("no prazo, atrasado e sem card", () => {
    const r = montarResultados({
      ...base,
      posts: [
        post("p1", "2026-09-10T10:00:00"),           // card do dia 10 → no prazo
        post("p2", "2026-09-12T09:00:00"),           // card do dia 11 → atrasado (1 dia)
        post("p3", "2026-09-15T09:00:00"),           // ninguém planejou → sem card
        post("p4", "2026-09-09T09:00:00", "b"),      // card do dia 10 → saiu antes: no prazo
      ],
      cards: [card("k1", "2026-09-10"), card("k2", "2026-09-11"), card("k3", "2026-09-10", { client_id: "b" })],
    });
    const a = r.porCliente.find((l) => l.clientId === "a")!;
    expect(a).toMatchObject({ posts: 3, noPrazo: 1, atrasados: 1, semCard: 1, planejadosSemPost: 0 });
    const b = r.porCliente.find((l) => l.clientId === "b")!;
    expect(b).toMatchObject({ posts: 1, noPrazo: 1, atrasados: 0 });
    expect(r.totais).toMatchObject({ posts: 4, noPrazo: 2, atrasados: 1, semCard: 1 });
  });

  it("post fora do mês não conta, mesmo que case com card do mês", () => {
    const r = montarResultados({ ...base, posts: [post("p", "2026-10-01T09:00:00")], cards: [card("k", "2026-09-30")] });
    expect(r.totais.posts).toBe(0);
    // e o card do dia 30 achou o post (de 1º/10): não é "planejado sem post"
    expect(r.totais.planejadosSemPost).toBe(0);
  });

  it("planejado sem post só depois que a janela fecha, e nunca para quem não tem Instagram", () => {
    const r = montarResultados({
      ...base,
      posts: [],
      cards: [
        card("velho", "2026-09-20"),                               // janela fechou (21 < 24)
        card("ontem", "2026-09-23"),                               // ainda pode sair amanhã… janela até 24
        card("anteontem", "2026-09-22"),                           // janela até 23 < 24 → conta
        card("semig", "2026-09-10", { client_id: "d" }),           // sem Instagram: não dá pra afirmar
        card("manual", "2026-09-10", { status: "published" }),     // alguém conferiu: não desmente
        card("story", "2026-09-10", { format: "Story" }),          // story não vai pro feed
      ],
    });
    expect(r.porCliente.find((l) => l.clientId === "a")!.planejadosSemPost).toBe(2);
    expect(r.porCliente.find((l) => l.clientId === "d")!.planejadosSemPost).toBe(0);
  });

  it("card já ligado ao post (No ar automático) conta pelo vínculo", () => {
    const r = montarResultados({
      ...base,
      posts: [post("p", "2026-09-11T09:00:00")],
      cards: [card("k", "2026-09-10", { status: "published", ig_media_id: "p" })],
    });
    expect(r.porCliente.find((l) => l.clientId === "a")).toMatchObject({ posts: 1, atrasados: 1, semCard: 0 });
  });

  it("mix de formatos e soma por pessoa (quem não tem social vai por último)", () => {
    const r = montarResultados({
      ...base,
      posts: [
        post("r", "2026-09-02T10:00:00", "a", "VIDEO"),
        post("c", "2026-09-03T10:00:00", "b", "CAROUSEL_ALBUM"),
        post("i", "2026-09-04T10:00:00", "c", "IMAGE"),
      ],
      cards: [],
    });
    expect(r.totais.formatos).toMatchObject({ reel: 1, carrossel: 1, post: 1 });
    expect(r.porPessoa.map((p) => p.pessoa)).toEqual(["Bia", "Léo", SEM_SOCIAL]);
    const bia = r.porPessoa[0];
    expect(bia).toMatchObject({ clientes: 2, posts: 2, semCard: 2 });
    expect(bia.formatos).toMatchObject({ reel: 1, carrossel: 1 });
    expect(r.porPessoa[2]).toMatchObject({ clientes: 1, clientesSemInstagram: 1, posts: 0 });
    expect(r.totais).toMatchObject({ clientes: 4, clientesSemInstagram: 1 });
  });
});
