// @vitest-environment node
// Importação com leitura que falha (auditoria 21/10/2026, item 4.10). Dados INVENTADOS.
//
// O QUE ACONTECIA: se a leitura do funil falhasse, a lista vinha VAZIA e o "Importar" criava o funil inteiro de novo.
// E o "Importar" recalculava o plano na hora, contra o funil daquele instante — não o que a prévia mostrou.
// Agora: leitura falha → aborta (503, nada gravado); só grava se o plano recalculado é o MESMO da prévia (assinatura).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api/require-role", () => ({ requireRole: async () => ({ user: { email: "socio@exemplo.com" } }) }));
let leads: Record<string, unknown>[] = [];
let funilFalha = false;
let clientesErro: { message: string } | null = null;
vi.mock("@/lib/supabase/queries", () => ({
  fetchCrmLeads: async () => { if (funilFalha) throw new Error("Não consegui ler o funil do comercial (timeout)."); return leads; },
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ limit: async () => ({ data: clientesErro ? null : [], error: clientesErro }) }) }) },
}));
const gravacoes: unknown[][] = [];
vi.mock("@/lib/crm/gravar-plano", () => ({
  gravarPlano: async (linhas: unknown[]) => { gravacoes.push(linhas); return { criados: linhas.length, atualizados: 0, erros: [], criadas: [] }; },
}));

const { POST } = await import("@/app/api/crm/importar/route");
const { assinaturaDoPlano, planejarImportacao } = await import("@/lib/crm/importar");

const dados = { oportunidades: [{ empresa: "Loja Exemplo", etapa_sugerida: "negociacao", mensalidade: 1500 }, { empresa: "Telhas Beta", situacao: "enviar mensagem" }] };
const pedir = async (corpo: Record<string, unknown>) => {
  const res = await POST(new NextRequest("https://painel.exemplo.com/api/crm/importar", { method: "POST", body: JSON.stringify(corpo) }));
  return { status: res.status, corpo: await res.json() as Record<string, unknown> };
};

beforeEach(() => { leads = []; funilFalha = false; clientesErro = null; gravacoes.length = 0; });

describe("leitura que falha aborta", () => {
  it("o erro original: funil que não carrega virava lista vazia e duplicava tudo — agora 503 e nada gravado", async () => {
    funilFalha = true;
    const r = await pedir({ dados, confirmar: true, assinatura: "qualquer" });
    expect(r.status).toBe(503);
    expect(String(r.corpo.error)).toMatch(/Nada foi importado/);
    expect(gravacoes).toHaveLength(0);
  });
  it("lista de clientes que não carrega também aborta (não importa quem já é cliente)", async () => {
    clientesErro = { message: "timeout" };
    expect((await pedir({ dados })).status).toBe(503);
  });
});

describe("só grava o plano que a prévia mostrou", () => {
  it("prévia devolve a assinatura; importar com ela grava", async () => {
    const previa = await pedir({ dados });
    expect(previa.status).toBe(200);
    const r = await pedir({ dados, confirmar: true, assinatura: previa.corpo.assinatura });
    expect(r.status).toBe(200);
    expect(gravacoes).toHaveLength(1);
  });
  it("o funil mudou entre a prévia e o importar: 409 e nada gravado", async () => {
    const previa = await pedir({ dados });
    leads = [{ id: "l1", empresa: "Telhas Beta", contatoNome: "Beto", telefone: null, rotaLojaId: null, externoId: null, estagio: "contato", valorOrcamento: null, probabilidade: null, retomarEm: null }];
    const r = await pedir({ dados, confirmar: true, assinatura: previa.corpo.assinatura });
    expect(r.status).toBe(409);
    expect(gravacoes).toHaveLength(0);
  });
  it("importar sem ter visto a prévia é recusado", async () => {
    expect((await pedir({ dados, confirmar: true })).status).toBe(400);
    expect(gravacoes).toHaveLength(0);
  });
  it("a assinatura só olha o que grava: linha ignorada não muda nada", () => {
    const base = planejarImportacao({ dados, existentes: [], clientes: [], hoje: "2026-10-24" });
    const comCliente = planejarImportacao({ dados: { oportunidades: [...dados.oportunidades, { empresa: "Cliente Antigo" }] }, existentes: [], clientes: [{ nome: "Cliente Antigo", telefones: [] }], hoje: "2026-10-24" });
    expect(assinaturaDoPlano(comCliente)).toBe(assinaturaDoPlano(base));
    const outroDia = planejarImportacao({ dados, existentes: [], clientes: [], hoje: "2026-10-25" });
    expect(assinaturaDoPlano(outroDia)).not.toBe(assinaturaDoPlano(base));
  });
});
