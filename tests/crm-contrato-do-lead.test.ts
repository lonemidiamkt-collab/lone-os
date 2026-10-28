// tests/crm-contrato-do-lead.test.ts — a assinatura da D4Sign no card do Comercial (28/10/2026).
// Antes ela só chegava ao grupo de cadastro e à tela de Contratos.

import { describe, it, expect } from "vitest";
import { contratoDoLead, seloDoContrato } from "@/lib/crm/contrato-do-lead";

describe("contrato do lead", () => {
  it("assinado: o selo diz quando", () => {
    const c = contratoDoLead("2026-10-28T19:45:31Z", []);
    expect(c).toEqual({ situacao: "assinado", em: "2026-10-28T19:45:31Z" });
    expect(seloDoContrato({ contrato: c, cadastroAprovacao: false, cadastroPendente: false })).toEqual({ texto: "Contrato assinado 28/10", tom: "ok" });
  });

  it("esperando: diz quem falta (o cliente, a Lone ou os dois)", () => {
    const pend = (sig: unknown[]) => [{ enviado_em: "2026-10-21T19:35:48Z", signatarios: sig }];
    expect(seloDoContrato({ contrato: contratoDoLead(null, pend([{ papel: "lone", assinou: false }, { papel: "cliente", assinou: true }])), cadastroAprovacao: false, cadastroPendente: false }))
      .toEqual({ texto: "Contrato: falta a Lone", tom: "atencao" });
    expect(seloDoContrato({ contrato: contratoDoLead(null, pend([{ papel: "lone", assinou: false }, { papel: "cliente", assinou: false }])), cadastroAprovacao: false, cadastroPendente: false })!.texto)
      .toBe("Contrato: falta cliente e Lone");
  });

  it("renovação enviada depois do assinado volta a 'esperando'; pendente mais velho que a assinatura não conta", () => {
    expect(contratoDoLead("2026-10-01T00:00:00Z", [{ enviado_em: "2026-10-20T00:00:00Z", signatarios: [{ papel: "cliente", assinou: false }] }])!.situacao).toBe("esperando");
    expect(contratoDoLead("2026-10-28T00:00:00Z", [{ enviado_em: "2026-10-20T00:00:00Z", signatarios: [] }])!.situacao).toBe("assinado");
  });

  it("sem documento: cadastro a aprovar, ou contrato não enviado; link ainda não preenchido não ganha selo extra", () => {
    expect(seloDoContrato({ contrato: null, cadastroAprovacao: true, cadastroPendente: false })).toEqual({ texto: "Cadastro a aprovar", tom: "atencao" });
    expect(seloDoContrato({ contrato: null, cadastroAprovacao: false, cadastroPendente: false })).toEqual({ texto: "Contrato não enviado", tom: "neutro" });
    expect(seloDoContrato({ contrato: null, cadastroAprovacao: false, cadastroPendente: true })).toBeNull();
  });
});
