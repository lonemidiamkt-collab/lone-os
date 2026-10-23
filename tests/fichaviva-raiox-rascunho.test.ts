// tests/fichaviva-raiox-rascunho.test.ts — o Raio-X do link do cliente não pode se perder (auditoria
// de erro recuperável, 21/10/2026, item 1.3).
//
// O que acontecia: trocar de aba ou recarregar apagava as respostas; "atualizar" abria VAZIO e cada
// envio virava uma linha nova — a mais recente (a única que o time lê) ficava só com o que o cliente
// lembrou de redigitar.

import { describe, it, expect } from "vitest";
import {
  normalizarRespostas, respostasIguais, decidirGravacao, lerRascunho, salvarRascunho, apagarRascunho,
  escolherInicio, chaveRascunho, MAX_RESPOSTA, type Armazenamento,
} from "@/lib/fichaViva/raiox";

const TOKEN = "11111111-2222-3333-4444-555555555555";

function memoria(): Armazenamento & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return {
    dados,
    getItem: (k) => dados.get(k) ?? null,
    setItem: (k, v) => { dados.set(k, v); },
    removeItem: (k) => { dados.delete(k); },
  };
}
const quebrado: Armazenamento = {
  getItem: () => { throw new Error("SecurityError"); },
  setItem: () => { throw new Error("QuotaExceededError"); },
  removeItem: () => { throw new Error("SecurityError"); },
};

describe("respostas: só o que o servidor aceita", () => {
  it("descarta id desconhecido, não-texto e vazio; apara e corta no teto", () => {
    const r = normalizarRespostas({ produto: "  piso  ", inventado: "x", meta: 123, gargalo: "   ", processo: "a".repeat(MAX_RESPOSTA + 50) });
    expect(r).toEqual({ produto: "piso", processo: "a".repeat(MAX_RESPOSTA) });
  });

  it("iguais ignoram espaço e campo vazio", () => {
    expect(respostasIguais({ produto: "piso " , meta: "" }, { produto: "piso" })).toBe(true);
    expect(respostasIguais({ produto: "piso" }, { produto: "porcelanato" })).toBe(false);
  });
});

describe("envio: atualiza em vez de duplicar", () => {
  const anterior = { id: "d1", respostas: { produto: "piso", meta: "R$ 70 mil" }, status: "respondido" };

  it("primeiro envio: insere", () => {
    expect(decidirGravacao(null, { produto: "piso" }, "full")).toEqual({ acao: "inserir", respostas: { produto: "piso" } });
  });

  it("dono reenviando com o formulário pré-carregado: ATUALIZA a mesma linha (era o bug: linha nova)", () => {
    const g = decidirGravacao(anterior, { produto: "piso", meta: "R$ 90 mil", gargalo: "leads" }, "full");
    expect(g).toEqual({ acao: "atualizar", id: "d1", respostas: { produto: "piso", meta: "R$ 90 mil", gargalo: "leads" } });
  });

  it("dono apagando um campo: apaga mesmo (ele viu tudo antes de enviar)", () => {
    const g = decidirGravacao(anterior, { produto: "piso" }, "full");
    expect(g).toEqual({ acao: "atualizar", id: "d1", respostas: { produto: "piso" } });
  });

  it("vendedor (link sem PIN, não vê a anterior): o que manda COMPLETA, campo em branco não apaga", () => {
    const g = decidirGravacao(anterior, { gargalo: "leads", meta: "" }, "raiox");
    expect(g).toEqual({ acao: "atualizar", id: "d1", respostas: { produto: "piso", meta: "R$ 70 mil", gargalo: "leads" } });
  });

  it("nada mudou: não grava de novo", () => {
    expect(decidirGravacao(anterior, { produto: "piso ", meta: "R$ 70 mil" }, "full")).toEqual({ acao: "igual", id: "d1" });
  });

  it("já analisada pelo time: entra como versão nova (a análise fica presa às respostas que leu)", () => {
    const g = decidirGravacao({ ...anterior, status: "analisado" }, { produto: "piso", meta: "R$ 90 mil" }, "full");
    expect(g).toEqual({ acao: "inserir", respostas: { produto: "piso", meta: "R$ 90 mil" } });
  });

  it("tudo em branco: recusa (não apaga o diagnóstico)", () => {
    expect(decidirGravacao(anterior, { produto: "  " }, "full")).toEqual({ acao: "vazio" });
    expect(decidirGravacao(anterior, {}, "raiox")).toEqual({ acao: "vazio" });
  });
});

describe("rascunho no aparelho", () => {
  it("guarda, lê de volta e apaga", () => {
    const arm = memoria();
    expect(salvarRascunho(arm, TOKEN, { produto: "piso" }, new Date("2026-10-21T12:00:00Z"))).toBe(true);
    expect(lerRascunho(arm, TOKEN)).toEqual({ respostas: { produto: "piso" }, salvoEm: "2026-10-21T12:00:00.000Z" });
    apagarRascunho(arm, TOKEN);
    expect(lerRascunho(arm, TOKEN)).toBeNull();
  });

  it("apagar tudo do formulário limpa o rascunho em vez de guardar vazio", () => {
    const arm = memoria();
    salvarRascunho(arm, TOKEN, { produto: "piso" });
    salvarRascunho(arm, TOKEN, { produto: "" });
    expect(arm.dados.has(chaveRascunho(TOKEN))).toBe(false);
  });

  it("navegador que bloqueia armazenamento: não quebra, só diz que não guardou", () => {
    expect(salvarRascunho(quebrado, TOKEN, { produto: "piso" })).toBe(false);
    expect(lerRascunho(quebrado, TOKEN)).toBeNull();
    expect(() => apagarRascunho(quebrado, TOKEN)).not.toThrow();
    expect(salvarRascunho(null, TOKEN, { produto: "piso" })).toBe(false);
  });

  it("rascunho corrompido é ignorado", () => {
    const arm = memoria();
    arm.setItem(chaveRascunho(TOKEN), "{não é json");
    expect(lerRascunho(arm, TOKEN)).toBeNull();
  });
});

describe("com o que o formulário abre", () => {
  const enviadas = { produto: "piso", meta: "R$ 70 mil" };

  it("'atualizar' abre com a última resposta enviada, não vazio (era o bug)", () => {
    expect(escolherInicio({ rascunho: null, enviadas, enviadasEm: "2026-10-20T10:00:00Z" }))
      .toEqual({ respostas: enviadas, origem: "enviadas" });
  });

  it("recarregou no meio: o rascunho mais novo que o envio volta", () => {
    const rascunho = { respostas: { ...enviadas, gargalo: "leads" }, salvoEm: "2026-10-21T10:00:00Z" };
    expect(escolherInicio({ rascunho, enviadas, enviadasEm: "2026-10-20T10:00:00Z" }))
      .toEqual({ respostas: rascunho.respostas, origem: "rascunho" });
  });

  it("rascunho velho (antes de um envio feito em outro aparelho) não passa por cima do enviado", () => {
    const rascunho = { respostas: { produto: "rascunho velho" }, salvoEm: "2026-10-19T10:00:00Z" };
    expect(escolherInicio({ rascunho, enviadas, enviadasEm: "2026-10-20T10:00:00Z" }).origem).toBe("enviadas");
  });

  it("link do vendedor (sem respostas anteriores) com rascunho: abre o rascunho", () => {
    const rascunho = { respostas: { gargalo: "leads" }, salvoEm: "2026-10-21T10:00:00Z" };
    expect(escolherInicio({ rascunho, enviadas: null, enviadasEm: "2026-10-20T10:00:00Z" }).origem).toBe("rascunho");
  });

  it("nada guardado: vazio", () => {
    expect(escolherInicio({ rascunho: null, enviadas: null, enviadasEm: null })).toEqual({ respostas: {}, origem: "vazio" });
  });
});
