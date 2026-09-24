import { describe, it, expect } from "vitest";
import { montarUpdate } from "@/app/api/content-cards/campos";

const social = { gestao: false, podeArquivar: true };
const designer = { gestao: false, podeArquivar: false };
const gestao = { gestao: true, podeArquivar: true };

describe("montarUpdate — lista fechada de colunas do content_cards", () => {
  it("traduz camelCase (inclusive clientApprovedAt, title, briefing)", () => {
    const r = montarUpdate({ clientApprovedAt: "2026-09-23T10:00:00Z", title: "Post", briefing: "b", dueDate: "2026-09-25" }, social);
    expect(r).toEqual({ ok: true, row: { client_approved_at: "2026-09-23T10:00:00Z", title: "Post", briefing: "b", due_date: "2026-09-25" } });
  });

  it("null passa (é assim que se apaga um campo); undefined é ignorado", () => {
    const r = montarUpdate({ caption: null, hashtags: undefined }, social);
    expect(r).toEqual({ ok: true, row: { caption: null } });
  });

  it("chave desconhecida é 400 — antes sumia calada com sucesso", () => {
    const r = montarUpdate({ status: "ideas", publishVerifyChecks: {} }, social);
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("snake_case fora da lista não vai mais direto pro banco", () => {
    expect(montarUpdate({ created_at: "x" }, gestao)).toMatchObject({ ok: false, status: 400 });
    expect(montarUpdate({ due_date: "2026-09-25" }, social)).toEqual({ ok: true, row: { due_date: "2026-09-25" } });
  });

  it("só a gestão troca responsável/cliente", () => {
    expect(montarUpdate({ socialMedia: "Outra" }, social)).toMatchObject({ ok: false, status: 403 });
    expect(montarUpdate({ client_id: "c2" }, social)).toMatchObject({ ok: false, status: 403 });
    expect(montarUpdate({ socialMedia: "Outra" }, gestao)).toEqual({ ok: true, row: { social_media: "Outra" } });
  });

  it("arquivar: social e gestão sim, designer não", () => {
    expect(montarUpdate({ archivedAt: null }, social)).toEqual({ ok: true, row: { archived_at: null } });
    expect(montarUpdate({ archivedAt: "2026-09-23" }, designer)).toMatchObject({ ok: false, status: 403 });
  });
});
