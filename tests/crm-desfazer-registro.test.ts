// @vitest-environment node
// Desfazer registro do comercial (auditoria 21/10/2026, item 4.6). Dados INVENTADOS.
//
// O QUE ACONTECIA: "Já falei", "Registrar ligação", "Aconteceu", "Marcar como feito" no Hoje não tinham volta — o toque
// contava, o lead saía de Novo, e o lote anunciava "N marcados" mesmo com falha. Agora o registro devolve o que mudou e
// o Desfazer volta exatamente isso; a gravação e o Desfazer rodam aqui contra um banco em memória.
import { describe, it, expect, vi, beforeEach } from "vitest";

type Linha = Record<string, unknown>;
const banco: { leads: Linha[]; atividades: Linha[] } = { leads: [], atividades: [] };
let seq = 0;
const iso = (min = 0) => new Date(Date.parse("2026-10-24T13:00:00.000Z") + min * 60_000).toISOString();

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
}));
vi.mock("@/lib/crm/meta", () => ({ hojeSP: () => "2026-10-24" }));

// supabaseAdmin mínimo: update(...).eq().is() no lead, select/in e delete/in/eq nas atividades.
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

let agoraTeste = iso();
const { registrarAtividade, desfazerRegistro } = await import("@/lib/crm/registrar-atividade");
const { planoDesfazer, lerDesfazer, textoMantidos } = await import("@/lib/crm/desfazer-registro");

beforeEach(() => {
  banco.leads = [{ id: "l1", contato_nome: "Ana", estagio: "novo", etapa_desde: iso(-60 * 24), retomar_em: null, primeiro_contato_em: null }];
  banco.atividades = [];
  agoraTeste = iso();
});

describe("registrar devolve o que mudou; Desfazer volta exatamente isso", () => {
  it("o erro original: primeiro WhatsApp tirava o lead de Novo sem volta — agora volta tudo", async () => {
    const r = await registrarAtividade({ leadId: "l1", tipo: "whatsapp", texto: "Já falei por outro caminho", autor: "Roberto" });
    expect(banco.leads[0].estagio).toBe("contato");
    expect(banco.atividades).toHaveLength(2); // o toque + "Movido para Contato feito"
    expect(r.desfazer.atividadeIds).toHaveLength(2);
    expect(r.desfazer.antes).toMatchObject({ estagio: "novo", primeiroContatoEm: null });

    const d = await desfazerRegistro(r.desfazer, new Date(Date.parse(agoraTeste) + 60_000));
    expect(d.ok).toBe(true);
    expect(banco.leads[0]).toMatchObject({ estagio: "novo", primeiro_contato_em: null, etapa_desde: iso(-60 * 24) });
    expect(banco.atividades).toHaveLength(0);
  });

  it("nota não mexe no lead: o Desfazer só apaga a nota", async () => {
    const r = await registrarAtividade({ leadId: "l1", tipo: "nota", texto: "dono viaja", autor: null });
    expect(r.desfazer.antes).toEqual({});
    const d = await desfazerRegistro(r.desfazer, new Date(Date.parse(agoraTeste) + 1000));
    expect(d.ok).toBe(true);
    expect(banco.leads[0].estagio).toBe("novo");
    expect(banco.atividades).toHaveLength(0);
  });

  it("desfazer duas vezes não dá erro (a atividade já apagada é ignorada)", async () => {
    const r = await registrarAtividade({ leadId: "l1", tipo: "ligacao", texto: "caixa postal", autor: null });
    const depois = new Date(Date.parse(agoraTeste) + 1000);
    expect((await desfazerRegistro(r.desfazer, depois)).ok).toBe(true);
    expect((await desfazerRegistro(r.desfazer, depois)).ok).toBe(true);
    expect(banco.leads[0].estagio).toBe("novo");
  });

  it("passado o prazo, recusa e não mexe em nada", async () => {
    const r = await registrarAtividade({ leadId: "l1", tipo: "ligacao", texto: "liguei", autor: null });
    const d = await desfazerRegistro(r.desfazer, new Date(Date.parse(agoraTeste) + 16 * 60_000));
    expect(d.ok).toBe(false);
    expect(banco.leads[0].estagio).toBe("contato");
    expect(banco.atividades).toHaveLength(2);
  });
});

describe("planoDesfazer (regra pura)", () => {
  const base = { leadId: "l1", atividadeIds: ["a1"], antes: { estagio: "novo" }, depois: { estagio: "contato" } };
  const atividade = { id: "a1", leadId: "l1", createdAt: "2026-10-24T13:00:00.000Z" };
  const agora = new Date("2026-10-24T13:05:00.000Z");

  it("campo mudado por outra pessoa depois do registro fica como está (e a resposta diz)", () => {
    const p = planoDesfazer({ desfazer: base, lead: { estagio: "proposta" }, atividades: [atividade], agora });
    expect(p).toEqual({ ok: true, apagar: ["a1"], restaurar: {}, mantidos: ["estagio"] });
    expect(textoMantidos(["estagio"])).toMatch(/a etapa já tinha mudado/);
  });
  it("data-hora compara pelo instante (o banco devolve +00:00, a tela manda Z)", () => {
    const d = { leadId: "l1", atividadeIds: [], antes: { etapaDesde: "2026-10-01T00:00:00.000Z" }, depois: { etapaDesde: "2026-10-24T13:00:00.000Z" } };
    const p = planoDesfazer({ desfazer: d, lead: { etapaDesde: "2026-10-24T13:00:00+00:00" }, atividades: [], agora });
    expect(p.ok && p.restaurar).toEqual({ etapaDesde: "2026-10-01T00:00:00.000Z" });
  });
  it("atividade de outro lead é recusada", () => {
    expect(planoDesfazer({ desfazer: base, lead: { estagio: "contato" }, atividades: [{ ...atividade, leadId: "l2" }], agora }).ok).toBe(false);
  });
  it("lerDesfazer só aceita os campos conhecidos", () => {
    expect(lerDesfazer({ ...base, antes: { valorOrcamento: 0 } })).toBeNull();
    expect(lerDesfazer({ ...base, atividadeIds: "a1" })).toBeNull();
    expect(lerDesfazer(base)).toEqual(base);
  });
});
