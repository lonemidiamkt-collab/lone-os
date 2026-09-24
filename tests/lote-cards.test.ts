import { describe, it, expect } from "vitest";
import { slotsSegQuaSex, proximoSlot, chaveDaLinha } from "@/components/kanban/lote";

describe("criação em lote — datas seg/qua/sex", () => {
  it("quarta 23/09 → seg 28, qua 30, sex 02/10", () => {
    expect(slotsSegQuaSex("2026-09-23")).toEqual(["2026-09-28", "2026-09-30", "2026-10-02"]);
  });

  it("numa segunda sugere a PRÓXIMA semana, não hoje", () => {
    expect(slotsSegQuaSex("2026-09-28")).toEqual(["2026-10-05", "2026-10-07", "2026-10-09"]);
  });

  it("domingo → a segunda de amanhã", () => {
    expect(slotsSegQuaSex("2026-09-27")[0]).toBe("2026-09-28");
  });

  it("linha nova pula pro próximo dia de postagem", () => {
    expect(proximoSlot("2026-10-02")).toBe("2026-10-05"); // sex → seg
    expect(proximoSlot("2026-09-28")).toBe("2026-09-30"); // seg → qua
  });

  it("títulos iguais em linhas diferentes têm chaves diferentes", () => {
    expect(chaveDaLinha("L1", "batch-0")).not.toBe(chaveDaLinha("L1", "batch-1"));
    expect(chaveDaLinha("L1", "batch-0")).toBe(chaveDaLinha("L1", "batch-0"));
  });
});
