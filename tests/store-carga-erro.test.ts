import { describe, it, expect, vi, beforeEach } from "vitest";

// Primeira carga falhando deixava initialized=false e o refresh desistia pra sempre: quadro vazio
// ("Nenhum conteúdo") até o F5. E o update falho desfazia calado.
let resposta: () => Promise<Response> = async () => new Response("{}", { status: 500 });
const erros: string[] = [];
vi.mock("@/lib/supabase/authed-fetch", () => ({ authedFetch: async () => resposta() }));
vi.mock("sonner", () => ({ toast: { warning: () => {}, error: (m: string) => { erros.push(m); }, success: () => {}, info: () => {} } }));
vi.mock("@/lib/supabase/client", () => ({ supabase: {}, REALTIME_ENABLED: false }));

const { useContentStore } = await import("@/stores/useContentStore");
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const card = { id: "a", title: "Antigo", clientId: "c1", clientName: "C", socialMedia: "S", status: "ideas", priority: "medium", format: "Post" } as unknown as import("@/lib/types").ContentCard;

beforeEach(() => {
  erros.length = 0;
  useContentStore.setState({ contentCards: [], designRequests: [], contentApprovals: [], initialized: false, loading: false, loadError: false, versao: undefined });
});

describe("carga do board", () => {
  it("falha no init marca loadError; o próximo refresh tenta de novo e limpa", async () => {
    resposta = async () => new Response("<html>502</html>", { status: 502 });
    await useContentStore.getState().init();
    expect(useContentStore.getState().loadError).toBe(true);
    expect(useContentStore.getState().initialized).toBe(false);

    resposta = async () => json({ contentCards: [card], designRequests: [], contentApprovals: [], versao: "v1" });
    await useContentStore.getState().refresh();
    expect(useContentStore.getState().initialized).toBe(true);
    expect(useContentStore.getState().loadError).toBe(false);
    expect(useContentStore.getState().contentCards).toHaveLength(1);
  });
});

describe("updateContentCard", () => {
  it("falha: desfaz, avisa uma vez e rejeita", async () => {
    useContentStore.setState({ contentCards: [card], initialized: true });
    resposta = async () => json({ error: "Campo(s) não editável(is): x" }, 400);
    await expect(useContentStore.getState().updateContentCard("a", { title: "Novo" })).rejects.toThrow();
    expect(useContentStore.getState().contentCards[0].title).toBe("Antigo");
    expect(erros).toHaveLength(1);
    expect(erros[0]).toContain("não editável");
  });
});
