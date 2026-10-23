// Reimportar o arquivo do comercial (auditoria 21/10/2026, 4.2). Dados INVENTADOS: o repositório é público.
//
// O QUE ACONTECIA: lead que já estava no funil recebia a negociação do arquivo POR CIMA — o Ganho voltava
// para Negociação, a mensalidade acertada voltava para a do arquivo — e a prévia só dizia "atualizar".
// Agora a prévia mostra campo a campo (de → para), a etapa só avança, negócio fechado não muda e o que
// não entra aparece com o motivo. E a gravação escreve só o que a prévia mostrou.
import { describe, it, expect, vi, beforeEach } from "vitest";

const gravados: { id: string; patch: Record<string, unknown> }[] = [];
vi.mock("@/lib/supabase/queries", () => ({
  updateCrmLead: async (id: string, patch: Record<string, unknown>) => { gravados.push({ id, patch }); return { id }; },
  insertCrmLead: async () => ({ id: "novo-1" }),
}));
const atividades: unknown[] = [];
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: { from: () => ({ insert: async (r: unknown) => { atividades.push(r); return { error: null }; } }) },
}));

const { planejarImportacao, compararNegociacao } = await import("@/lib/crm/importar");
const { gravarPlano } = await import("@/lib/crm/gravar-plano");

const lead = (o: Record<string, unknown>) => ({
  id: "l1", empresa: "Loja Exemplo", contatoNome: "Ana", telefone: null, rotaLojaId: null, externoId: null,
  estagio: "contato", valorOrcamento: null, probabilidade: null, retomarEm: null, ...o,
});
const plano = (existentes: ReturnType<typeof lead>[], oportunidade: Record<string, unknown>) =>
  planejarImportacao({ dados: { oportunidades: [{ empresa: "Loja Exemplo", ...oportunidade }] }, existentes, clientes: [], hoje: "2026-10-21" });

beforeEach(() => { gravados.length = 0; atividades.length = 0; });

describe("reimportar: lead GANHO", () => {
  const p = plano([lead({ estagio: "ganho", valorOrcamento: 1500, probabilidade: 1 })], { etapa_sugerida: "negociacao", mensalidade: 2000, probabilidade: 0.6 });
  const linha = p.linhas[0];

  it("não volta para Negociação nem troca a mensalidade: nada é aplicado", () => {
    expect(linha.acao).toBe("ignorar");
    expect(linha.mudancas).toEqual([]);
    expect(linha.atividades).toEqual([]); // nem a nota de situação se repete
  });
  it("a prévia diz o que ficou de fora e por quê", () => {
    const etapa = linha.naoAplicado.find((n) => n.campo === "estagio")!;
    expect(etapa).toMatchObject({ atual: "Ganho", arquivo: "Negociação" });
    expect(etapa.motivo).toMatch(/já fechado \(Ganho\).*não reabre/);
    const valor = linha.naoAplicado.find((n) => n.campo === "valorOrcamento")!;
    expect(valor.atual).toMatch(/1\.500/);
    expect(valor.arquivo).toMatch(/2\.000/);
    expect(linha.motivo).toMatch(/nada do arquivo foi aplicado/);
    expect(p.totais).toMatchObject({ atualizar: 0, mensalidade: 0 });
  });
  it("a gravação não toca no lead", async () => {
    const r = await gravarPlano(p.linhas);
    expect(r.atualizados).toBe(0);
    expect(gravados).toEqual([]);
    expect(atividades).toEqual([]);
  });
  it("vale também para a loja da rota que já virou negócio fechado", () => {
    const daRota = planejarImportacao({
      dados: {
        lojas_rota: [{ rota_loja_id: 7, empresa: "Loja Exemplo", telefone: "5522998765432", visitada_em: "2026-10-10T14:00:00Z" }],
        oportunidades: [{ empresa: "Loja Exemplo", etapa_sugerida: "proposta", rota_loja_id: 7 }],
      },
      existentes: [lead({ rotaLojaId: 7, estagio: "perdido" })], clientes: [], hoje: "2026-10-21",
    });
    expect(daRota.linhas[0].acao).toBe("ignorar");
    expect(daRota.linhas[0].naoAplicado[0].motivo).toMatch(/já fechado \(Perdido\)/);
  });
});

describe("reimportar: lead em aberto", () => {
  it("avança a etapa e preenche o vazio, com de → para; grava só isso", async () => {
    const p = plano([lead({ estagio: "contato" })], { etapa_sugerida: "negociacao", mensalidade: 1000 });
    const linha = p.linhas[0];
    expect(linha.acao).toBe("atualizar");
    expect(linha.mudancas.map((m) => [m.rotulo, m.de, m.para])).toEqual([
      ["Etapa", "Contato feito", "Negociação"],
      ["Mensalidade", "—", expect.stringMatching(/1\.000\/mês/)],
    ]);
    expect(p.totais.mensalidade).toBe(1000);
    await gravarPlano(p.linhas);
    expect(gravados).toHaveLength(1);
    expect(Object.keys(gravados[0].patch).sort()).toEqual(["estagio", "etapaDesde", "valorOrcamento"]);
    expect(gravados[0].patch).toMatchObject({ estagio: "negociacao", valorOrcamento: 1000 });
  });
  it("nunca volta etapa; valor já preenchido não é trocado — e a prévia diz", async () => {
    const p = plano([lead({ estagio: "negociacao", valorOrcamento: 1500 })], { etapa_sugerida: "contato", mensalidade: 2000, retomar_em: "2026-11-03" });
    const linha = p.linhas[0];
    expect(linha.acao).toBe("atualizar"); // o "retomar em" estava vazio: só ele entra
    expect(linha.mudancas.map((m) => m.campo)).toEqual(["retomarEm"]);
    expect(linha.naoAplicado.find((n) => n.campo === "estagio")!.motivo).toMatch(/já está em Negociação: a importação não volta etapa/);
    expect(linha.naoAplicado.find((n) => n.campo === "valorOrcamento")!.motivo).toMatch(/só preenche campo vazio/);
    await gravarPlano(p.linhas);
    expect(gravados[0].patch).toEqual({ retomarEm: "2026-11-03" }); // sem etapaDesde: a etapa não mudou
  });
  it("fechar como Ganho é na ficha, não pelo arquivo", () => {
    const n = compararNegociacao(lead({ estagio: "negociacao" }), { estagio: "ganho" });
    expect(n.mudancas).toEqual([]);
    expect(n.naoAplicado[0].motivo).toMatch(/Fechar como Ganho é na ficha/);
  });
  it("rodar de novo com o mesmo arquivo não muda nada nem repete a nota", () => {
    const p = plano([lead({ estagio: "negociacao", valorOrcamento: 1000 })], { etapa_sugerida: "negociacao", mensalidade: 1000 });
    expect(p.linhas[0]).toMatchObject({ acao: "ignorar", mudancas: [], naoAplicado: [], atividades: [] });
    expect(p.linhas[0].motivo).toMatch(/não muda nada/);
  });
  it("sem a situação atual do lead (quem chama não mandou), nada é aplicado", () => {
    const n = compararNegociacao({ id: "l1", empresa: "X", contatoNome: "X", telefone: null, rotaLojaId: null, externoId: null }, { estagio: "proposta", valorOrcamento: 900 });
    expect(n.mudancas).toEqual([]);
    expect(n.naoAplicado.map((x) => x.campo)).toEqual(["estagio", "valorOrcamento"]);
  });
});
