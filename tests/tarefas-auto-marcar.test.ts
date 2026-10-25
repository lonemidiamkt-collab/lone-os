// @vitest-environment node
// Auto-marcação de tarefa pelo aviso no grupo (auditoria de erro recuperável 13.1, 25/10/2026). Dados INVENTADOS.
//
// O QUE ACONTECIA: "já fiz a arte da Imperio" fechava qualquer tarefa aberta da Imperio — até a de outra pessoa e sem
// palavra em comum —, o empate pegava a primeira de uma lista sem ordem, o update não conferia erro e o dono não
// ficava sabendo. Agora: só a tarefa de quem avisou, ou a que o aviso cita; empate pergunta; "reabre" desfaz.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  escolherTarefaFeita, mesmaPessoa, textoMarquei, textoPergunta, tituloDaConfirmacao, opcoesDaPergunta,
  ehPedidoReabrir, numeroEscolhido, respostaPrometeMarcar, type TarefaAberta,
} from "@/lib/tarefas/auto-marcar";

const t = (id: string, titulo: string, cliente: string | null, dono: string | null): TarefaAberta => ({ id, titulo, cliente, dono });

describe("escolherTarefaFeita — a regra pura", () => {
  const abertas = [
    t("1", "Criar arte de piso da Imperio", "Imperio Pisos", "Bruna Exemplo"),
    t("2", "Revisar bio do Instagram", "Imperio Pisos", "Carlos Exemplo"),
  ];

  it("o erro original: o nome do cliente bastava para fechar a tarefa de OUTRA pessoa — agora não fecha", () => {
    // Carlos avisa que fez "a arte da Imperio": a única tarefa dele na Imperio é a bio (sem palavra em comum);
    // a de arte é da Bruna e o aviso não cita a tarefa (só "arte", genérica, e o cliente).
    const d = escolherTarefaFeita("Daniel Exemplo", "arte da Imperio", abertas);
    expect(d.tipo).toBe("nada");
  });

  it("tarefa de quem avisou: basta o cliente citado", () => {
    const d = escolherTarefaFeita("Bruna Exemplo", "arte da Imperio", abertas);
    expect(d).toMatchObject({ tipo: "marcar", tarefa: { id: "1" }, porque: "do_autor" });
  });

  it("tarefa de outra pessoa só quando o aviso CITA a tarefa (2+ palavras do título além do cliente)", () => {
    const d = escolherTarefaFeita("Daniel Exemplo", "revisar a bio do instagram da Imperio", abertas);
    expect(d).toMatchObject({ tipo: "marcar", tarefa: { id: "2" }, porque: "citou_a_tarefa" });
  });

  it("o aviso cita OUTRO cliente: a tarefa com título parecido fica de fora", () => {
    const lista = [t("1", "Roteiro do reels de outubro", "Nova Exemplo", "Bruna Exemplo"), t("2", "Roteiro do reels de outubro", "Imperio Pisos", "Bruna Exemplo")];
    const d = escolherTarefaFeita("Daniel Exemplo", "roteiro do reels de outubro da Imperio", lista);
    expect(d).toMatchObject({ tipo: "marcar", tarefa: { id: "2" } });
  });

  it("empate: pergunta qual foi, não marca nenhuma", () => {
    const lista = [t("1", "Arte do feed", "Imperio Pisos", "Bruna Exemplo"), t("2", "Arte do story", "Imperio Pisos", "Bruna Exemplo")];
    const d = escolherTarefaFeita("Bruna", "arte da Imperio", lista);
    expect(d.tipo).toBe("perguntar");
    if (d.tipo === "perguntar") expect(d.candidatas.map((x) => x.id).sort()).toEqual(["1", "2"]);
  });

  it("sem lista ou referência curta demais: nada", () => {
    expect(escolherTarefaFeita("Bruna", "ok", abertas).tipo).toBe("nada");
    expect(escolherTarefaFeita("Bruna", "arte da Imperio", []).tipo).toBe("nada");
  });

  it("mesmaPessoa: nome completo, ou o primeiro nome quando um lado só tem ele — 'Ana' não é 'Mariana'", () => {
    expect(mesmaPessoa("Bruna Exemplo", "bruna exemplo")).toBe(true);
    expect(mesmaPessoa("Bruna", "Bruna Exemplo")).toBe(true);
    expect(mesmaPessoa("Ana", "Mariana Exemplo")).toBe(false);
    expect(mesmaPessoa("Bruna Exemplo", "Bruna Outra")).toBe(false);
    expect(mesmaPessoa(null, "Bruna")).toBe(false);
  });
});

describe("os textos do grupo e as respostas citando", () => {
  it("a confirmação diz o título, o dono e como desfazer — e o título volta do texto citado", () => {
    const txt = textoMarquei(t("1", "Criar arte de piso", "Imperio", "Bruna Exemplo"));
    expect(txt).toContain('"Criar arte de piso"');
    expect(txt).toContain("de Bruna Exemplo");
    expect(txt).toMatch(/reabre/);
    expect(tituloDaConfirmacao(txt)).toBe("Criar arte de piso");
  });
  it("a pergunta numera as opções e o número volta do texto citado", () => {
    const txt = textoPergunta([t("1", "Arte do feed", "Imperio", "Bruna"), t("2", "Arte do story", "Imperio", null)]);
    expect(opcoesDaPergunta(txt)).toEqual(["Arte do feed", "Arte do story"]);
    expect(txt).toContain("sem dono");
  });
  it("reabre / número / promessa da IA", () => {
    expect(ehPedidoReabrir("reabre")).toBe(true);
    expect(ehPedidoReabrir("Desfaz isso")).toBe(true);
    expect(ehPedidoReabrir("não era essa")).toBe(true);
    expect(ehPedidoReabrir("tudo certo")).toBe(false);
    expect(numeroEscolhido("2")).toBe(2);
    expect(numeroEscolhido("é a 1")).toBe(1);
    expect(numeroEscolhido("opção 3")).toBe(3);
    expect(numeroEscolhido("a reunião é às 2 da tarde")).toBe(null);
    expect(respostaPrometeMarcar("Boa! Vou marcar como feita ✅")).toBe(true);
    expect(respostaPrometeMarcar("Bom dia!")).toBe(false);
  });
});

// ─── servidor: lê conferindo erro, confere o update, avisa o dono, reabre ───────────────────────────────────
type Linha = Record<string, unknown>;
const tabelas: Record<string, Linha[]> = {};
const falhas = new Set<string>();
/** Colunas que "não existem" (migration não aplicada): update que as usa falha como no PostgREST. */
const colunasAusentes = new Set<string>();
const updates: { tabela: string; valores: Linha; filtros: [string, string, unknown][] }[] = [];
const inserts: { tabela: string; valores: Linha }[] = [];

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: (tabela: string) => {
      const filtros: [string, string, unknown][] = [];
      let acao: "select" | "update" | "insert" = "select";
      let valores: Linha = {};
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.order = () => q;
      q.limit = () => q;
      q.in = (c: string, v: unknown[]) => { filtros.push(["in", c, v]); return q; };
      q.eq = (c: string, v: unknown) => { filtros.push(["eq", c, v]); return q; };
      q.neq = (c: string, v: unknown) => { filtros.push(["neq", c, v]); return q; };
      q.update = (v: Linha) => { acao = "update"; valores = v; return q; };
      q.insert = (v: Linha) => { acao = "insert"; valores = v; inserts.push({ tabela, valores: v }); return q; };
      const casa = (l: Linha) => filtros.every(([op, c, v]) => op === "eq" ? l[c] === v : op === "neq" ? l[c] !== v : (v as unknown[]).includes(l[c]));
      q.then = (ok: (v: unknown) => unknown) => {
        if (falhas.has(`${tabela}:${acao}`)) return Promise.resolve({ data: null, error: { message: `${tabela} fora do ar` } }).then(ok);
        const ausente = acao === "update" && Object.keys(valores).find((k) => colunasAusentes.has(k));
        if (ausente) return Promise.resolve({ data: null, error: { message: `Could not find the '${ausente}' column of '${tabela}' in the schema cache` } }).then(ok);
        if (acao === "insert") return Promise.resolve({ data: null, error: null }).then(ok);
        const linhas = (tabelas[tabela] ?? []).filter(casa);
        if (acao === "update") {
          updates.push({ tabela, valores, filtros: [...filtros] });
          for (const l of linhas) Object.assign(l, valores);
          return Promise.resolve({ data: linhas.map((l) => ({ id: l.id })), error: null }).then(ok);
        }
        return Promise.resolve({ data: linhas, error: null }).then(ok);
      };
      return q;
    },
  },
}));

const srv = await import("@/lib/tarefas/auto-marcar-server");

beforeEach(() => {
  srv._esquecerMensagens();
  falhas.clear();
  colunasAusentes.clear();
  updates.length = 0;
  inserts.length = 0;
  tabelas.clients = [{ id: "k1", assigned_social: "Carlos Exemplo", assigned_designer: "Bruna Exemplo", assigned_traffic: null }];
  tabelas.tasks = [
    { id: "1", title: "Criar arte de piso da Imperio", client_id: "k1", client_name: "Imperio Pisos", assigned_to: "designer", status: "pending" },
    { id: "2", title: "Revisar bio do Instagram", client_id: "k1", client_name: "Imperio Pisos", assigned_to: "Carlos Exemplo", status: "pending" },
  ];
});

describe("marcarTarefaPeloAviso", () => {
  it("o erro original, ponta a ponta: Daniel avisa 'arte da Imperio' e a tarefa da Bruna NÃO fecha", async () => {
    const r = await srv.marcarTarefaPeloAviso({ autor: "Daniel Exemplo", referencia: "arte da Imperio", mensagem: "já fiz a arte da Imperio" });
    expect(r.tipo).toBe("nada");
    expect(tabelas.tasks.every((x) => x.status === "pending")).toBe(true);
  });

  it("dona pelo papel resolvido (designer da Imperio = Bruna): fecha, anota e não avisa a si mesma", async () => {
    const r = await srv.marcarTarefaPeloAviso({ autor: "Bruna Exemplo", referencia: "arte da Imperio", mensagem: "já fiz a arte da Imperio", msgId: "m1" });
    expect(r.tipo).toBe("marcou");
    if (r.tipo === "marcou") expect(r.texto).toContain("de Bruna Exemplo");
    expect(tabelas.tasks[0].status).toBe("done");
    expect(tabelas.tasks[0].concluida_por).toBe("Bruna Exemplo");
    expect(tabelas.tasks[0].concluida_msg_id).toBe("m1");
    expect(inserts.filter((i) => i.tabela === "notifications")).toHaveLength(0);
  });

  it("fechou a tarefa de outra pessoa (citou a tarefa): o dono recebe aviso com o caminho para reabrir", async () => {
    const r = await srv.marcarTarefaPeloAviso({ autor: "Daniel Exemplo", referencia: "revisar bio do instagram", mensagem: "revisei a bio do instagram" });
    expect(r.tipo).toBe("marcou");
    const aviso = inserts.find((i) => i.tabela === "notifications");
    expect(aviso?.valores.target_user).toBe("Carlos Exemplo");
    expect(String(aviso?.valores.body)).toMatch(/Reabra em Tarefas/);
  });

  it("leitura das tarefas falha: diz que não marcou, não finge 'nenhuma aberta'", async () => {
    falhas.add("tasks:select");
    const r = await srv.marcarTarefaPeloAviso({ autor: "Bruna Exemplo", referencia: "arte da Imperio", mensagem: "x" });
    expect(r.tipo).toBe("falhou");
    if (r.tipo === "falhou") expect(r.texto).toMatch(/Não marquei nenhuma tarefa: não consegui ler as tarefas/);
  });

  it("update falha: diz que não conseguiu marcar (antes o erro era ignorado e a resposta dizia 'marquei')", async () => {
    falhas.add("tasks:update");
    const r = await srv.marcarTarefaPeloAviso({ autor: "Bruna Exemplo", referencia: "arte da Imperio", mensagem: "x" });
    expect(r.tipo).toBe("falhou");
    expect(tabelas.tasks[0].status).toBe("pending");
  });

  it("anotação sem a migration (coluna não existe): a tarefa fecha do mesmo jeito", async () => {
    colunasAusentes.add("concluida_por");
    const r = await srv.marcarTarefaPeloAviso({ autor: "Bruna Exemplo", referencia: "arte da Imperio", mensagem: "x" });
    expect(r.tipo).toBe("marcou");
    expect(tabelas.tasks[0].status).toBe("done");
    expect(tabelas.tasks[0].concluida_por).toBeUndefined();
  });
});

describe("reabre e escolha pelo número", () => {
  it("'reabre' citando a confirmação (pela memória) devolve a tarefa à cobrança", async () => {
    const r = await srv.marcarTarefaPeloAviso({ autor: "Bruna Exemplo", referencia: "arte da Imperio", mensagem: "x" });
    srv.lembrarMensagem("conf1", r);
    expect(srv.ehCitacaoDeTarefa({ texto: "reabre", quotedMsgId: "conf1", quotedText: null })).toBe(true);
    const re = await srv.responderCitacaoDeTarefa({ texto: "reabre", quotedMsgId: "conf1", quotedText: null, autor: "Bruna Exemplo" });
    expect(re?.tipo).toBe("reaberta");
    expect(tabelas.tasks[0].status).toBe("pending");
  });

  it("'reabre' depois de um restart: acha a tarefa pelo título no texto citado", async () => {
    tabelas.tasks[0].status = "done";
    const citado = textoMarquei({ id: "1", titulo: "Criar arte de piso da Imperio", cliente: "Imperio Pisos", dono: "Bruna Exemplo" });
    const re = await srv.responderCitacaoDeTarefa({ texto: "reabre", quotedMsgId: "sumiu", quotedText: citado, autor: "Bruna Exemplo" });
    expect(re?.texto).toMatch(/Reabri/);
    expect(tabelas.tasks[0].status).toBe("pending");
  });

  it("número citando a pergunta marca a opção escolhida", async () => {
    const citado = textoPergunta([
      { id: "1", titulo: "Criar arte de piso da Imperio", cliente: "Imperio Pisos", dono: "Bruna Exemplo" },
      { id: "2", titulo: "Revisar bio do Instagram", cliente: "Imperio Pisos", dono: "Carlos Exemplo" },
    ]);
    const re = await srv.responderCitacaoDeTarefa({ texto: "2", quotedMsgId: "q", quotedText: citado, autor: "Carlos Exemplo" });
    expect(re?.tipo).toBe("marcou");
    expect(tabelas.tasks[1].status).toBe("done");
    expect(tabelas.tasks[0].status).toBe("pending");
  });

  it("mensagem que não cita nada do agente sobre tarefa segue o fluxo normal", async () => {
    expect(srv.ehCitacaoDeTarefa({ texto: "reabre", quotedMsgId: "x", quotedText: "Bom dia, equipe" })).toBe(false);
    expect(await srv.responderCitacaoDeTarefa({ texto: "2", quotedMsgId: "x", quotedText: "Bom dia" , autor: null })).toBe(null);
  });
});
