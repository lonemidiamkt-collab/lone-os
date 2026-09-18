import { describe, it, expect } from "vitest";
import { novoOperationId } from "@/lib/ops/entregar-arte";

// O operationId é a chave de idempotência da entrega: um por clique, reaproveitado na repetição.
describe("operationId da entrega", () => {
  it("é único por chamada e longo o bastante para a função do banco (≥ 8)", () => {
    const a = novoOperationId(), b = novoOperationId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(a.startsWith("ent-")).toBe(true);
  });
});
