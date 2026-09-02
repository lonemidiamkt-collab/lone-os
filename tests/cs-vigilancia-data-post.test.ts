import { describe, it, expect } from "vitest";
import { avaliarPipeline, diasAteOPost, type CardRow } from "@/lib/cs/vigilancia-pipeline";

// Roberto, 02/09/2026:
//   "sobre cobrança de board travado… às vezes tem uma arte que é pra postar e não está
//    verificando a data. Se é pra postar sexta-feira, o que que eu estou cobrando segunda? Não é
//    mais fácil cobrar quinta? … Às vezes é quarta mas ela foi programada, ele tem que entregar
//    até a sexta."
//
// A cobrança passou a ser ancorada na DATA DO POST. Idade de card não é atraso.

const HOJE = "2026-09-02"; // quarta

function card(over: Partial<CardRow> = {}): CardRow {
  return {
    id: "c1", client_id: "cl1", status: "ideas", due_date: null, created_at: null,
    design_request_id: "dr1", designer_delivered_at: null, social_confirmed_at: null,
    // parado desde ontem: pela regra antiga isso já bastava para cobrar
    status_changed_at: "2026-09-01T09:00:00-03:00",
    column_entered_at: null, blocked_reason: null, design_request_status: "queued",
    ...over,
  };
}

describe("a queixa original: post na sexta, cobrança na segunda", () => {
  it("post daqui a 3 dias com o designer ainda sem pegar: NÃO cobra", () => {
    // Este é o caso exato. Card parado desde ontem, mas o post é sexta — está no prazo.
    const v = avaliarPipeline(card({ due_date: "2026-09-05" }), HOJE);
    expect(v).toBeNull();
  });

  it("na véspera (quinta cobrando sexta) avisa, e diz que é pra amanhã", () => {
    const v = avaliarPipeline(card({ due_date: "2026-09-03" }), HOJE);
    expect(v).not.toBeNull();
    expect(v!.motivo).toMatch(/amanhã/);
    expect(v!.vigilancia).toBe(2);
  });

  it("no dia do post cobra com urgência e diz HOJE", () => {
    const v = avaliarPipeline(card({ due_date: HOJE }), HOJE);
    expect(v!.motivo).toMatch(/HOJE/);
    expect(v!.vigilancia).toBe(3);
    expect(v!.area).toBe("designer");
  });

  it("passou do dia do post: escala e fala no passado", () => {
    const v = avaliarPipeline(card({ due_date: "2026-08-31" }), HOJE);
    expect(v!.vigilancia).toBe(4);
    expect(v!.motivo).toMatch(/era pra ter postado há 2 dias/);
  });
});

describe("o que ainda vale avisar cedo", () => {
  it("post longe MAS o card nem foi pro designer: avisa baixo, porque dá tempo", () => {
    const v = avaliarPipeline(card({ due_date: "2026-09-08", design_request_id: null }), HOJE);
    expect(v!.vigilancia).toBe(1);
    expect(v!.motivo).toMatch(/dá tempo/);
  });

  it("post longe e já está com o designer: silêncio total", () => {
    const v = avaliarPipeline(card({ due_date: "2026-09-08", design_request_status: "in_progress" }), HOJE);
    expect(v).toBeNull();
  });
});

describe("bordas que não podem regredir", () => {
  it("card publicado ou agendado nunca é cobrado", () => {
    expect(avaliarPipeline(card({ status: "published", due_date: "2026-08-01" }), HOJE)).toBeNull();
    expect(avaliarPipeline(card({ status: "scheduled", due_date: "2026-08-01" }), HOJE)).toBeNull();
  });

  it("arte entregue nunca cobra o designer, mesmo com o post vencido", () => {
    const v = avaliarPipeline(card({
      due_date: "2026-08-01", status: "ideas", designer_delivered_at: "2026-07-30T10:00:00-03:00",
    }), HOJE);
    expect(v?.area).toBe("social");        // cobra mover o card, não refazer a arte
    expect(v?.motivo).toMatch(/entregue/);
  });

  it("entregue e o board já em aprovação: nada a cobrar", () => {
    const v = avaliarPipeline(card({
      due_date: "2026-08-01", status: "approval", designer_delivered_at: "2026-07-30T10:00:00-03:00",
    }), HOJE);
    expect(v).toBeNull();
  });

  it("sem data de post, só cobra o caso inequívoco (nem foi pro designer)", () => {
    expect(avaliarPipeline(card({ due_date: null, design_request_id: null }), HOJE)?.motivo)
      .toMatch(/sem data de post/);
    // Com o designer já envolvido e sem prazo conhecido, cobrar seria chute.
    expect(avaliarPipeline(card({ due_date: null, design_request_status: "in_progress" }), HOJE)).toBeNull();
  });

  it("card travado usa a data do post para decidir a intensidade", () => {
    const longe = avaliarPipeline(card({ status: "blocked", due_date: "2026-09-20" }), HOJE);
    const hoje = avaliarPipeline(card({ status: "blocked", due_date: HOJE }), HOJE);
    expect(longe).toBeNull();               // travado mas sem urgência: não é cobrança de hoje
    expect(hoje!.vigilancia).toBe(3);
  });
});

describe("diasAteOPost", () => {
  it("conta em dias de calendário, não em milissegundos de fuso", () => {
    expect(diasAteOPost(card({ due_date: "2026-09-05" }), HOJE)).toBe(3);
    expect(diasAteOPost(card({ due_date: HOJE }), HOJE)).toBe(0);
    expect(diasAteOPost(card({ due_date: "2026-08-31" }), HOJE)).toBe(-2);
    expect(diasAteOPost(card({ due_date: null }), HOJE)).toBeNull();
  });

  it("atravessa a virada do mês sem errar", () => {
    expect(diasAteOPost(card({ due_date: "2026-10-01" }), "2026-09-30")).toBe(1);
  });
});
