import { describe, it, expect } from "vitest";
import { faltandoNaEtapa, destinoPermitido, limiteDoDocumento, MB } from "@/lib/onboarding/etapas";

const tudoOk = {} as Record<string, boolean>;
const semDocs = { docLogo: true, docContrato: true };
const semCnpj = { cnpj: true };

describe("cada etapa confere o que é dela (cliente DOMINOS, 21/10)", () => {
  it("documentos sem logo e contrato social não passam", () => {
    expect(faltandoNaEtapa("documentos", semDocs)).toEqual(["Logo da empresa", "Contrato social ou cartão CNPJ"]);
    expect(faltandoNaEtapa("documentos", tudoOk)).toEqual([]);
  });
  it("faltas de outra etapa não travam esta", () => {
    expect(faltandoNaEtapa("acessos", semDocs)).toEqual([]);
    expect(faltandoNaEtapa("dados", semDocs)).toEqual([]);
  });
  it("aba do topo não pula etapa incompleta; voltar é livre", () => {
    expect(destinoPermitido("dados", "review", semDocs)).toBe("documentos");
    expect(destinoPermitido("dados", "acessos", semCnpj)).toBe("dados");
    expect(destinoPermitido("acessos", "dados", semCnpj)).toBe("dados");
    expect(destinoPermitido("dados", "review", tudoOk)).toBe("review");
  });
  it("contrato social e documento com foto até 30 MB; logo até 10 MB", () => {
    expect(limiteDoDocumento("contrato_social")).toBe(30 * MB);
    expect(limiteDoDocumento("identidade")).toBe(30 * MB);
    expect(limiteDoDocumento("logo")).toBe(10 * MB);
  });
});
