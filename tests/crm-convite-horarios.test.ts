// @vitest-environment node
// Convite e horários da reunião de venda (auditoria 21/10/2026, itens 4.7 e 4.9). Dados INVENTADOS.
//
// O QUE ACONTECIA:
//  4.7 — o convite ia para o e-mail do cadastro do lead mesmo depois de apagado no campo da janela de marcar.
//  4.9 — com o Google fora, a janela oferecia horários sem conferir conflito (ou dizia "Nenhum horário livre").
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Linha = Record<string, unknown>;
const reunioes: Linha[] = [];
let erroNossas: { message: string } | null = null;
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: () => {
      const q: Record<string, unknown> = {};
      let inserir: Linha | null = null;
      for (const m of ["select", "eq", "gte", "lte", "lt", "gt", "order", "limit"]) q[m] = () => q;
      q.insert = (l: Linha) => { inserir = { id: `r${reunioes.length + 1}`, estado: "agendada", criado_em: "2026-10-24T12:00:00Z", ...l }; return q; };
      q.single = async () => { if (inserir) reunioes.push(inserir); return { data: inserir, error: null }; };
      q.maybeSingle = async () => ({ data: null, error: null });
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: erroNossas ? null : [], error: erroNossas }).then(ok);
      return q;
    },
  },
}));
const LEAD = { id: "l1", empresa: "Loja Exemplo", contatoNome: "Ana", telefone: null, email: "ana@exemplo.com", estagio: "diagnostico", endereco: null, cidade: null };
vi.mock("@/lib/supabase/queries", () => ({
  fetchCrmLeadById: async () => LEAD, updateCrmLead: async () => LEAD, insertLeadActivity: async () => ({ id: "a1" }),
}));
vi.mock("@/lib/crm/grupo-vendas-envio", () => ({ mandarNoGrupoVendas: async () => ({ ok: true }) }));
vi.mock("@/lib/crm/etapas-historico", () => ({ registrarEtapa: async () => {} }));
vi.mock("@/lib/crm/registrar-atividade", () => ({ registrarAtividade: async () => ({}), desfazerRegistro: async () => ({ ok: true }) }));
vi.mock("@/lib/api/require-role", () => ({ requireRole: async () => ({ user: { email: "socio@exemplo.com" } }) }));
const criados: { convidados?: string[] }[] = [];
let freeBusy: { ok: boolean; faixas: { inicio: string; fim: string }[]; error?: string } = { ok: true, faixas: [] };
vi.mock("@/lib/prospeccao/google", () => ({
  estadoGoogle: async () => ({ configurado: true, conectado: true }),
  criarEvento: async (e: { convidados?: string[] }) => { criados.push(e); return { ok: true, evento: { event_id: "ev1", meet_url: "https://meet.google.com/abc-defg-hij", html_link: null } }; },
  ocupadosNoCalendario: async () => freeBusy,
  cancelarEvento: async () => true, cancelarEventoComMotivo: async () => ({ ok: true }), atualizarEvento: async () => ({ ok: true }),
}));

const { marcarReuniao } = await import("@/lib/crm/reunioes-server");
const { GET: horarios } = await import("@/app/api/crm/reunioes/horarios/route");
const { convidadosDoConvite, separarEmails, respostaHorarios, textoConvidados } = await import("@/lib/crm/reunioes");

const amanha = new Date(Date.now() + 2 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const marcar = (convidados: string[]) => marcarReuniao({ leadId: "l1", inicio: `${amanha}T15:00:00-03:00`, duracao: 45, formato: "meet", convidados, autor: "Roberto" });

beforeEach(() => { reunioes.length = 0; criados.length = 0; erroNossas = null; freeBusy = { ok: true, faixas: [] }; });

describe("4.7 — convite só para quem está no campo", () => {
  it("o erro original: campo apagado e o convite ia para o e-mail do cadastro — agora ninguém é convidado", async () => {
    const r = await marcar([]);
    expect(r.ok).toBe(true);
    expect(criados[0].convidados).toEqual([]);
    expect(reunioes[0].convidados).toEqual([]);
    // E a confirmação para o lead não diz "mandei o convite no seu e-mail".
    expect(r.ok && r.mensagemLead).not.toMatch(/convite no seu e-mail/);
  });
  it("trocou pelo e-mail certo: vai só para ele", async () => {
    await marcar(["Dono@Exemplo.com"]);
    expect(criados[0].convidados).toEqual(["dono@exemplo.com"]);
  });
  it("e-mail inválido no campo: recusa antes de criar o evento", async () => {
    const r = await marcar(["ana@exemplo"]);
    expect(r.ok).toBe(false);
    expect(criados).toHaveLength(0);
  });
  it("regras puras do campo", () => {
    expect(separarEmails("a@x.com, b@y.com; c@z.com")).toEqual(["a@x.com", "b@y.com", "c@z.com"]);
    expect(convidadosDoConvite(["A@x.com", "a@x.com", "", "ruim"])).toEqual(["a@x.com"]);
    expect(textoConvidados([])).toMatch(/ninguém/);
  });
});

describe("4.9 — falha de leitura não é agenda livre", () => {
  const pedir = async () => (await horarios(new NextRequest(`https://painel.exemplo.com/api/crm/reunioes/horarios?dia=${amanha}&duracao=45`))).json();

  it("o erro original: Google fora e a janela oferecia horários — agora nenhum horário, com o motivo", async () => {
    freeBusy = { ok: false, faixas: [], error: "token expirado" };
    const r = await pedir();
    expect(r.livres).toEqual([]);
    expect(r.google).toBe("erro");
    expect(r.erro).toMatch(/Não consegui ler o Google Agenda.*token expirado/);
  });
  it("reuniões do Comercial que não carregam também bloqueiam a oferta", async () => {
    erroNossas = { message: "banco fora" };
    const r = await pedir();
    expect(r.livres).toEqual([]);
    expect(r.erro).toMatch(/reuniões já marcadas/);
  });
  it("tudo lido: oferece os horários livres", async () => {
    const r = await pedir();
    expect(r.erro).toBeNull();
    expect(r.livres.length).toBeGreaterThan(0);
  });
  it("Google desconectado continua oferecendo (só com as reuniões do Comercial) e diz isso", () => {
    const r = respostaHorarios({ dia: amanha, duracao: 45, agora: new Date(), nossas: { ok: true, faixas: [] }, google: "desconectado" });
    expect(r.google).toBe("desconectado");
    expect(r.erro).toBeNull();
  });
});
