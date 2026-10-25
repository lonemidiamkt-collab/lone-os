// @vitest-environment node
// Loninho do grupo de vendas pergunta antes de marcar reunião (auditoria 21/10/2026, item 4.8). Dados INVENTADOS.
//
// O QUE ACONTECIA: "Loninho, marca reunião com a X quinta 15h" criava o evento no Google na hora e o lead recebia o
// convite — sem ninguém conferir dia, hora e formato. Agora o Loninho mostra o que entendeu e pede "ok"; só a resposta
// de SÓCIO que CITA a pergunta cria. Aqui roda o caminho de verdade (tratarGrupoVendas) com IA, banco e WhatsApp falsos.
import { describe, it, expect, vi, beforeEach } from "vitest";

const enviadas: { texto: string; citando?: string }[] = [];
vi.mock("@/lib/cs/notify", () => ({
  csSendGroupText: async (_jid: string, texto: string, citando?: string) => { enviadas.push({ texto, citando }); return { ok: true }; },
  csFetchMediaBase64: async () => ({}),
}));
vi.mock("@/lib/cs/transcribe", () => ({ transcribeAudio: async () => "" }));
let autor: { nome: string; papel: string } | null = { nome: "Roberto Lino", papel: "admin" };
vi.mock("@/lib/cs/autoridade", () => ({ quemEh: async () => autor }));
vi.mock("@/lib/ai/openai", () => ({
  isOpenAIConfigured: () => true,
  chatJson: async () => ({ ok: true, data: { acoes: [{ tipo: "reuniao", lead_num: 1, lead_texto: "Loja Exemplo", data: null, hora: null, formato: "meet", canal: null, resumo: null, empresa: null, contato: null, telefone: null }] } }),
}));
const LEAD = { id: "3f2a9c1e-0000-4000-8000-000000000001", empresa: "Loja Exemplo", contatoNome: "Ana Souza", telefone: "22999990000", email: "ana@exemplo.com", estagio: "contato" };
let funilFalha = false;
vi.mock("@/lib/supabase/queries", () => ({
  fetchCrmLeads: async () => { if (funilFalha) throw new Error("banco fora"); return [LEAD]; },
  fetchCrmLeadById: async () => LEAD,
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ limit: async () => ({ data: [], error: null }) }) }) },
}));
const marcadas: Record<string, unknown>[] = [];
vi.mock("@/lib/crm/reunioes-server", () => ({
  marcarReuniao: async (p: Record<string, unknown>) => { marcadas.push(p); return { ok: true, reuniao: {}, aviso: null, whatsappLead: null, mensagemLead: "Oi, Ana! Combinado." }; },
  conferirHorario: async () => "livre",
}));
vi.mock("@/lib/crm/extras", () => ({ carregarExtras: async () => new Map(), EXTRAS_VAZIOS: {} }));

process.env.CS_VENDAS_GROUP_JID = "vendas@g.us";
const { tratarGrupoVendas } = await import("@/lib/crm/assistente-server");
const { lerPerguntaReuniao, respostaAPergunta, textoPerguntaReuniao, refDoLead } = await import("@/lib/crm/reuniao-loninho");

const msg = (text: string, extra: { quotedText?: string; quotedMsgId?: string } = {}) => ({ groupJid: "vendas@g.us", authorJid: "5522999990001@s.whatsapp.net", text, messageId: `m${Math.random()}`, ...extra });

beforeEach(() => { enviadas.length = 0; marcadas.length = 0; autor = { nome: "Roberto Lino", papel: "admin" }; funilFalha = false; });

describe("pedir reunião só pergunta", () => {
  it("o erro original: o pedido criava o evento — agora não cria nada e mostra dia, hora, formato e convidados", async () => {
    await tratarGrupoVendas(msg("Loninho, marca reunião com a Loja Exemplo dia 29/10 às 15h no Meet"), {});
    expect(marcadas).toHaveLength(0);
    const pergunta = enviadas.at(-1)!.texto;
    expect(pergunta).toMatch(/Confirma a reunião\?/);
    expect(pergunta).toMatch(/29\/10\/\d{4} às 15:00 \(45 min\)/);
    expect(pergunta).toMatch(/Formato: Google Meet/);
    expect(pergunta).toMatch(/Convite por e-mail para: ana@exemplo\.com/);
    expect(pergunta).toContain(`Ref.: ${refDoLead(LEAD.id)}`);
  });

  it("'ok' de sócio CITANDO a pergunta cria exatamente o que ela mostrou", async () => {
    await tratarGrupoVendas(msg("Loninho, marca reunião com a Loja Exemplo dia 29/10 às 15h no Meet"), {});
    const pergunta = enviadas.at(-1)!.texto;
    await tratarGrupoVendas(msg("ok", { quotedText: pergunta, quotedMsgId: "q1" }), {});
    expect(marcadas).toHaveLength(1);
    expect(marcadas[0]).toMatchObject({ leadId: LEAD.id, duracao: 45, formato: "meet", convidados: ["ana@exemplo.com"] });
    expect(String(marcadas[0].inicio)).toMatch(/-10-29T15:00:00-03:00$/);
    expect(enviadas.at(-1)!.texto).toMatch(/Confirmação pronta para mandar ao lead/);
  });

  it("'ok' solto (sem citar a pergunta) não cria nada", async () => {
    await tratarGrupoVendas(msg("Loninho, marca reunião com a Loja Exemplo dia 29/10 às 15h"), {});
    await tratarGrupoVendas(msg("ok"), {});
    expect(marcadas).toHaveLength(0);
  });

  it("'ok' citando a pergunta, mas de quem não é sócio, não cria", async () => {
    await tratarGrupoVendas(msg("Loninho, marca reunião com a Loja Exemplo dia 29/10 às 15h"), {});
    const pergunta = enviadas.at(-1)!.texto;
    autor = { nome: "Pedro", papel: "designer" };
    await tratarGrupoVendas(msg("ok", { quotedText: pergunta }), {});
    expect(marcadas).toHaveLength(0);
    expect(enviadas.at(-1)!.texto).toMatch(/Só os sócios/);
  });

  it("'não' ou resposta que não dá para entender não cria", async () => {
    await tratarGrupoVendas(msg("Loninho, marca reunião com a Loja Exemplo dia 29/10 às 15h"), {});
    const pergunta = enviadas.at(-1)!.texto;
    await tratarGrupoVendas(msg("não, errei o dia", { quotedText: pergunta }), {});
    await tratarGrupoVendas(msg("marca às 16h", { quotedText: pergunta }), {});
    expect(marcadas).toHaveLength(0);
    expect(enviadas.at(-1)!.texto).toMatch(/Não entendi/);
  });

  it("funil que não carrega: diz que não leu (antes virava 'nenhum lead' e podia cadastrar duplicado)", async () => {
    funilFalha = true;
    await tratarGrupoVendas(msg("Loninho, marca reunião com a Loja Exemplo dia 29/10 às 15h"), {});
    expect(enviadas.at(-1)!.texto).toMatch(/Não consegui ler o funil/);
    expect(marcadas).toHaveLength(0);
  });
});

describe("a pergunta e a resposta (puro)", () => {
  const p = { ref: "3f2a9c1e", data: "2026-10-29", hora: "15:00", duracao: 45, formato: "presencial" as const, convidados: [] };
  it("ida e volta: o que a pergunta mostra é o que volta no 'ok'", () => {
    const t = textoPerguntaReuniao({ ...p, nome: "Loja Exemplo", contato: "Ana" });
    expect(t).toMatch(/ninguém \(o lead não tem e-mail no cadastro\)/);
    expect(lerPerguntaReuniao(t)).toEqual(p);
  });
  it("texto que não é a pergunta, ou adulterado, não vira reunião", () => {
    expect(lerPerguntaReuniao("Reunião marcada amanhã")).toBeNull();
    const t = textoPerguntaReuniao({ ...p, nome: "Loja Exemplo", convidados: ["ana@exemplo.com"] }).replace("ana@exemplo.com", "ana@");
    expect(lerPerguntaReuniao(t)).toBeNull();
  });
  it("avisa conflito ou agenda não conferida", () => {
    expect(textoPerguntaReuniao({ ...p, nome: "X", conflito: "ocupado" })).toMatch(/bate com outro compromisso/);
    expect(textoPerguntaReuniao({ ...p, nome: "X", conflito: "nao_conferi" })).toMatch(/Não consegui conferir a agenda/);
  });
  it("só a frase inteira de confirmação é 'sim'", () => {
    for (const s of ["ok", "Ok!", "sim", "pode marcar", "confirmado", "👍", "Loninho, ok"]) expect(respostaAPergunta(s)).toBe("sim");
    for (const n of ["não", "nao, outro dia", "cancela"]) expect(respostaAPergunta(n)).toBe("nao");
    for (const x of ["marca às 16h", "ok mas muda para sexta", "sexta 10h"]) expect(respostaAPergunta(x)).toBeNull();
  });
});
