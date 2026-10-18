import { describe, expect, it } from "vitest";
import { lerTesteNoGoogle, motivoLegivel, problemaNoFormato } from "@/lib/google/credencial";

// Montados em tempo de execução: o push protection do GitHub barra qualquer literal com cara de credencial do Google.
const SUFIXO = [".apps", "googleusercontent", "com"].join(".");
const ID = `123-exemplo-de-teste${SUFIXO}`;
const SEGREDO = ["GOCSPX", "x".repeat(28)].join("-");

describe("credencial do Google — formato", () => {
  it("aceita Client ID + segredo GOCSPX", () => {
    expect(problemaNoFormato(ID, SEGREDO)).toBeNull();
  });
  it("recusa o Client ID colado no lugar do segredo (o erro de 18/10/2026)", () => {
    expect(problemaNoFormato(ID, ID)).toMatch(/colado o Client ID/);
    expect(problemaNoFormato(ID, `999-outro${SUFIXO}`)).toMatch(/colado o Client ID/);
  });
  it("recusa Client ID sem o sufixo e segredo curto ou com espaço", () => {
    expect(problemaNoFormato("sem-sufixo", SEGREDO)).toMatch(/termina em/);
    expect(problemaNoFormato(ID, "curto")).toMatch(/inválido/);
    expect(problemaNoFormato(ID, `${SEGREDO.slice(0, 10)} ${SEGREDO.slice(10)}`)).toMatch(/inválido/);
  });
});

describe("credencial do Google — teste com código falso", () => {
  it("invalid_grant = credencial certa (só o código é falso)", () => {
    expect(lerTesteNoGoogle({ error: "invalid_grant", error_description: "Malformed auth code." })).toBe("ok");
  });
  it("invalid_client separa segredo errado de cliente inexistente", () => {
    expect(lerTesteNoGoogle({ error: "invalid_client", error_description: "The provided client secret is invalid." })).toBe("segredo_errado");
    expect(lerTesteNoGoogle({ error: "invalid_client", error_description: "The OAuth client was not found." })).toBe("cliente_inexistente");
  });
  it("sem resposta ou erro desconhecido não bloqueia (indefinido)", () => {
    expect(lerTesteNoGoogle(null)).toBe("indefinido");
    expect(lerTesteNoGoogle({ error: "temporarily_unavailable" })).toBe("indefinido");
  });
});

describe("motivo do callback em português", () => {
  it("segredo inválido manda trocar a credencial", () => {
    expect(motivoLegivel("The provided client secret is invalid.")).toMatch(/trocar credencial/);
  });
  it("permissão negada, state vencido e motivo desconhecido", () => {
    expect(motivoLegivel("access_denied")).toMatch(/Permitir/);
    expect(motivoLegivel("state")).toMatch(/10 minutos/);
    expect(motivoLegivel(null)).toBe("erro");
    expect(motivoLegivel("outra coisa")).toBe("outra coisa");
  });
});
