import { describe, it, expect, vi } from "vitest";

// Banco falso: toda consulta devolve vazio (sem Google, sem conflito de agenda, sem piloto no banco
// — o simulador roda em `dry`, então nada é escrito). IA desligada: só as regras decidem.
function cadeia(): Record<string, unknown> {
  const fim = { data: [], error: null, count: 0 };
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  for (const m of ["select", "eq", "neq", "in", "or", "like", "ilike", "gte", "lte", "lt", "gt", "not", "order", "limit", "range", "insert", "update", "upsert", "delete"]) obj[m] = self;
  obj.maybeSingle = async () => ({ data: null, error: null });
  obj.single = async () => ({ data: null, error: { message: "vazio" } });
  obj.then = (res: (v: typeof fim) => unknown) => Promise.resolve(fim).then(res);
  return obj;
}
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: { from: () => cadeia() } }));
vi.mock("@/lib/ai/openai", () => ({ isOpenAIConfigured: () => false, chatJson: async () => ({ ok: false, error: "desligada" }) }));
vi.mock("@/lib/cs/notify", () => ({ csSendGroupText: async () => ({ ok: true }), assinaturaMensagem: (t: string) => t }));

const { decidirEResponder, casarOpcao } = await import("@/lib/prospeccao/conversa");
const { CONFIG_PADRAO } = await import("@/lib/prospeccao/config");
const { prospectBase } = await import("./prospeccao-score.test");

// Terça 15/09/2026 10:00 SP — dentro da janela de resposta.
const AGORA = new Date("2026-09-15T13:00:00Z");
const cfg = CONFIG_PADRAO;
type Extra = NonNullable<Parameters<typeof prospectBase>[0]>;
const fala = (estagio: Extra["estagio"], texto: string, extra: Extra = {}, historico = [{ autor: "agente", texto: "Olá, bom dia! Aqui é da equipe do Roberto Lino…" }]) =>
  decidirEResponder(prospectBase({ estagio, ...extra }), texto, { dry: true, cfg, agora: AGORA, historico });

describe("conversa do SDR (simulador, sem banco, sem IA)", () => {
  it("recepção pergunta 'sobre o que seria?' → explica curto, vai para atendente", async () => {
    const r = await fala("abordado", "sobre o que seria?");
    expect(r.intent?.intent).toBe("QUER_SABER_MAIS");
    expect(r.estagio_depois).toBe("atendente");
    expect(r.resposta).toContain("proprietário");
    expect(r.resposta).not.toMatch(/pre[çc]o/i);
  });
  it("recepção passa o WhatsApp do dono → decisor identificado e abordado no número direto", async () => {
    const r = await fala("atendente", "fala com ele direto no 22 99999-8888");
    expect(r.intent?.intent).toBe("PASSOU_CONTATO");
    expect(r.estagio_depois).toBe("decisor_contatado");
    expect(r.prospect.decisor_telefone).toBe("5522999998888");
    expect(r.resposta).toContain("[para 5522999998888]");
  });
  it("decisor com interesse → oferece 2 horários reais e vai para horario_proposto", async () => {
    const r = await fala("decisor_contatado", "tenho interesse sim, me explica melhor");
    expect(r.intent?.intent).toBe("INTERESSADO");
    expect(r.estagio_depois).toBe("horario_proposto");
    expect(r.resposta).toMatch(/O Roberto tem .* ou .*\. Algum desses horários funciona/);
    expect(r.resposta).toContain("Araruama"); // visita: 45 km
    const oferecidos = (r.prospect.contexto_comercial as { horarios_oferecidos?: string[] }).horarios_oferecidos ?? [];
    expect(oferecidos.length).toBe(2);
    expect(oferecidos[0]).toMatch(/^2026-09-16T10:00:00-03:00$/);
  });
  it("'como funciona?' com o decisor NÃO agenda (§17)", async () => {
    const r = await fala("decisor_contatado", "como funciona?");
    expect(r.estagio_depois).toBe("decisor_contatado");
    expect(r.respondeu).toBe(true);
    expect(r.resposta).not.toMatch(/agendad|marcad/i);
  });
  it("'pode ser quarta' escolhe a opção oferecida e marca (dry) com confirmação sem link inventado", async () => {
    const opcoes = ["2026-09-16T10:00:00-03:00", "2026-09-17T15:00:00-03:00"];
    expect(casarOpcao("pode ser quarta", opcoes)).toBe(opcoes[0]); // 16/09/2026 é quarta
    expect(casarOpcao("o segundo", opcoes)).toBe(opcoes[1]);
    expect(casarOpcao("às 15h", opcoes)).toBe(opcoes[1]);
    const r = await fala("horario_proposto", "pode ser quarta", { contexto_comercial: { horarios_oferecidos: opcoes, tipo_reuniao: "visita" } as never });
    expect(r.estagio_depois).toBe("reuniao_agendada");
    expect(r.resposta).toMatch(/^Fechado, Marcelo/);
    expect(r.resposta).not.toContain("meet.google.com");
  });
  it("'sim' com duas opções pede para escolher", async () => {
    const opcoes = ["2026-09-16T10:00:00-03:00", "2026-09-17T15:00:00-03:00"];
    const r = await fala("horario_proposto", "sim, pode", { contexto_comercial: { horarios_oferecidos: opcoes } as never });
    expect(r.estagio_depois).toBe("horario_proposto");
    expect(r.resposta).toMatch(/Qual dos dois/);
  });
  it("opt-out é terminal e silencia depois", async () => {
    const r = await fala("followup", "não me mande mais mensagens");
    expect(r.estagio_depois).toBe("nao_perturbe");
    expect(r.resposta).toContain("não vou mais te incomodar");
    const r2 = await fala("nao_perturbe", "oi?");
    expect(r2.respondeu).toBe(false);
  });
  it("preço: redireciona para o Roberto; na segunda vez chama humano", async () => {
    const r = await fala("decisor_contatado", "quanto custa?");
    expect(r.resposta).toContain("quem fala é o Roberto");
    expect(r.precisa_humano).toBeFalsy();
    const r2 = await fala("decisor_contatado", "mas qual o valor?", { objecoes: ["perguntou preço"] });
    expect(r2.precisa_humano).toBe(true);
  });
  it("'me chama mês que vem' → momento ruim, cadência cancelada, retomar em ~30 dias", async () => {
    const r = await fala("decisor_contatado", "me chama mês que vem, estou fechando a reforma da loja");
    expect(r.intent?.intent).toBe("RETORNAR_DEPOIS");
    expect(r.estagio_depois).toBe("momento_ruim");
    expect(r.prospect.cadencia_cancelada).toBe(true);
    expect(r.prospect.next_action_type).toBe("RETOMAR");
    expect(r.prospect.next_action_at).toMatch(/^2026-10-15/);
    expect(r.prospect.contexto_comercial.motivo_retorno).toContain("reforma");
    expect(r.resposta).toMatch(/volto a falar com você em 15 de outubro/);
  });
  it("'é robô?' responde com honestidade e não muda de etapa", async () => {
    const r = await fala("decisor_contatado", "isso é um robô?");
    expect(r.resposta).toContain("assistente comercial da Lone");
    expect(r.resposta).toContain("Roberto");
    expect(r.estagio_depois).toBe("decisor_contatado");
  });
  it("'não tenho interesse' → perdido com motivo", async () => {
    const r = await fala("decisor_contatado", "não tenho interesse, obrigado");
    expect(r.estagio_depois).toBe("perdido");
    expect(r.prospect.motivo_perda).toBe("Não interessado");
  });
  it("depois do handoff o agente só observa e chama o Roberto", async () => {
    const r = await fala("handoff", "vou precisar remarcar", { owner: "ROBERTO", modo_agente: "observacao", reuniao_em: "2026-09-17T18:00:00Z" });
    expect(r.respondeu).toBe(false);
    expect(r.precisa_humano).toBe(true);
  });
  it("sem entender e sem IA → chama humano, não chuta", async () => {
    const r = await fala("decisor_contatado", "kkkk vou ver aqui com o pessoal");
    expect(r.respondeu).toBe(false);
    expect(r.precisa_humano).toBe(true);
    expect(r.motivo).toMatch(/humano/);
  });
});
