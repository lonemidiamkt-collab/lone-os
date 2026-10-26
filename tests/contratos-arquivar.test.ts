// tests/contratos-arquivar.test.ts — tirar da lista o contrato que não vai ser assinado, sem apagar.
//
// Roberto, 26/10/2026: os rascunhos de maio a julho apareciam como "Pendente" e escondiam os que faltam
// assinar de verdade. Arquivar é reversível; assinado não arquiva; arquivado não recebe assinatura nova.

import { describe, it, expect } from "vitest";
import { podeArquivar } from "@/lib/contracts/arquivar";
import { escolherContrato } from "@/lib/contracts/assinatura";

describe("arquivar contrato", () => {
  it("rascunho nunca assinado pode", () => {
    expect(podeArquivar({ signed_at: null, d4sign_assinado_em: null, archived_at: null })).toEqual({ ok: true });
  });

  it("assinado (PDF ou D4Sign) não pode — é o registro do combinado", () => {
    expect(podeArquivar({ signed_at: "2026-10-01T12:00:00Z" }).ok).toBe(false);
    expect(podeArquivar({ signed_at: null, d4sign_assinado_em: "2026-10-01T12:00:00Z" }).ok).toBe(false);
  });

  it("já arquivado diz isso em vez de fingir que arquivou de novo", () => {
    const r = podeArquivar({ signed_at: null, archived_at: "2026-10-26T12:00:00Z" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/já está arquivado/);
  });
});

describe("assinatura da D4Sign não cai em contrato arquivado", () => {
  it("pula o rascunho arquivado e liga ao que está na lista", () => {
    const contratos = [
      { id: "novo-arquivado", client_id: "c", created_at: "2026-10-20T12:00:00Z", archived_at: "2026-10-26T12:00:00Z" },
      { id: "valendo", client_id: "c", created_at: "2026-10-10T12:00:00Z" },
    ];
    expect(escolherContrato(contratos, "doc-1", "2026-10-25T12:00:00Z")).toBe("valendo");
  });

  it("só arquivado: não liga a nenhum", () => {
    const contratos = [{ id: "a", client_id: "c", created_at: "2026-05-04T12:00:00Z", archived_at: "2026-10-26T12:00:00Z" }];
    expect(escolherContrato(contratos, "doc-1", "2026-10-25T12:00:00Z")).toBeNull();
  });
});
