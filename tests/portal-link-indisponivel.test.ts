import { describe, it, expect, vi, beforeEach } from "vitest";

// 26/10/2026: na queda de 16/10 e no soluço de 22/10, links válidos do portal deram "página não
// encontrada" — a falha do banco caía no mesmo caminho do link errado. Erro de leitura ≠ link inválido.

const resposta: { data: unknown; error: { message: string; code?: string } | null } = { data: null, error: null };
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => resposta }) }) }),
  },
}));

import { estadoDaLeitura, lerLinkDoPortal, clienteDoLink, FRASE_INDISPONIVEL } from "@/lib/portal/token";

const LINK = "5b0c6a2e-8f1d-4c3a-9e7b-2d4f6a8c0e1f";
const ativo = { id: "c1", public_report_enabled: true, public_report_token_revoked_at: null, active: true, churned_at: null, paused_at: null, paused_until: null };

describe("estadoDaLeitura — o banco que falha não é link inválido", () => {
  it("erro do banco = indisponível (503, 'tente de novo'), nunca inválido", () => {
    expect(estadoDaLeitura(null, { message: "fetch failed" })).toEqual({ estado: "indisponivel", erro: "fetch failed" });
    expect(estadoDaLeitura(null, { message: "upstream connect error", code: "PGRST000" }).estado).toBe("indisponivel");
  });
  it("nenhuma linha (PGRST116 do .single, ou null do .maybeSingle) = link inválido", () => {
    expect(estadoDaLeitura(null, { message: "no rows", code: "PGRST116" }).estado).toBe("invalido");
    expect(estadoDaLeitura(null, null).estado).toBe("invalido");
  });
  it("texto que não é UUID (22P02) = link inválido, não banco fora do ar", () => {
    expect(estadoDaLeitura(null, { message: 'invalid input syntax for type uuid: "abc"', code: "22P02" }).estado).toBe("invalido");
  });
  it("as regras de acesso continuam: revogado, desligado, ex-cliente e pausado não abrem", () => {
    expect(estadoDaLeitura(ativo, null).estado).toBe("ok");
    expect(estadoDaLeitura({ ...ativo, public_report_token_revoked_at: "2026-09-01" }, null).estado).toBe("invalido");
    expect(estadoDaLeitura({ ...ativo, public_report_enabled: false }, null).estado).toBe("invalido");
    expect(estadoDaLeitura({ ...ativo, active: false }, null).estado).toBe("invalido");
    expect(estadoDaLeitura({ ...ativo, churned_at: "2026-08-01" }, null).estado).toBe("invalido");
    expect(estadoDaLeitura({ ...ativo, active: null }, null).estado).toBe("ok"); // legado nunca desativado
  });
});

describe("lerLinkDoPortal / clienteDoLink", () => {
  beforeEach(() => { resposta.data = null; resposta.error = null; vi.spyOn(console, "error").mockImplementation(() => {}); });

  it("banco fora do ar: indisponível", async () => {
    resposta.error = { message: "connect ECONNREFUSED" };
    expect((await lerLinkDoPortal(LINK)).estado).toBe("indisponivel");
    expect((await clienteDoLink(LINK)).estado).toBe("indisponivel");
  });
  it("link certo: ok com o nome", async () => {
    resposta.data = { ...ativo, name: "UNAFER", nome_fantasia: null };
    expect(await clienteDoLink(LINK)).toEqual({ estado: "ok", linha: { id: "c1", nome: "UNAFER" } });
  });
  it("token vazio, absurdo ou cortado nem consulta: inválido (mesmo com o banco fora do ar)", async () => {
    resposta.error = { message: "connect ECONNREFUSED" };
    expect((await lerLinkDoPortal("")).estado).toBe("invalido");
    expect((await lerLinkDoPortal("x".repeat(300))).estado).toBe("invalido");
    expect((await lerLinkDoPortal("token-que-nao-existe-123")).estado).toBe("invalido");
    expect((await lerLinkDoPortal(LINK.slice(0, 20))).estado).toBe("invalido"); // cortado ao colar
    expect((await lerLinkDoPortal(LINK.toUpperCase())).estado).toBe("indisponivel"); // UUID válido vai ao banco
  });
  it("a frase para o cliente diz que é instabilidade, não link errado", () => {
    expect(FRASE_INDISPONIVEL).toMatch(/tente de novo/i);
  });
});
