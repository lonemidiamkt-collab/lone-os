// tests/processos-conteudo.test.ts — os processos que a Lone vai seguir são executáveis?
//
// Estes cinco não passam pelo redator (foram escritos à mão a partir do playbook), então a
// validação da IA não os alcança. Se ninguém checar aqui, um passo sem responsável entra em
// produção como se fosse oficial — e processo sem responsável é justamente o que a aba veio
// resolver. É o mesmo padrão do teste do guia de legendas: o conteúdo é código, e código se testa.

import { describe, it, expect } from "vitest";
import { PROCESSOS_INICIAIS } from "@/lib/processos/conteudo-inicial";
import { validarProcesso, podeSalvar } from "@/lib/processos/redator";

describe("processos iniciais", () => {
  it("tem os cinco processos, com código único", () => {
    const codes = PROCESSOS_INICIAIS.map((p) => p.code);
    expect(codes.length).toBeGreaterThanOrEqual(5);
    expect(new Set(codes).size).toBe(codes.length);
  });

  for (const p of PROCESSOS_INICIAIS) {
    describe(`${p.code} — ${p.titulo}`, () => {
      it("tem passo, e todo passo diz o que fazer e quem faz", () => {
        expect(p.passos.length).toBeGreaterThan(0);
        for (const s of p.passos) {
          expect(s.titulo.trim(), `${p.code}: passo sem título`).not.toBe("");
          expect(s.instrucao.trim(), `${p.code}/${s.titulo}: sem instrução`).not.toBe("");
          // SEM RESPONSÁVEL NÃO É PROCESSO. "Alguém confere a arte" é o estado de antes.
          expect(s.papel.trim(), `${p.code}/${s.titulo}: sem responsável`).not.toBe("");
        }
      });

      it("a maioria dos passos pede prova — senão é intenção, não processo", () => {
        const obrigatorios = p.passos.filter((s) => !s.opcional);
        const comProva = obrigatorios.filter((s) => !!s.evidencia?.trim());
        expect(comProva.length / obrigatorios.length).toBeGreaterThanOrEqual(0.5);
      });

      it("responde as perguntas de quem chega: pra quê, quando, e quando está pronto", () => {
        expect(p.objetivo.trim()).not.toBe("");
        expect(p.problema.trim()).not.toBe("");
        expect(p.gatilho.trim()).not.toBe("");
        expect(p.criterioPronto.trim()).not.toBe("");
      });

      it("passa na mesma régua que a IA precisa passar", () => {
        const problemas = validarProcesso({
          titulo: p.titulo, objetivo: p.objetivo, problema: p.problema,
          escopo: p.escopo, foraDeEscopo: p.foraDeEscopo, gatilho: p.gatilho,
          frequencia: p.frequencia, entradas: p.entradas, saidas: p.saidas, preRequisitos: "",
          criterioPronto: p.criterioPronto, criteriosQualidade: p.criteriosQualidade, sla: p.sla,
          passos: p.passos.map((s, i) => ({
            seq: i + 1, titulo: s.titulo, instrucao: s.instrucao, papel: s.papel,
            sistema: s.sistema ?? null, evidencia: s.evidencia ?? null,
            decisao: s.decisao ?? null, opcional: !!s.opcional, slaMinutos: null,
          })),
          kpis: p.kpis ?? [], riscos: [], excecoes: p.excecoes ?? [],
        });
        const bloqueios = problemas.filter((x) => x.gravidade !== "aviso");
        expect(bloqueios, `${p.code}: ${bloqueios.map((b) => b.mensagem).join(" | ")}`).toEqual([]);
        expect(podeSalvar(problemas)).toBe(true);
      });
    });
  }
});
