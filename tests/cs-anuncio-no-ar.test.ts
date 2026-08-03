// tests/cs-anuncio-no-ar.test.ts — cliente novo já está anunciando?
//
// O risco deste aviso é acusar gente à toa. Se a Meta devolve 403 e o Loninho diz "o Julio não
// subiu campanha", o time deixa de confiar no aviso — e aí ele não serve mais pra nada, nem
// quando estiver certo. Por isso a maior parte destes testes é sobre NÃO acusar.

import { describe, it, expect } from "vitest";
import {
  diagnosticar, paraCobrar, textoCobranca, textoIndefinidos, diasDesde, DIAS_PRA_COBRAR,
  type DiagnosticoAnuncio,
} from "@/lib/cs/anuncio-no-ar";

const cliente = (over: Partial<{ id: string; nome: string; criadoEm: string; contaAnuncio: string | null }> = {}) => ({
  id: "c1", nome: "Cliente Novo",
  criadoEm: new Date(Date.now() - 5 * 86400000).toISOString(),
  contaAnuncio: "act_123",
  ...over,
});

describe("diagnóstico", () => {
  it("sem conta vinculada é problema NOSSO — nem precisa perguntar à Meta", async () => {
    const d = await diagnosticar(cliente({ contaAnuncio: null }), "token");
    expect(d.estado).toBe("sem_anuncio");
    expect(d.motivo).toContain("não vinculada");
  });

  it("SEM TOKEN é 'não sei', nunca 'não está anunciando'", async () => {
    const d = await diagnosticar(cliente(), null);
    expect(d.estado).toBe("indefinido");
    // O que não pode acontecer de jeito nenhum:
    expect(d.estado).not.toBe("sem_anuncio");
  });
});

describe("quem entra na cobrança", () => {
  const base = { clientId: "c", cliente: "X", ativas: 0 };

  it("só cobra depois dos 3 dias — cliente de ontem não é atraso", () => {
    const novinho: DiagnosticoAnuncio = { ...base, estado: "sem_anuncio", diasDeCasa: DIAS_PRA_COBRAR - 1 };
    expect(paraCobrar([novinho])).toHaveLength(0);
    const noPrazo: DiagnosticoAnuncio = { ...base, estado: "sem_anuncio", diasDeCasa: DIAS_PRA_COBRAR };
    expect(paraCobrar([noPrazo])).toHaveLength(1);
  });

  it("NUNCA cobra quem ficou indefinido — dúvida não é acusação", () => {
    const duvida: DiagnosticoAnuncio = { ...base, estado: "indefinido", diasDeCasa: 30, motivo: "HTTP 403" };
    expect(paraCobrar([duvida])).toHaveLength(0);
    // …mas o time fica sabendo, num aviso separado.
    expect(textoIndefinidos([duvida])).toContain("Não consegui conferir");
  });

  it("não cobra quem está no ar", () => {
    const ok: DiagnosticoAnuncio = { ...base, estado: "no_ar", diasDeCasa: 30, ativas: 7 };
    expect(paraCobrar([ok])).toHaveLength(0);
  });

  it("mais antigo primeiro — quem espera há mais tempo é o mais urgente", () => {
    const l: DiagnosticoAnuncio[] = [
      { ...base, cliente: "Novo", estado: "sem_anuncio", diasDeCasa: 4 },
      { ...base, cliente: "Antigo", estado: "sem_anuncio", diasDeCasa: 20 },
    ];
    expect(paraCobrar(l)[0].cliente).toBe("Antigo");
  });
});

describe("texto", () => {
  it("ninguém devendo = silêncio", () => {
    expect(textoCobranca([])).toBe("");
    expect(textoIndefinidos([])).toBe("");
  });

  it("diz o motivo certo pra cada caso", () => {
    const t = textoCobranca([
      { clientId: "a", cliente: "Sem Conta", estado: "sem_anuncio", diasDeCasa: 20, motivo: "conta de anúncio não vinculada" },
      { clientId: "b", cliente: "Conta Parada", estado: "sem_anuncio", diasDeCasa: 5, ativas: 0 },
    ]);
    expect(t).toContain("a conta de anúncio nem foi vinculada aqui");
    expect(t).toContain("nenhuma campanha ativa na Meta");
    // Abre espaço pra correção — o dado pode estar errado e quem executa sabe mais que eu.
    expect(t).toContain("me avisa que eu confiro de novo");
  });
});

describe("diasDesde", () => {
  it("data ausente não vira 'entrou hoje' nem quebra", () => {
    expect(diasDesde(null)).toBe(0);
  });
});
