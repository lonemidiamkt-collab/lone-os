// @vitest-environment node
// Todo caminho que muda a etapa do lead grava o histórico (onda 5 do erro recuperável, 25/10/2026). Dados INVENTADOS.
//
// O QUE ACONTECIA: crm_lead_etapas (base da taxa de fechamento e do ciclo de venda) só recebia o arrastar/editar da
// tela, a criação pela tela e a reunião marcada. O primeiro contato que tira o lead de Novo — pela tela ("Já falei",
// "Registrar ligação") ou pelo Loninho no grupo de vendas — mudava a etapa sem deixar linha; o Desfazer, a proposta
// gerada no painel, a importação/Rota Lagos e o lead do site/Loninho/prospecção também não.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

type Linha = Record<string, unknown>;
const banco: { leads: Linha[]; atividades: Linha[]; etapas: Linha[] } = { leads: [], atividades: [], etapas: [] };
let seq = 0;
const agoraTeste = "2026-10-25T13:00:00.000Z";
/** Respostas forçadas para o próximo insert em crm_lead_etapas (simula CHECK antigo, banco fora). */
let respostasEtapa: ({ error: { code?: string; message: string } } | "lanca")[] = [];

const mapa: Record<string, string> = { estagio: "estagio", etapaDesde: "etapa_desde", retomarEm: "retomar_em", primeiroContatoEm: "primeiro_contato_em" };
const deLead = (r: Linha) => ({ id: r.id, contatoNome: r.contato_nome, empresa: null, estagio: r.estagio, etapaDesde: r.etapa_desde ?? null, retomarEm: r.retomar_em ?? null, primeiroContatoEm: r.primeiro_contato_em ?? null });

vi.mock("@/lib/supabase/queries", () => ({
  insertLeadActivity: async (a: { leadId: string; tipo: string; texto: string }) => {
    const linha = { id: `a${++seq}`, lead_id: a.leadId, tipo: a.tipo, texto: a.texto, created_at: agoraTeste };
    banco.atividades.push(linha);
    return { id: linha.id, leadId: a.leadId, tipo: a.tipo, texto: a.texto, autor: null, createdAt: linha.created_at };
  },
  fetchCrmLeadById: async (id: string) => { const r = banco.leads.find((l) => l.id === id); return r ? deLead(r) : null; },
  updateCrmLead: async (id: string, patch: Record<string, unknown>) => {
    const r = banco.leads.find((l) => l.id === id)!;
    for (const [k, v] of Object.entries(patch)) r[mapa[k] ?? k] = v;
    return deLead(r);
  },
  insertCrmLead: async (campos: Record<string, unknown>) => {
    const r = { id: `l${++seq}`, contato_nome: campos.contatoNome, estagio: campos.estagio ?? "novo" };
    banco.leads.push(r);
    return deLead(r);
  },
}));
vi.mock("@/lib/crm/meta", () => ({ hojeSP: () => "2026-10-25" }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (tabela: string) => {
      const filtros: ((r: Linha) => boolean)[] = [];
      let op: "select" | "update" | "delete" = "select";
      let dados: Linha = {};
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.update = (d: Linha) => { op = "update"; dados = d; return q; };
      q.delete = () => { op = "delete"; return q; };
      q.insert = async (linha: Linha | Linha[]) => {
        if (tabela === "crm_lead_etapas") {
          const forcada = respostasEtapa.shift();
          if (forcada === "lanca") throw new Error("rede caiu");
          if (forcada) return forcada;
          banco.etapas.push(linha as Linha);
          return { error: null };
        }
        banco.atividades.push(...(Array.isArray(linha) ? linha : [linha]));
        return { error: null };
      };
      q.eq = (c: string, v: unknown) => { filtros.push((r) => r[c] === v); return q; };
      q.is = (c: string, v: unknown) => { filtros.push((r) => (r[c] ?? null) === v); return q; };
      q.in = (c: string, vs: unknown[]) => { filtros.push((r) => vs.includes(r[c])); return q; };
      q.then = (ok: (v: unknown) => unknown) => {
        const lista = tabela === "crm_leads" ? banco.leads : banco.atividades;
        const alvo = lista.filter((r) => filtros.every((f) => f(r)));
        if (op === "update") alvo.forEach((r) => Object.assign(r, dados));
        if (op === "delete") { for (const r of alvo) lista.splice(lista.indexOf(r), 1); }
        return Promise.resolve({ data: alvo, error: null }).then(ok);
      };
      return q;
    },
  },
}));

const { registrarAtividade, desfazerRegistro } = await import("@/lib/crm/registrar-atividade");
const { registrarEtapa } = await import("@/lib/crm/etapas-historico");
const { gravarPlano } = await import("@/lib/crm/gravar-plano");

beforeEach(() => {
  banco.leads = [{ id: "l1", contato_nome: "Ana", estagio: "novo", etapa_desde: "2026-10-20T12:00:00.000Z", retomar_em: null, primeiro_contato_em: null }];
  banco.atividades = [];
  banco.etapas = [];
  respostasEtapa = [];
});

describe("primeiro contato", () => {
  it("o erro original: o WhatsApp tirava o lead de Novo sem linha no histórico — agora grava novo → contato", async () => {
    await registrarAtividade({ leadId: "l1", tipo: "whatsapp", texto: "Mandei a apresentação", autor: "Roberto" });
    expect(banco.leads[0].estagio).toBe("contato");
    expect(banco.etapas).toEqual([{ lead_id: "l1", de: "novo", para: "contato", autor: "Roberto", origem: "contato" }]);
  });
  it("vale para todo toque (ligação, e-mail, reunião, visita) e só na saída de Novo", async () => {
    await registrarAtividade({ leadId: "l1", tipo: "ligacao", texto: "Liguei", autor: "Roberto" });
    await registrarAtividade({ leadId: "l1", tipo: "email", texto: "Mandei e-mail", autor: "Roberto" });
    expect(banco.etapas).toHaveLength(1); // o segundo toque não muda etapa
  });
  it("nota não é toque: não muda etapa nem grava histórico", async () => {
    await registrarAtividade({ leadId: "l1", tipo: "nota", texto: "Lembrar de ligar", autor: "Roberto" });
    expect(banco.leads[0].estagio).toBe("novo");
    expect(banco.etapas).toEqual([]);
  });
  it("Desfazer volta a etapa e também deixa a volta no histórico (contato → novo)", async () => {
    const r = await registrarAtividade({ leadId: "l1", tipo: "visita", texto: "Passei na loja", autor: "Roberto" });
    const d = await desfazerRegistro(r.desfazer, new Date(Date.parse(agoraTeste) + 60_000), "socio@exemplo.com");
    expect(d.ok).toBe(true);
    expect(banco.leads[0].estagio).toBe("novo");
    expect(banco.etapas.map((e) => [e.de, e.para, e.origem])).toEqual([["novo", "contato", "contato"], ["contato", "novo", "desfazer"]]);
    expect(banco.etapas[1].autor).toBe("socio@exemplo.com");
  });
});

describe("registrarEtapa nunca derruba a mudança e não perde a linha antes da migration", () => {
  it("CHECK antigo (migration 20261025110000 não aplicada): grava com a origem antiga equivalente", async () => {
    respostasEtapa = [{ error: { code: "23514", message: "violates check constraint" } }];
    expect(await registrarEtapa({ leadId: "l1", de: "novo", para: "contato", origem: "contato" })).toBe(true);
    expect(banco.etapas).toEqual([{ lead_id: "l1", de: "novo", para: "contato", autor: null, origem: "tela" }]);
  });
  it("importação cai em 'lote'; origem antiga não tenta de novo", async () => {
    respostasEtapa = [{ error: { code: "23514", message: "check" } }];
    await registrarEtapa({ leadId: "l1", de: "contato", para: "proposta", origem: "importacao" });
    expect(banco.etapas[0].origem).toBe("lote");
    respostasEtapa = [{ error: { code: "23514", message: "check" } }];
    expect(await registrarEtapa({ leadId: "l1", de: "contato", para: "proposta", origem: "tela" })).toBe(false);
    expect(banco.etapas).toHaveLength(1);
  });
  it("banco fora ou erro lançado: devolve false, não lança (a etapa do lead já foi salva)", async () => {
    respostasEtapa = [{ error: { code: "57014", message: "timeout" } }];
    expect(await registrarEtapa({ leadId: "l1", de: "novo", para: "contato" })).toBe(false);
    respostasEtapa = ["lanca"];
    await expect(registrarEtapa({ leadId: "l1", de: "novo", para: "contato" })).resolves.toBe(false);
  });
  it("sem mudança não grava", async () => {
    expect(await registrarEtapa({ leadId: "l1", de: "contato", para: "contato" })).toBe(true);
    expect(banco.etapas).toEqual([]);
  });
  it("primeiro contato com o histórico fora do ar: o lead sai de Novo do mesmo jeito", async () => {
    respostasEtapa = ["lanca"];
    await registrarAtividade({ leadId: "l1", tipo: "whatsapp", texto: "Oi", autor: "Roberto" });
    expect(banco.leads[0].estagio).toBe("contato");
  });
});

describe("importação e Rota Lagos", () => {
  const linha = (o: Record<string, unknown>) => ({
    chave: "k", fonte: "planilha" as const, motivo: "", titulo: "Loja Exemplo", atividades: [], naoAplicado: [], mudancas: [], campos: {}, leadId: null, acao: "criar" as const, ...o,
  });
  it("lead criado entra no histórico (de vazio → etapa do lead)", async () => {
    await gravarPlano([linha({ campos: { contatoNome: "Bia", estagio: "contato", responsavel: "Kayo Exemplo" } })]);
    expect(banco.etapas).toEqual([expect.objectContaining({ de: null, para: "contato", origem: "importacao", autor: "Kayo Exemplo" })]);
  });
  it("etapa que avança na reimportação grava de → para com a etapa do banco", async () => {
    await gravarPlano([linha({ acao: "atualizar", leadId: "l1", mudancas: [{ campo: "estagio", rotulo: "Etapa", de: "Novo", para: "Proposta", valor: "proposta" }] })], "socio@exemplo.com");
    expect(banco.leads[0].estagio).toBe("proposta");
    expect(banco.etapas).toEqual([{ lead_id: "l1", de: "novo", para: "proposta", autor: "socio@exemplo.com", origem: "importacao" }]);
  });
  it("mudança só de valor não grava etapa", async () => {
    await gravarPlano([linha({ acao: "atualizar", leadId: "l1", mudancas: [{ campo: "valorOrcamento", rotulo: "Mensalidade", de: "—", para: "R$ 1.000/mês", valor: 1000 }] })]);
    expect(banco.etapas).toEqual([]);
  });
});

describe("mapa: todo ponto que grava a etapa do lead também grava o histórico", () => {
  // Achados de 25/10/2026 (grep por `estagio` em gravações de crm_leads). Arquivo novo que mude a etapa entra aqui.
  const PONTOS: [string, RegExp][] = [
    ["app/api/crm/leads/route.ts", /registrarEtapa\(\{ leadId: lead\.id, de: null[\s\S]*registrarEtapa\(\{ leadId: id, de: etapaAnterior/],
    ["lib/crm/registrar-atividade.ts", /origem: "contato"[\s\S]*origem: "desfazer"/],
    ["lib/crm/reunioes-server.ts", /registrarEtapa\(\{ leadId: lead\.id, de: lead\.estagio, para: "diagnostico"/],
    ["app/api/crm/proposta/route.ts", /registrarEtapa\(\{ leadId, de: lead\.estagio, para: "proposta"/],
    ["lib/crm/gravar-plano.ts", /origem: "importacao"[\s\S]*origem: "importacao"/],
    ["app/api/integracoes/site/lead/route.ts", /registrarEtapa\(\{ leadId: lead\.id, de: null, para: lead\.estagio, autor: "Site"/],
    ["lib/crm/assistente-server.ts", /registrarEtapa\(\{ leadId: novo\.id, de: null, para: novo\.estagio/],
    ["lib/prospeccao/agenda.ts", /registrarEtapa\(\{ leadId: lead\.id[\s\S]*registrarEtapa\(\{ leadId: crm_lead_id/],
  ];
  for (const [arquivo, padrao] of PONTOS) {
    it(arquivo, () => { expect(readFileSync(arquivo, "utf8")).toMatch(padrao); });
  }
  it("a migration das origens novas existe (só o arquivo — aplicar é decisão do Roberto)", () => {
    const sql = readFileSync("supabase/migrations/20261025110000_crm_lead_etapas_origens.sql", "utf8");
    expect(sql).toMatch(/'contato', 'proposta', 'importacao', 'desfazer'/);
  });
});
