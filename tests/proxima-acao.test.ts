// Leva 6A — a próxima ação de cada cliente é preenchida pelo sistema (o feed de prioridades) e a pessoa
// só confirma ou edita. A mesma função serve a Saúde da carteira, a ficha do cliente e a API.

import { describe, it, expect } from "vitest";
import {
  ACAO_SAUDE, ehColunaAusente, patchConcluir, patchConfirmar, patchEditar, proximaAcaoDoCliente,
  registradaDaLinha, semColunasNovas, sugestaoDoSistema, type RecomendacaoDoCliente,
} from "@/lib/clientes/proxima-acao";

const HOJE = "2026-09-25";

const rec = (o: Partial<RecomendacaoDoCliente> & { id: string }): RecomendacaoDoCliente => ({
  fingerprint: `fp-${o.id}`, fonte: "trafego", titulo: `Título ${o.id}`, recomendacao: `Fazer ${o.id}`,
  fato: [`Fato de ${o.id}`], score: 50, owner: null, ...o,
});

describe("sugestão do sistema", () => {
  it("é a recomendação aberta de maior score do cliente, com o fato como porquê", () => {
    const s = sugestaoDoSistema({
      recomendacoes: [rec({ id: "a", score: 40 }), rec({ id: "b", score: 72, fonte: "producao", owner: "Carlos Augusto" })],
      saude: { nivel: "risco", esfriando: false, motivos: ["Relacionamento em 30"] },
      dono: "Thiago",
    });
    expect(s).toEqual({
      texto: "Fazer b", porque: "Fato de b", fonte: "Produção", responsavel: "Carlos Augusto", recomendacaoId: "b", fingerprint: "fp-b",
    });
  });

  it("sem recomendação, vem da saúde (o mesmo texto da fonte 'saude' do feed)", () => {
    expect(sugestaoDoSistema({ recomendacoes: [], saude: { nivel: "risco", esfriando: false, motivos: ["Sentimento em 40"] }, dono: "Thiago" }))
      .toMatchObject({ texto: ACAO_SAUDE.risco, porque: "Sentimento em 40", responsavel: "Thiago", fingerprint: null });
    expect(sugestaoDoSistema({ recomendacoes: [], saude: { nivel: "atencao", esfriando: true } })!.texto).toBe(ACAO_SAUDE.atencao);
    expect(sugestaoDoSistema({ recomendacoes: [], saude: { nivel: "saudavel", esfriando: true } })!.texto).toBe(ACAO_SAUDE.esfriando);
    expect(sugestaoDoSistema({ recomendacoes: [], saude: { nivel: "saudavel", esfriando: false } })).toBeNull();
    expect(sugestaoDoSistema({ recomendacoes: [], saude: { nivel: "sem_dado", esfriando: false } })).toBeNull();
  });

  it("pausado não recebe sugestão de contato", () => {
    expect(sugestaoDoSistema({ recomendacoes: [rec({ id: "a" })], saude: { nivel: "risco", esfriando: true, pausado: true } })).toBeNull();
  });
});

describe("proximaAcaoDoCliente", () => {
  it("sem nada gravado: a sugestão aparece como SUGERIDA", () => {
    const pa = proximaAcaoDoCliente({ registrada: null, recomendacoes: [rec({ id: "a" })], hoje: HOJE, dono: "Thiago" });
    expect(pa).toMatchObject({ estado: "sugerida", texto: "Fazer a", origem: "sistema", fonte: "Tráfego", recomendacaoId: "a", responsavel: "Thiago" });
  });

  it("gravada vence a sugestão; a sugestão diferente vira 'outra sugestão' (trocar)", () => {
    const registrada = registradaDaLinha({ client_id: "c", proxima_acao: "Levar o relatório na reunião", proxima_acao_prazo: "2026-09-20" });
    const pa = proximaAcaoDoCliente({ registrada, recomendacoes: [rec({ id: "a" })], hoje: HOJE });
    expect(pa).toMatchObject({ estado: "confirmada", texto: "Levar o relatório na reunião", origem: "pessoa", vencida: true, prazo: "2026-09-20" });
    expect(pa.outraSugestao).toMatchObject({ texto: "Fazer a", fingerprint: "fp-a" });
  });

  it("confirmada a partir da mesma recomendação: sem 'outra sugestão', com o fato e a fonte dela", () => {
    const registrada = registradaDaLinha({
      proxima_acao: "Fazer a", proxima_acao_origem: "sugerida", proxima_acao_fingerprint: "fp-a",
      proxima_acao_confirmada_por: "Julio", proxima_acao_confirmada_em: "2026-09-24T13:00:00Z",
    });
    const pa = proximaAcaoDoCliente({ registrada, recomendacoes: [rec({ id: "a" })], hoje: HOJE });
    expect(pa).toMatchObject({
      estado: "confirmada", origem: "sistema", porque: "Fato de a", fonte: "Tráfego", recomendacaoId: "a",
      confirmadaPor: "Julio", confirmadaEm: "2026-09-24T13:00:00Z", outraSugestao: null, vencida: false,
    });
  });

  it("escrita igual à sugestão (mesmo texto) não oferece trocar pela mesma coisa", () => {
    const registrada = registradaDaLinha({ proxima_acao: "  fazer   A " });
    expect(proximaAcaoDoCliente({ registrada, recomendacoes: [rec({ id: "a" })], hoje: HOJE }).outraSugestao).toBeNull();
  });

  it("saudável, falando no grupo e sem nada no feed: nenhuma", () => {
    const pa = proximaAcaoDoCliente({ registrada: registradaDaLinha({ proxima_acao: "  " }), recomendacoes: [], saude: { nivel: "saudavel", esfriando: false }, hoje: HOJE, dono: "Thiago" });
    expect(pa).toMatchObject({ estado: "nenhuma", texto: null, responsavel: "Thiago" });
  });
});

describe("gravação em client_journey", () => {
  const agora = "2026-09-25T15:00:00.000Z";

  it("confirmar guarda o texto da sugestão, de onde veio, quem e quando", () => {
    const s = sugestaoDoSistema({ recomendacoes: [rec({ id: "a", owner: "Carlos Augusto" })] })!;
    expect(patchConfirmar(s, "Julio", agora)).toEqual({
      proxima_acao: "Fazer a", proxima_acao_responsavel: "Carlos Augusto", proxima_acao_prazo: null, proxima_acao_origem: "sugerida",
      proxima_acao_fingerprint: "fp-a", proxima_acao_confirmada_por: "Julio", proxima_acao_confirmada_em: agora,
    });
  });

  it("editar é confirmar: texto da pessoa, prazo só se for data válida", () => {
    const p = patchEditar({ texto: "  Ligar amanhã ", responsavel: "", prazo: "30/09" }, "Julio", agora);
    expect(p).toMatchObject({ proxima_acao: "Ligar amanhã", proxima_acao_responsavel: null, proxima_acao_prazo: null, proxima_acao_origem: "manual", proxima_acao_fingerprint: null });
    expect(patchEditar({ texto: "x", prazo: "2026-09-30" }, "Julio", agora).proxima_acao_prazo).toBe("2026-09-30");
  });

  it("feita limpa tudo — a próxima sugestão aparece sozinha", () => {
    expect(Object.values(patchConcluir()).every((v) => v === null)).toBe(true);
  });

  it("sem a migration, grava só as colunas antigas", () => {
    const s = sugestaoDoSistema({ recomendacoes: [rec({ id: "a" })] })!;
    expect(semColunasNovas(patchConfirmar(s, "Julio", agora))).toEqual({ proxima_acao: "Fazer a", proxima_acao_responsavel: null, proxima_acao_prazo: null });
    expect(ehColunaAusente("Could not find the 'proxima_acao_origem' column of 'client_journey' in the schema cache")).toBe(true);
    expect(ehColunaAusente('column client_journey.proxima_acao_confirmada_por does not exist')).toBe(true);
    expect(ehColunaAusente("duplicate key value violates unique constraint")).toBe(false);
  });

  it("linha antiga (antes da migration) vira 'escrita por alguém'", () => {
    expect(registradaDaLinha({ proxima_acao: "Cobrar aprovação", proxima_acao_responsavel: "Thiago" }))
      .toEqual({ texto: "Cobrar aprovação", responsavel: "Thiago", prazo: null, origem: null, confirmadaPor: null, confirmadaEm: null, fingerprint: null });
    expect(registradaDaLinha(null)).toBeNull();
  });
});
