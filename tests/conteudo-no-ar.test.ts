// "No ar" automático: o post real do Instagram fecha o card planejado (lib/conteudo/no-ar.ts).
// Regra: mesmo cliente, ±1 dia da data planejada, mesmo formato primeiro, depois horário mais
// perto; um post fecha no máximo um card.
import { describe, it, expect } from "vitest";
import {
  casarPostsECards, formatoDoCard, formatoDoInstagram, prontoParaIrAoAr, vaiProFeed, dataPlanejada,
  diasEntre, planejarNoAr, reservarPostsDeQuemJaEstaNoAr,
  type CardCasavel, type PostCasavel, type LinhaCard, type LinhaPost,
} from "@/lib/conteudo/no-ar";

const card = (id: string, data: string, formato: CardCasavel["formato"] = "post", hora?: string, clientId = "c1"): CardCasavel =>
  ({ id, clientId, data, hora, formato });
// Horário de São Paulo escrito com −03:00 para o teste ler como o time lê.
const post = (mediaId: string, quandoSP: string, formato: PostCasavel["formato"] = "post", clientId = "c1"): PostCasavel =>
  ({ mediaId, clientId, postedAt: new Date(`${quandoSP}-03:00`).toISOString(), formato });

describe("formatos", () => {
  it("tipo da Meta → formato do board", () => {
    expect(formatoDoInstagram("VIDEO")).toBe("reel");
    expect(formatoDoInstagram("REELS")).toBe("reel");
    expect(formatoDoInstagram("CAROUSEL_ALBUM")).toBe("carrossel");
    expect(formatoDoInstagram("IMAGE")).toBe("post");
    expect(formatoDoInstagram(null)).toBe("outro");
  });

  it("formato livre do card → formato do board", () => {
    expect(formatoDoCard("Reels")).toBe("reel");
    expect(formatoDoCard("Vídeo curto")).toBe("reel");
    expect(formatoDoCard("Carrossel 5 lâminas")).toBe("carrossel");
    expect(formatoDoCard("Post Feed")).toBe("post");
    expect(formatoDoCard("Story")).toBe("story");
    expect(formatoDoCard("BTS")).toBe("outro");
    expect(formatoDoCard("")).toBe("outro");
  });

  it("story e outra rede não entram (a Meta não lista story no feed)", () => {
    expect(vaiProFeed({ format: "Story" })).toBe(false);
    expect(vaiProFeed({ format: "Reels", platform: "tiktok" })).toBe(false);
    expect(vaiProFeed({ format: "Reels", platform: "instagram" })).toBe(true);
    expect(vaiProFeed({ format: "Post", platform: null })).toBe(true);
  });
});

describe("quem o Instagram pode fechar", () => {
  it("agendado e com o cliente, sim; ideia e roteiro sem arte, não", () => {
    expect(prontoParaIrAoAr({ status: "scheduled" })).toBe(true);
    expect(prontoParaIrAoAr({ status: "client_approval" })).toBe(true);
    expect(prontoParaIrAoAr({ status: "ideas" })).toBe(false);
    expect(prontoParaIrAoAr({ status: "script" })).toBe(false);
    expect(prontoParaIrAoAr({ status: "in_production" })).toBe(false);
  });
  it("arte entregue ou aprovada pelo cliente conta em qualquer etapa; bloqueado e já no ar, não", () => {
    expect(prontoParaIrAoAr({ status: "approval", designerDeliveredAt: "2026-09-01T10:00:00Z" })).toBe(true);
    expect(prontoParaIrAoAr({ status: "in_production", clientApprovedAt: "2026-09-01T10:00:00Z" })).toBe(true);
    expect(prontoParaIrAoAr({ status: "blocked", designerDeliveredAt: "2026-09-01T10:00:00Z" })).toBe(false);
    expect(prontoParaIrAoAr({ status: "published", designerDeliveredAt: "2026-09-01T10:00:00Z" })).toBe(false);
  });
  it("data planejada: a de postagem; sem ela, o dia do agendamento em São Paulo", () => {
    expect(dataPlanejada({ dueDate: "2026-09-10" })).toBe("2026-09-10");
    expect(dataPlanejada({ scheduledAt: "2026-09-11T01:30:00Z" })).toBe("2026-09-10"); // 22h30 do dia 10 em SP
    expect(dataPlanejada({})).toBeNull();
    expect(diasEntre("2026-09-30", "2026-10-01")).toBe(1);
  });
});

describe("janela de ±1 dia — bordas", () => {
  const c = [card("k", "2026-09-10")];
  it("véspera às 00:00 e dia seguinte às 23:59 (horário de SP) ainda casam", () => {
    expect(casarPostsECards(c, [post("a", "2026-09-09T00:00:00")]).pares).toHaveLength(1);
    expect(casarPostsECards(c, [post("b", "2026-09-11T23:59:00")]).pares).toHaveLength(1);
  });
  it("dois dias antes ou depois não casam", () => {
    expect(casarPostsECards(c, [post("a", "2026-09-08T23:59:00")]).pares).toHaveLength(0);
    expect(casarPostsECards(c, [post("b", "2026-09-12T00:01:00")]).pares).toHaveLength(0);
  });
  it("o dia é o de São Paulo, não o do UTC (post às 22h do dia 11 = 01h UTC do dia 12)", () => {
    const r = casarPostsECards(c, [post("n", "2026-09-11T22:00:00")]);
    expect(r.pares).toHaveLength(1);
    expect(r.pares[0].dias).toBe(1);
  });
  it("cliente diferente nunca casa", () => {
    expect(casarPostsECards(c, [post("x", "2026-09-10T10:00:00", "post", "outro")]).pares).toHaveLength(0);
  });
});

describe("desempate", () => {
  it("mesmo formato ganha de horário mais perto", () => {
    const r = casarPostsECards(
      [card("k", "2026-09-10", "reel", "10:00")],
      [post("perto", "2026-09-10T10:05:00", "post"), post("reel", "2026-09-11T18:00:00", "reel")],
    );
    expect(r.pares.map((p) => p.mediaId)).toEqual(["reel"]);
    expect(r.postsSemCard).toEqual(["perto"]);
  });

  it("mesmo formato: o horário mais perto do planejado leva", () => {
    const r = casarPostsECards(
      [card("manha", "2026-09-10", "post", "09:00"), card("noite", "2026-09-10", "post", "19:00")],
      [post("p19", "2026-09-10T19:10:00"), post("p9", "2026-09-10T09:20:00")],
    );
    const por = Object.fromEntries(r.pares.map((p) => [p.cardId, p.mediaId]));
    expect(por).toEqual({ manha: "p9", noite: "p19" });
  });

  it("empate completo é decidido pelo id — o resultado não muda entre execuções", () => {
    const cards = [card("b", "2026-09-10"), card("a", "2026-09-10")];
    const posts = [post("p", "2026-09-10T12:00:00")];
    const r1 = casarPostsECards(cards, posts);
    const r2 = casarPostsECards([...cards].reverse(), posts);
    expect(r1.pares).toEqual(r2.pares);
    expect(r1.pares[0].cardId).toBe("a");
    expect(r1.cardsSemPost).toEqual(["b"]);
  });
});

describe("um para um", () => {
  it("um post fecha no máximo um card", () => {
    const r = casarPostsECards([card("a", "2026-09-10"), card("b", "2026-09-11")], [post("p", "2026-09-10T15:00:00")]);
    expect(r.pares).toHaveLength(1);
    expect(r.pares[0].cardId).toBe("a"); // o mais perto
    expect(r.cardsSemPost).toEqual(["b"]);
  });

  it("um card recebe no máximo um post", () => {
    const r = casarPostsECards([card("a", "2026-09-10")], [post("p1", "2026-09-10T10:00:00"), post("p2", "2026-09-10T11:00:00")]);
    expect(r.pares).toHaveLength(1);
    expect(r.postsSemCard).toHaveLength(1);
  });

  it("post já usado não entra na disputa", () => {
    const r = casarPostsECards([card("a", "2026-09-10")], [post("p", "2026-09-10T10:00:00")], { postsJaUsados: ["p"] });
    expect(r.pares).toHaveLength(0);
    expect(r.postsSemCard).toEqual([]);
  });
});

// ─── Do banco: quem já está no ar segura o post ───────────────────────────
const linhaCard = (over: Partial<LinhaCard> & { id: string }): LinhaCard =>
  ({ client_id: "c1", status: "scheduled", format: "Post", due_date: "2026-09-10", ...over });
const linhaPost = (media_id: string, quandoSP: string, tipo = "IMAGE", client_id = "c1"): LinhaPost =>
  ({ media_id, client_id, posted_at: new Date(`${quandoSP}-03:00`).toISOString(), tipo, permalink: `https://instagram.com/p/${media_id}` });

describe("planejarNoAr", () => {
  it("fecha o card agendado com o post do dia e leva o link", () => {
    const plano = planejarNoAr([linhaCard({ id: "k", title: "Dica" })], [linhaPost("p", "2026-09-10T11:00:00")]);
    expect(plano).toHaveLength(1);
    expect(plano[0]).toMatchObject({ cardId: "k", mediaId: "p", permalink: "https://instagram.com/p/p", dataPlanejada: "2026-09-10", dias: 0 });
  });

  it("card marcado no ar à mão reserva o post dele — o card do dia seguinte não leva o mesmo post", () => {
    const plano = planejarNoAr(
      [linhaCard({ id: "manual", status: "published", publish_verified_at: "2026-09-10T20:00:00Z" }), linhaCard({ id: "amanha", due_date: "2026-09-11" })],
      [linhaPost("p", "2026-09-10T10:00:00")],
    );
    expect(plano).toEqual([]);
  });

  it("post ligado pelo id (ig_media_id) ou pelo mesmo instante já tem dono", () => {
    const quando = new Date("2026-09-10T10:00:00-03:00").toISOString();
    const posts = [linhaPost("p1", "2026-09-10T10:00:00"), linhaPost("p2", "2026-09-10T18:00:00")];
    const r = reservarPostsDeQuemJaEstaNoAr([
      linhaCard({ id: "ligado", status: "published", ig_media_id: "p2", due_date: "2026-01-01" }),
      linhaCard({ id: "instante", status: "published", publish_verified_at: quando, due_date: "2026-01-01" }),
    ], posts);
    expect([...r.usados].sort()).toEqual(["p1", "p2"]);
    expect(planejarNoAr([linhaCard({ id: "aberto" }), linhaCard({ id: "ligado", status: "published", ig_media_id: "p2" }),
      linhaCard({ id: "instante", status: "published", publish_verified_at: quando, due_date: "2026-01-01" })], posts)).toEqual([]);
  });

  it("não fecha ideia, story, arquivado, nem card sem data", () => {
    const plano = planejarNoAr([
      linhaCard({ id: "ideia", status: "ideas" }),
      linhaCard({ id: "story", format: "Story" }),
      linhaCard({ id: "arquivado", archived_at: "2026-09-09T10:00:00Z" }),
      linhaCard({ id: "sem-data", due_date: null }),
    ], [linhaPost("p", "2026-09-10T10:00:00")]);
    expect(plano).toEqual([]);
  });

  it("reel planejado prefere o vídeo do dia seguinte à foto do mesmo dia", () => {
    const plano = planejarNoAr(
      [linhaCard({ id: "k", format: "Reels" })],
      [linhaPost("foto", "2026-09-10T10:00:00", "IMAGE"), linhaPost("video", "2026-09-11T09:00:00", "VIDEO")],
    );
    expect(plano.map((f) => f.mediaId)).toEqual(["video"]);
    expect(plano[0].mesmoFormato).toBe(true);
  });
});
