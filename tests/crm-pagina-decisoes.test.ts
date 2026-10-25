// Decisões da página do comercial, do sino e de tarefas (auditoria 21/10/2026, itens 4.5, 4.11, 4.12, 4.13, 4.15).
// Dados INVENTADOS. A página /crm é grande demais para montar aqui (contextos, casco, Kanban); o que ela DECIDE fica
// conferido no código — e o sino roda de verdade (store com a rota falsa).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const api = vi.hoisted(() => ({ chamar: vi.fn() }));
vi.mock("@/lib/api/chamar", () => ({ chamar: api.chamar }));
vi.mock("@/lib/supabase/client", () => ({ supabase: {}, REALTIME_ENABLED: false }));
vi.mock("@/lib/supabase/authed-fetch", () => ({ authedFetch: vi.fn() }));

const { useNotificationsStore } = await import("@/stores/useNotificationsStore");
const PAGINA = readFileSync("app/crm/page.tsx", "utf8");
const corpo = (nome: string) => {
  const i = PAGINA.indexOf(`function ${nome}(`);
  expect(i, nome).toBeGreaterThan(-1);
  return PAGINA.slice(i, PAGINA.indexOf("\n  }\n", i));
};

beforeEach(() => { api.chamar.mockReset(); useNotificationsStore.setState({ notifications: [], initialized: false, erroCarga: null }); });

describe("4.11 — o sino não diz 'Tudo em dia' sem ter lido", () => {
  it("o erro original: a falha era engolida e a lista vazia virava 'Tudo em dia' — agora guarda o erro", async () => {
    api.chamar.mockResolvedValue({ ok: false, data: null, erro: "Não consegui carregar os avisos agora.", status: 503 });
    await useNotificationsStore.getState().init();
    expect(useNotificationsStore.getState().erroCarga).toBe("Não consegui carregar os avisos agora.");
    const centro = readFileSync("components/NotificationCenter.tsx", "utf8");
    expect(centro).toMatch(/grupos\.length === 0 && erroCarga \? null : grupos\.length === 0 \?/);
  });
  it("carregou: o erro some", async () => {
    useNotificationsStore.setState({ erroCarga: "x" });
    api.chamar.mockResolvedValue({ ok: true, data: { notifications: [] }, erro: null, status: 200 });
    await useNotificationsStore.getState().refresh();
    expect(useNotificationsStore.getState().erroCarga).toBeNull();
  });
});

describe("4.5 — abrir o WhatsApp não registra contato", () => {
  it("abrirWhatsApp e enviarWhatsApp só anotam para o 'Enviou?'", () => {
    for (const f of ["abrirWhatsApp", "enviarWhatsApp"]) {
      const c = corpo(f);
      expect(c, f).toMatch(/anotarWhatsApp\(/);
      expect(c, f).not.toMatch(/registrarToque\(|gravarRegistro\(|registrarAtividade\(/);
    }
    expect(PAGINA).toMatch(/<PerguntaEnvio pendentes=\{enviosPendentes\}/);
  });
});

describe("4.12 — o texto do histórico só some depois de gravar", () => {
  it("limpa o campo só com sucesso (antes: limpava antes da resposta)", () => {
    expect(corpo("registrarNoHistorico")).toMatch(/const ok = await registrarToque\([\s\S]*if \(ok\) setNovoTexto\(""\)/);
    expect(PAGINA).not.toMatch(/registrarAtividade\(novaTipo, novoTexto\); setNovoTexto\(""\)/);
  });
});

describe("4.13 — fechar a ficha por qualquer caminho pergunta antes de descartar", () => {
  it("clique fora, X e Cancelar passam por pedirFecharFicha (o Esc já perguntava desde 23/10)", () => {
    expect(PAGINA).not.toMatch(/onClick=\{\(\) => setDraft\(null\)\}/);
    expect((PAGINA.match(/onClick=\{pedirFecharFicha\}/g) ?? []).length).toBe(3);
    expect(PAGINA).toMatch(/pedirFecharFicha\(\);\s*\};\s*window\.addEventListener\("keydown", fechar\)/);
  });
});

describe("4.15 — a mensagem traz o motivo do servidor", () => {
  it("mover e salvar o lead usam chamar (sem a frase genérica)", () => {
    expect(PAGINA).not.toMatch(/Não foi possível mover o lead\. Tente de novo\./);
    expect(PAGINA).not.toMatch(/Não foi possível salvar o lead\. Tente de novo\./);
    expect(corpo("moverEstagio")).toMatch(/chamar<\{ lead: Lead \}>\("\/api\/crm\/leads"/);
    expect(corpo("salvar")).toMatch(/chamar<\{ lead: Lead; aviso\?: string \| null \}>\("\/api\/crm\/leads"/);
  });
  it("tarefas mostram o motivo (o store lança com a frase do servidor)", () => {
    const tarefas = readFileSync("app/tarefas/Tarefas.tsx", "utf8");
    expect(tarefas).not.toMatch(/Não deu pra concluir\. Tente de novo\.|"Falha ao reabrir\."|"Falha ao excluir\."/);
    const store = readFileSync("stores/useOperationalStore.ts", "utf8");
    expect(store).toMatch(/throw new Error\(r\.erro \?\? "Não consegui criar a tarefa\."\)/);
  });
});
