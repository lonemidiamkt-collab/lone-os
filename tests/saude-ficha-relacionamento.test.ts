// tests/saude-ficha-relacionamento.test.ts — a ficha de relacionamento não apaga o que não carregou
// (auditoria 25/10/2026, 11.3).
//
// O erro original: client_journey falhava, a ficha abria vazia e editável e o "Salvar" gravava
// pendências [] e notas null — sumia a nota de handoff do comercial. E mesmo com a leitura certa, o
// "Salvar" mandava todos os campos e sobrescrevia o que outra pessoa tinha mudado.

import { describe, it, expect } from "vitest";
import { alteracoesDaFicha, aplicarNaFicha, formDaFicha } from "@/lib/saude/ficha-relacionamento";
import { montarCarteira, type ClienteSaudeRow } from "@/lib/saude/montar";
import type { Relacionamento } from "@/lib/saude/tipos";

const REL: Relacionamento = {
  estadoManual: "Engajado",
  pendenciasCliente: [{ item: "logo em alta", desde: "2026-10-01", impacto: "trava a arte" }, { item: "senha do Instagram" }],
  ultimaReuniao: "2026-10-10",
  proximaReuniao: null,
  notas: "Handoff do comercial: fechou em 12 meses, contato com a Ana.",
};

describe("só vai o que mudou", () => {
  it("abrir e salvar sem mexer não grava nada", () => {
    expect(alteracoesDaFicha(REL, formDaFicha(REL)).patch).toEqual({});
  });

  it("mudar só a próxima reunião não manda as notas (o handoff não é tocado)", () => {
    const { patch } = alteracoesDaFicha(REL, { ...formDaFicha(REL), proxima: "2026-11-05" });
    expect(patch).toEqual({ proximaReuniao: "2026-11-05" });
  });

  it("apagar as notas é uma escolha explícita (vira null), não efeito colateral", () => {
    expect(alteracoesDaFicha(REL, { ...formDaFicha(REL), notas: "  " }).patch).toEqual({ notas: null });
  });

  it("pendências: só quando a lista muda, e mantém 'desde' e 'impacto' de quem já estava", () => {
    const { patch } = alteracoesDaFicha(REL, { ...formDaFicha(REL), pendencias: "logo em alta\nsenha do Instagram\nfotos da loja" });
    expect(patch.pendenciasCliente).toEqual([
      { item: "logo em alta", desde: "2026-10-01", impacto: "trava a arte" }, { item: "senha do Instagram" }, { item: "fotos da loja" },
    ]);
    // Só espaço/caixa diferente não é mudança.
    expect(alteracoesDaFicha(REL, { ...formDaFicha(REL), pendencias: " Logo em alta \nsenha do instagram" }).patch).toEqual({});
  });

  it("o que outra pessoa mudou num campo que esta não tocou continua o dela", () => {
    const outraPessoa: Relacionamento = { ...REL, notas: "Nota nova da Ana" };
    const { patch } = alteracoesDaFicha(REL, { ...formDaFicha(REL), ultima: "2026-10-20" });
    expect(aplicarNaFicha(outraPessoa, patch)).toEqual({ ...outraPessoa, ultimaReuniao: "2026-10-20" });
  });
});

describe("jornada que não foi lida não vira ficha vazia e editável", () => {
  const AGORA = new Date("2026-10-25T15:00:00Z");
  const cliente = (p: Partial<ClienteSaudeRow>): ClienteSaudeRow => ({
    id: "c1", name: "Padaria", status: "good", active: true, created_at: "2026-01-01T00:00:00Z",
    assigned_social: "Carlos", ...p,
  } as ClienteSaudeRow);
  const base = {
    agora: AGORA, time: [{ nome: "Carlos", papel: "social" as const }], historico: [], recomendacoes: [],
    clientes: [cliente({})], jornadas: [] as Record<string, unknown>[], viewer: { nome: "Julio", papel: "manager" as const },
  };

  it("o erro original: com a leitura falhando, a gestão recebia uma ficha vazia (e editável)", () => {
    const lida = montarCarteira(base).linhas[0];
    // Leitura certa sem linha no banco: ficha vazia é legítima (cliente novo).
    expect(lida.relacionamento).not.toBeNull();
    const falhou = montarCarteira({ ...base, jornadaNaoLida: true }).linhas[0];
    expect(falhou.relacionamento).toBeNull();
    expect(falhou.relacionamentoNaoLido).toBe(true);
  });

  it("e a próxima ação fica só de leitura (gravar por cima apagaria a confirmada)", () => {
    expect(montarCarteira(base).linhas[0].podeEditar).toBe(true);
    expect(montarCarteira({ ...base, jornadaNaoLida: true }).linhas[0].podeEditar).toBe(false);
  });

  it("quem não é da gestão não recebe nem o aviso (a ficha nunca foi dele)", () => {
    const social = montarCarteira({ ...base, jornadaNaoLida: true, viewer: { nome: "Carlos", papel: "social" } }).linhas[0];
    expect(social.relacionamentoNaoLido).toBeUndefined();
  });
});
