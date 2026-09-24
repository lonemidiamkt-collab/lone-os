import { describe, it, expect } from "vitest";
import { podeAtualizarDemanda, type ContextoDemanda } from "@/app/api/design-requests/permissao";

const doRodrigo: ContextoDemanda = { clientId: "c1", assignedDesigner: null, clienteDesigner: "Rodrigo", anexosAtuais: [] };

describe("podeAtualizarDemanda", () => {
  it("gestão faz tudo, inclusive trocar o designer", () => {
    expect(podeAtualizarDemanda("manager", "Julio", doRodrigo, { assignedDesigner: "Gabriel" }).ok).toBe(true);
    expect(podeAtualizarDemanda("admin", "Roberto", doRodrigo, { status: "done" }).ok).toBe(true);
  });

  it("papel sem relação com design não mexe", () => {
    expect(podeAtualizarDemanda("comercial", "Ana", doRodrigo, { priority: "high" })).toMatchObject({ ok: false, status: 403 });
    expect(podeAtualizarDemanda(null, "", doRodrigo, { priority: "high" })).toMatchObject({ ok: false, status: 403 });
  });

  it("social edita o pedido mas não troca o designer", () => {
    expect(podeAtualizarDemanda("social", "Bia", doRodrigo, { briefing: "x" }).ok).toBe(true);
    expect(podeAtualizarDemanda("social", "Bia", doRodrigo, { assignedDesigner: "Gabriel" })).toMatchObject({ ok: false, status: 403 });
  });

  it("designer só mexe na própria demanda", () => {
    expect(podeAtualizarDemanda("designer", "Rodrigo", doRodrigo, { status: "in_progress" }).ok).toBe(true);
    expect(podeAtualizarDemanda("designer", "Gabriel", doRodrigo, { status: "in_progress" })).toMatchObject({ ok: false, status: 403 });
  });

  it("designer pode assumir e devolver, mas não passar pra um terceiro", () => {
    expect(podeAtualizarDemanda("designer", "Gabriel", doRodrigo, { assignedDesigner: "Gabriel" }).ok).toBe(true);
    const assumida = { ...doRodrigo, assignedDesigner: "Gabriel" };
    expect(podeAtualizarDemanda("designer", "Gabriel", assumida, { assignedDesigner: "" }).ok).toBe(true);
    expect(podeAtualizarDemanda("designer", "Rodrigo", doRodrigo, { assignedDesigner: "Gabriel" })).toMatchObject({ ok: false, status: 403 });
  });

  it("concluir sem arte é barrado para quem não é gestão", () => {
    expect(podeAtualizarDemanda("designer", "Rodrigo", doRodrigo, { status: "done" })).toMatchObject({ ok: false, status: 400 });
    expect(podeAtualizarDemanda("designer", "Rodrigo", doRodrigo, { status: "done", attachments: ["https://x/a.pdf"] }).ok).toBe(true);
    expect(podeAtualizarDemanda("social", "Bia", { ...doRodrigo, anexosAtuais: ["u"] }, { status: "done" }).ok).toBe(true);
  });
});
