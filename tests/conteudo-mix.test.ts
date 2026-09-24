// Mix de conteúdo por cliente (lib/conteudo/mix.ts, Leva 7B N15): formato e tema dos últimos 30
// dias, real (Instagram) × planejado (quadro).
import { describe, it, expect } from "vitest";
import { leituraDoMix, montarMix, temaDoTexto, janelaDoMix } from "@/lib/conteudo/mix";

describe("tema pelo título", () => {
  it("data comemorativa antes de oferta; o resto pelas palavras", () => {
    expect(temaDoTexto("Dia das Mães — promoção de pisos")).toBe("data");
    expect(temaDoTexto("Promoção porcelanato à vista no PIX")).toBe("produto");
    expect(temaDoTexto("Dica: como limpar o piso")).toBe("educativo");
    expect(temaDoTexto("Depoimento da cliente Ana")).toBe("prova");
    expect(temaDoTexto("Bastidor da montagem")).toBe("bastidor");
    expect(temaDoTexto("Nossa história: 20 anos de tradição")).toBe("institucional");
    expect(temaDoTexto("Post de segunda")).toBe("outro");
    expect(temaDoTexto("")).toBe("outro");
  });
});

describe("mix", () => {
  const HOJE = "2026-09-24";
  const clientes = [{ id: "k1", nome: "Loja", temInstagram: true }];

  it("janela de 30 dias com hoje", () => {
    expect(janelaDoMix(HOJE)).toEqual({ inicio: "2026-08-26", fim: "2026-09-24" });
  });

  it("real pelo Instagram (tema pelo card que casou), planejado pelo quadro", () => {
    const cards = [
      { id: "c1", client_id: "k1", title: "Promoção de tintas", status: "scheduled", format: "Post", due_date: "2026-09-10" },
      { id: "c2", client_id: "k1", title: "Dica de pintura", status: "scheduled", format: "Reels", due_date: "2026-09-12" },
      { id: "c3", client_id: "k1", title: "Oferta antiga", status: "scheduled", format: "Post", due_date: "2026-07-01" },
      { id: "c4", client_id: "k1", title: "Story do dia", status: "scheduled", format: "Story", due_date: "2026-09-12" },
    ];
    const posts = [
      { media_id: "m1", client_id: "k1", posted_at: "2026-09-10T13:00:00-03:00", tipo: "IMAGE" },
      { media_id: "m2", client_id: "k1", posted_at: "2026-09-18T13:00:00-03:00", tipo: "VIDEO" },
      { media_id: "m3", client_id: "k1", posted_at: "2026-08-01T13:00:00-03:00", tipo: "IMAGE" },
    ];
    const [m] = montarMix({ clientes, posts, cards, hoje: HOJE });
    expect(m.real.total).toBe(2);
    expect(m.real.formatos.post).toBe(1);
    expect(m.real.formatos.reel).toBe(1);
    expect(m.real.temas.produto).toBe(1);
    expect(m.real.semCard).toBe(1);
    // Story não conta (não vai pro feed); card fora da janela também não.
    expect(m.planejado.total).toBe(2);
    expect(m.planejado.formatos.reel).toBe(1);
    expect(m.planejado.temas.educativo).toBe(1);
  });

  it("leitura: só com base mínima; aponta excesso de oferta e Reels que não sai", () => {
    const base = { clientId: "k1", cliente: "Loja", temInstagram: true };
    const lado = (total: number, produto: number, reel: number) => ({
      total, formatos: { reel, carrossel: 0, post: total - reel, story: 0, outro: 0 },
      temas: { produto, institucional: 0, educativo: total - produto, data: 0, prova: 0, bastidor: 0, outro: 0 },
    });
    expect(leituraDoMix({ ...base, real: { ...lado(3, 3, 0), semCard: 0 }, planejado: lado(2, 2, 0) })).toBeNull();
    expect(leituraDoMix({ ...base, real: { ...lado(10, 8, 2), semCard: 0 }, planejado: lado(10, 5, 2) })).toContain("80% do que foi ao ar é produto");
    expect(leituraDoMix({ ...base, real: { ...lado(6, 2, 0), semCard: 0 }, planejado: lado(6, 2, 3) })).toContain("Reels planejados não estão saindo");
  });
});
