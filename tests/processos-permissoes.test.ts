// Teste OFFLINE das permissões do Hub de Processos.
// Permissão é o que mais falha em silêncio: a tela esconde o botão, a pessoa acha que está
// protegido, e a rota continua aberta. Aqui a regra é testada isolada.
import { describe, it, expect } from "vitest";
import { pode, areasQuePodeCriar } from "@/lib/processos/permissoes";

describe("ver — processo escondido é processo não seguido", () => {
  it("todo papel com login enxerga qualquer área", () => {
    for (const p of ["admin", "manager", "traffic", "social", "designer", "comercial"] as const) {
      expect(pode(p, "ver", "traffic")).toBe(true);
      expect(pode(p, "ver", "cs")).toBe(true);
    }
  });

  it("sem papel não vê nada", () => {
    expect(pode(null, "ver", "social")).toBe(false);
  });
});

describe("publicar — dizer 'é assim que a Lone trabalha' é da gestão", () => {
  it("admin e manager publicam", () => {
    expect(pode("admin", "publicar", "social")).toBe(true);
    expect(pode("manager", "publicar", "traffic")).toBe(true);
  });

  it("social NÃO publica, nem na própria área", () => {
    expect(pode("social", "publicar", "social")).toBe(false);
  });

  it("ninguém do time descontinua processo", () => {
    expect(pode("traffic", "descontinuar", "traffic")).toBe(false);
    expect(pode("designer", "descontinuar", "social")).toBe(false);
    expect(pode("admin", "descontinuar", "social")).toBe(true);
  });
});

describe("criar — cada um escreve da sua área", () => {
  it("social cria processo de social e de CS, mas NÃO de tráfego", () => {
    expect(pode("social", "criar", "social")).toBe(true);
    expect(pode("social", "criar", "cs")).toBe(true);
    expect(pode("social", "criar", "traffic")).toBe(false);
  });

  it("tráfego cria o de tráfego e não mexe no social", () => {
    expect(pode("traffic", "criar", "traffic")).toBe(true);
    expect(pode("traffic", "criar", "social")).toBe(false);
  });

  it("designer participa dos processos de social (é quem executa parte deles)", () => {
    expect(pode("designer", "criar", "social")).toBe(true);
    expect(pode("designer", "criar", "comercial")).toBe(false);
  });

  it("área geral é da gestão — ninguém do time escreve regra da casa inteira", () => {
    expect(pode("social", "criar", "geral")).toBe(false);
    expect(pode("admin", "criar", "geral")).toBe(true);
  });
});

describe("areasQuePodeCriar — a tela não pode prometer o que a rota nega", () => {
  it("gestão vê todas", () => {
    expect(areasQuePodeCriar("admin")).toHaveLength(5);
  });

  it("social vê social e cs", () => {
    expect(areasQuePodeCriar("social").sort()).toEqual(["cs", "social"]);
  });

  it("comercial vê só a dele", () => {
    expect(areasQuePodeCriar("comercial")).toEqual(["comercial"]);
  });
});
