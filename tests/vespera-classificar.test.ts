import { describe, it, expect } from "vitest";
import { classificarVespera, cumpriuODia, diasDePostAnteriores } from "@/lib/cs/vespera-classificar";

// Véspera de sexta 02/10/2026: "36 clientes precisam de atenção, já prontos 4/40" — e tinham sido
// todos entregues e postados. O time posta a maioria sem card; a véspera acusava pela falta de card.
const HOJE = "2026-10-01"; // quinta, a véspera roda à tarde
const SEG_SEX = [1, 5];
const ESPERADOS = diasDePostAnteriores(HOJE, SEG_SEX, 6);

describe("dias de post esperados", () => {
  it("seg/sex antes de hoje, do mais novo pro mais velho", () => {
    expect(ESPERADOS).toEqual(["2026-09-28", "2026-09-25", "2026-09-21", "2026-09-18", "2026-09-14", "2026-09-11"]);
  });

  it("quem faz vídeo também é cobrado de quarta", () => {
    expect(diasDePostAnteriores(HOJE, [1, 3, 5], 3)).toEqual(["2026-09-30", "2026-09-28", "2026-09-25"]);
  });
});

describe("cumpriu o dia de post", () => {
  it("vale o próprio dia ou um dia antes/depois", () => {
    expect(cumpriuODia("2026-09-28", new Set(["2026-09-28"]))).toBe(true);
    expect(cumpriuODia("2026-09-28", new Set(["2026-09-29"]))).toBe(true);
    expect(cumpriuODia("2026-09-28", new Set(["2026-09-27"]))).toBe(true);
    expect(cumpriuODia("2026-09-28", new Set(["2026-09-30"]))).toBe(false);
  });
});

describe("véspera", () => {
  const base = { temPedidoAmanha: false, pedidoEntregue: false, instagramConferivel: true, diasEsperados: ESPERADOS };

  it("SEM CARD mas postando em dia: não é pendência — o caso de 32 dos 36 de 02/10", () => {
    const r = classificarVespera({ ...base, diasComPost: new Set(ESPERADOS) });
    expect(r).toEqual({ situacao: "em_dia", postou: 6, de: 6 });
  });

  it("uma falta isolada (feriado, pausa pedida) ainda é em dia", () => {
    expect(classificarVespera({ ...base, diasComPost: new Set(ESPERADOS.slice(1)) }).situacao).toBe("em_dia");
  });

  it("sem card e faltando post: aí sim é risco, com o placar", () => {
    const r = classificarVespera({ ...base, diasComPost: new Set(["2026-09-28", "2026-09-21"]) });
    expect(r).toEqual({ situacao: "em_risco", postou: 2, de: 6 });
  });

  it("card pra amanhã com arte entregue: pronto", () => {
    expect(classificarVespera({ ...base, temPedidoAmanha: true, pedidoEntregue: true, diasComPost: new Set() }).situacao).toBe("pronto");
  });

  it("card pra amanhã SEM arte: pendência real, mesmo que o histórico seja bom", () => {
    const r = classificarVespera({ ...base, temPedidoAmanha: true, pedidoEntregue: false, diasComPost: new Set(ESPERADOS) });
    expect(r.situacao).toBe("arte_pendente");
  });

  it("sem Instagram pra conferir: não acusa — vai pra seção própria", () => {
    expect(classificarVespera({ ...base, instagramConferivel: false, diasComPost: new Set() }).situacao).toBe("sem_instagram");
  });
});
