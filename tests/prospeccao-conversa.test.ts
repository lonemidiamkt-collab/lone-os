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
  decidirEResponder(prospectBase({ estagio, ...extra }), texto, { dry: true, cfg, agora: AGORA, historico, forcarModo: "fixo" });

describe("conversa da Rafaela (simulador, sem banco, sem IA)", () => {
  it("recepção pergunta 'sobre o que seria?' → explica curto e pergunta quem é a melhor pessoa, vai para atendente", async () => {
    const r = await fala("abordado", "sobre o que seria?");
    expect(r.intent?.intent).toBe("QUER_SABER_MAIS");
    expect(r.estagio_depois).toBe("atendente");
    expect(r.resposta).toMatch(/responsável|melhor pessoa/);
    expect(r.resposta).not.toMatch(/pre[çc]o/i);
  });
  it("recepção passa o WhatsApp do dono → decisor identificado e abordado no número direto", async () => {
    const r = await fala("atendente", "fala com ele direto no 22 99999-8888");
    expect(r.intent?.intent).toBe("PASSOU_CONTATO");
    expect(r.estagio_depois).toBe("decisor_contatado");
    expect(r.prospect.decisor_telefone).toBe("5522999998888");
    expect(r.resposta).toContain("[para 5522999998888]");
    expect(r.resposta).toMatch(/Rafaela/);
  });
  it("chegou ao decisor → contexto com gancho e PARA, sem pedir reunião", async () => {
    const r = await fala("abordado", "sou eu mesmo, pode falar");
    expect(r.intent?.intent).toBe("SOU_O_DECISOR");
    expect(r.estagio_depois).toBe("decisor_contatado");
    expect(r.resposta).toMatch(/Oi, Marcelo/); expect(r.resposta).toMatch(/duas lojas/);
    expect(r.resposta).not.toMatch(/reuni[aã]o|horário|marcar/i);
  });
  it("ritmo em etapas: interesse → confirma a cidade → convite (visita, pedindo permissão) → 2 horários", async () => {
    const r1 = await fala("decisor_contatado", "tenho interesse sim, me explica melhor");
    expect(r1.intent?.intent).toBe("INTERESSADO");
    expect(r1.estagio_depois).toBe("interesse");
    expect(r1.resposta).toMatch(/Vocês ficam em Cabo Frio, certo\?/);
    expect(r1.resposta).not.toMatch(/Tenho .* ou/);
    const r2 = await fala("interesse", "isso, ficamos em Cabo Frio", { contexto_comercial: r1.prospect.contexto_comercial });
    expect(r2.estagio_depois).toBe("interesse");
    expect(r2.resposta).toMatch(/Araruama/); expect(r2.resposta).toMatch(/eu vejo alguns horários/);
    expect((r2.prospect.contexto_comercial as { passo?: string }).passo).toBe("convite");
    const r3 = await fala("interesse", "pode ver sim", { contexto_comercial: r2.prospect.contexto_comercial });
    expect(r3.estagio_depois).toBe("horario_proposto");
    expect(r3.resposta).toMatch(/Dei uma olhada aqui na agenda dele\. Tenho .* ou .*\. Qual fica melhor/);
    const oferecidos = (r3.prospect.contexto_comercial as { horarios_oferecidos?: string[] }).horarios_oferecidos ?? [];
    expect(oferecidos.length).toBe(2);
    expect(oferecidos[0]).toMatch(/^2026-09-16T10:00:00-03:00$/);
  });
  it("'como funciona?' com o decisor NÃO agenda (§17)", async () => {
    const r = await fala("decisor_contatado", "como funciona?");
    expect(r.estagio_depois).toBe("decisor_contatado");
    expect(r.respondeu).toBe(true);
    expect(r.resposta).not.toMatch(/agendad|marcad/i);
  });
  it("'pode ser quarta' escolhe a opção oferecida e marca (dry) — visita confirma o endereço, sem link inventado", async () => {
    const opcoes = ["2026-09-16T10:00:00-03:00", "2026-09-17T15:00:00-03:00"];
    expect(casarOpcao("pode ser quarta", opcoes)).toBe(opcoes[0]); // 16/09/2026 é quarta
    expect(casarOpcao("o segundo", opcoes)).toBe(opcoes[1]);
    expect(casarOpcao("às 15h", opcoes)).toBe(opcoes[1]);
    const r = await fala("horario_proposto", "pode ser quarta", { endereco: "Av. Principal, 100", contexto_comercial: { horarios_oferecidos: opcoes, tipo_reuniao: "visita", passo: "oferecido" } as never });
    expect(r.estagio_depois).toBe("reuniao_agendada");
    expect(r.resposta).toMatch(/^Perfeito, Marcelo\. Deixei a visita combinada/);
    expect(r.resposta).toMatch(/Av\. Principal, 100\. Está certinho\?/);
    expect(r.resposta).not.toMatch(/meet\.google\.com|98153-0700/);
    expect((r.prospect.contexto_comercial as { passo?: string }).passo).toBe("confirmar_endereco");
    // Depois da reunião marcada, o "sim" do endereço é da Rafaela, não do Roberto.
    const r2 = await fala("reuniao_agendada", "sim, está certo", { owner: "ROBERTO", modo_agente: "observacao", reuniao_em: opcoes[0], contexto_comercial: r.prospect.contexto_comercial });
    expect(r2.respondeu).toBe(true); expect(r2.resposta).toMatch(/Está tudo certo então/); expect(r2.precisa_humano).toBeFalsy();
  });
  it("'sim' com duas opções pede para escolher; 'nenhum serve' pergunta o período e oferece no período", async () => {
    const opcoes = ["2026-09-16T10:00:00-03:00", "2026-09-17T15:00:00-03:00"];
    const r = await fala("horario_proposto", "sim, pode", { contexto_comercial: { horarios_oferecidos: opcoes, passo: "oferecido" } as never });
    expect(r.estagio_depois).toBe("horario_proposto");
    expect(r.resposta).toMatch(/Qual dos dois/);
    const r2 = await fala("horario_proposto", "nenhum desses dá pra mim", { contexto_comercial: { horarios_oferecidos: opcoes, passo: "oferecido" } as never });
    expect(r2.resposta).toMatch(/manhã ou tarde/);
    expect((r2.prospect.contexto_comercial as { passo?: string }).passo).toBe("periodo");
    const r3 = await fala("horario_proposto", "de tarde é melhor", { contexto_comercial: r2.prospect.contexto_comercial });
    const oferecidos = (r3.prospect.contexto_comercial as { horarios_oferecidos?: string[] }).horarios_oferecidos ?? [];
    expect(oferecidos.length).toBe(2);
    expect(oferecidos.every((iso) => /T1[456]:00/.test(iso))).toBe(true);
    expect(oferecidos).not.toContain(opcoes[1]);
  });
  it("opt-out é terminal e silencia depois", async () => {
    const r = await fala("followup", "não me mande mais mensagens");
    expect(r.estagio_depois).toBe("nao_perturbe");
    expect(r.resposta).toMatch(/Não vou mais te chamar/);
    const r2 = await fala("nao_perturbe", "oi?");
    expect(r2.respondeu).toBe(false);
  });
  it("preço: Rafaela explica sem número, oferece horário e chama o Roberto", async () => {
    const r = await fala("decisor_contatado", "quanto custa?");
    expect(r.resposta).toMatch(/prefiro não te passar um número/);
    expect(r.resposta).not.toMatch(/R\$/);
    expect(r.precisa_humano).toBe(true);
    expect(r.prospect.motivo_humano).toMatch(/pediu preço/);
  });
  it("'já tenho agência' → reconhece sem desmerecer e oferece mostrar o diferente", async () => {
    const r = await fala("decisor_contatado", "já tenho agência, obrigado");
    expect(r.intent?.intent).toBe("JA_TEM_AGENCIA");
    expect(r.resposta).toMatch(/não tem problema nenhum/);
    expect(r.prospect.objecoes).toContain("já tem agência");
  });
  it("'me chama mês que vem' → momento ruim, cadência cancelada, retomar em ~30 dias, sem chamar até lá", async () => {
    const r = await fala("decisor_contatado", "me chama mês que vem, estou fechando a reforma da loja");
    expect(r.intent?.intent).toBe("RETORNAR_DEPOIS");
    expect(r.estagio_depois).toBe("momento_ruim");
    expect(r.prospect.cadencia_cancelada).toBe(true);
    expect(r.prospect.next_action_type).toBe("RETOMAR");
    expect(r.prospect.next_action_at).toMatch(/^2026-10-15/);
    expect(r.prospect.contexto_comercial.motivo_retorno).toContain("reforma");
    expect(r.resposta).toMatch(/Vou deixar anotado para falar com você em 15 de outubro/);
    expect(r.resposta).toMatch(/não fico te chamando até lá/);
  });
  it("'é robô?' responde como Rafaela, assistente virtual, e não muda de etapa", async () => {
    const r = await fala("decisor_contatado", "isso é um robô?");
    expect(r.resposta).toMatch(/Sou a Rafaela, assistente comercial virtual/);
    expect(r.resposta).toMatch(/Roberto/);
    expect(r.estagio_depois).toBe("decisor_contatado");
  });
  it("'não tenho interesse' → perdido, sem insistir", async () => {
    const r = await fala("decisor_contatado", "não tenho interesse, obrigado");
    expect(r.estagio_depois).toBe("perdido");
    expect(r.prospect.motivo_perda).toBe("Não interessado");
    expect(r.resposta).toMatch(/Não vou insistir/);
  });
  it("depois do handoff o agente só observa e chama o Roberto (fora endereço/lembrete)", async () => {
    const r = await fala("handoff", "vou precisar remarcar", { owner: "ROBERTO", modo_agente: "observacao", reuniao_em: "2026-09-17T18:00:00Z" });
    expect(r.respondeu).toBe(false);
    expect(r.precisa_humano).toBe(true);
    const ok = await fala("handoff", "tudo certo sim", { owner: "ROBERTO", modo_agente: "observacao", reuniao_em: "2026-09-17T18:00:00Z", contexto_comercial: { passo: "lembrete" } as never });
    expect(ok.respondeu).toBe(true); expect(ok.resposta).toMatch(/Deixo tudo confirmado/);
  });
  it("sem entender e sem IA → chama humano, não chuta", async () => {
    const r = await fala("decisor_contatado", "kkkk vou ver aqui com o pessoal");
    expect(r.respondeu).toBe(false);
    expect(r.precisa_humano).toBe(true);
    expect(r.motivo).toMatch(/humano/);
  });
});
