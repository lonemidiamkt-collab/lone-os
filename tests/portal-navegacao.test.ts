// tests/portal-navegacao.test.ts — áreas, período único e endereço do Painel de Resultados (lib/portal/navegacao.ts)
// e o manifesto de cada link (lib/portal/manifesto.ts). 19/11/2026.

import { describe, expect, it } from "vitest";
import {
  abaValida, abasDisponiveis, buscaDoPortal, diasDoPeriodo, paraPeriodKind, paraPeriodoIg, periodoValido,
} from "@/lib/portal/navegacao";
import { manifestoDoPortal } from "@/lib/portal/manifesto";
import { iniciais } from "@/components/portal/PortalCasco";

describe("áreas do cliente", () => {
  it("ordem fixa, só o que ele tem", () => {
    expect(abasDisponiveis({ hasAds: true, hasGoogle: true, hasCrm: true, hasSocial: true })).toEqual(["ads", "google", "crm", "social", "conteudo"]);
    expect(abasDisponiveis({ hasGoogle: true })).toEqual(["google"]);
    expect(abasDisponiveis({})).toEqual([]);
  });

  it("área do endereço só vale se o cliente tem; senão abre a primeira dele", () => {
    expect(abaValida("google", ["ads", "google"])).toBe("google");
    expect(abaValida("crm", ["ads", "google"])).toBe("ads");
    expect(abaValida("qualquer-coisa", ["social", "conteudo"])).toBe("social");
    expect(abaValida(undefined, [])).toBe("social");
  });
});

describe("período único", () => {
  it("vale se a fonte da área responde; senão 7 dias", () => {
    expect(periodoValido("hoje", "ads")).toBe("hoje");
    expect(periodoValido("hoje", "google")).toBe("7d");
    expect(periodoValido("30d", "social")).toBe("30d");
    expect(periodoValido("30d", "ads")).toBe("7d");
    expect(periodoValido("mes", "social")).toBe("7d");
    expect(periodoValido("ontem", "ads")).toBe("7d");
    expect(periodoValido(null, "ads")).toBe("7d");
  });

  it("área sem filtro só carrega o período adiante", () => {
    expect(periodoValido("14d", "conteudo")).toBe("14d");
    expect(periodoValido("mes", "crm")).toBe("mes");
  });

  it("conversão para cada fonte", () => {
    expect(paraPeriodKind("hoje")).toBe("today");
    expect(paraPeriodKind("mes-passado")).toBe("last_month");
    expect(paraPeriodKind("30d")).toBe("last_week");
    expect(paraPeriodoIg("14d")).toBe("14d");
    expect(paraPeriodoIg("mes")).toBe("7d");
    expect(diasDoPeriodo("7d")).toBe(7);
    expect(diasDoPeriodo("mes")).toBe(30);
  });
});

describe("endereço", () => {
  it("o padrão (primeira área, 7 dias) não aparece", () => {
    expect(buscaDoPortal("", "ads", "7d", "ads")).toBe("");
    expect(buscaDoPortal("?aba=google&p=14d", "ads", "7d", "ads")).toBe("");
  });

  it("área e período fora do padrão vão para o endereço", () => {
    expect(buscaDoPortal("", "google", "14d", "ads")).toBe("?aba=google&p=14d");
    expect(buscaDoPortal("", "ads", "mes-passado", "ads")).toBe("?p=mes-passado");
  });

  it("área sem filtro não leva período; outros parâmetros ficam", () => {
    expect(buscaDoPortal("?p=14d", "conteudo", "14d", "ads")).toBe("?aba=conteudo");
    expect(buscaDoPortal("?cliente=x", "google", "7d", "ads")).toBe("?cliente=x&aba=google");
  });
});

describe("manifesto do link", () => {
  it("abre no painel do cliente, não no login da equipe", () => {
    const m = manifestoDoPortal("abc123", "Império dos Pisos");
    expect(m.start_url).toBe("/portal/abc123");
    expect(m.scope).toBe("/portal/abc123");
    expect(m.name).toBe("Resultados · Império dos Pisos");
    expect(m.short_name).toBe("Resultados");
    expect(m.display).toBe("standalone");
  });

  it("ícone comum e mascarável declarados separados", () => {
    const m = manifestoDoPortal("t", "Loja");
    expect(m.icons.every((i) => i.purpose === "any" || i.purpose === "maskable")).toBe(true);
    expect(m.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("nome vazio não deixa o aplicativo sem nome", () => {
    expect(manifestoDoPortal("t", "  ").name).toBe("Resultados · Cliente");
  });
});

describe("iniciais do cliente no menu", () => {
  it("primeira e última palavra, pulando 'dos', 'da'", () => {
    expect(iniciais("Império dos Pisos")).toBe("IP");
    expect(iniciais("Loja")).toBe("L");
    expect(iniciais("casa das telhas")).toBe("CT");
  });
});
