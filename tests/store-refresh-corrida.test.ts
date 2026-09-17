import { describe, it, expect, vi, beforeEach } from "vitest";

// A corrida do "refazer 3 vezes" (17/09): o board refaz a busca ao ganhar foco (a pessoa volta do
// WhatsApp com a referência) e a resposta VELHA chegava depois do card criado, substituindo o estado
// inteiro — o card sumia da tela embora o servidor tivesse gravado. Aqui: busca lenta em voo,
// criação no meio, e o card TEM que continuar na tela.
const respostas: Record<string, () => Promise<Response>> = {};
vi.mock("@/lib/supabase/authed-fetch", () => ({ authedFetch: async (url: string) => { const k = Object.keys(respostas).find((p) => url.startsWith(p)); return k ? respostas[k]() : new Response("{}", { status: 404 }); } }));
vi.mock("sonner", () => ({ toast: { warning: () => {}, error: () => {}, success: () => {}, info: () => {} } }));
vi.mock("@/lib/supabase/client", () => ({ supabase: {}, REALTIME_ENABLED: false }));

const { useContentStore } = await import("@/stores/useContentStore");
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const card = (id: string, title: string) => ({ id, title, clientId: "c1", clientName: "Cliente", socialMedia: "Carlos", status: "ideas" as const, priority: "medium" as const, format: "Post" }) as unknown as import("@/lib/types").ContentCard;

beforeEach(() => {
  useContentStore.setState({ contentCards: [card("a", "Antigo")], designRequests: [], contentApprovals: [], socialReports: [], initialized: true, loading: false, versao: "v1" });
});

describe("refresh não apaga o que acabou de ser criado", () => {
  it("busca disparada ANTES da criação chega DEPOIS: o card novo continua na tela", async () => {
    let soltar: (r: Response) => void = () => {};
    respostas["/api/data/content"] = () => new Promise<Response>((res) => { soltar = res; });
    respostas["/api/content-cards/create"] = async () => json({ id: "novo-1" });

    const busca = useContentStore.getState().refresh();            // 1) foco na janela → busca sai (lenta)
    await new Promise((r) => setTimeout(r, 5));
    await useContentStore.getState().addContentCard(card("", "Novo") as never); // 2) pessoa cria o card
    expect(useContentStore.getState().contentCards.map((c) => c.title)).toEqual(["Antigo", "Novo"]);

    soltar(json({ contentCards: [card("a", "Antigo")], designRequests: [], contentApprovals: [], socialReports: [], versao: "v0" })); // 3) resposta velha, sem o novo
    await busca;
    // ANTES: ["Antigo"] — o card sumia. AGORA: descartada.
    expect(useContentStore.getState().contentCards.map((c) => c.title)).toEqual(["Antigo", "Novo"]);
  });

  it("busca normal (sem escrita no meio) continua substituindo pelo servidor", async () => {
    respostas["/api/data/content"] = async () => json({ contentCards: [card("a", "Antigo"), card("b", "Do servidor")], designRequests: [], contentApprovals: [], socialReports: [], versao: "v2" });
    await useContentStore.getState().refresh();
    expect(useContentStore.getState().contentCards.map((c) => c.title)).toEqual(["Antigo", "Do servidor"]);
    expect(useContentStore.getState().versao).toBe("v2");
  });

  it("204 não mexe em nada", async () => {
    respostas["/api/data/content"] = async () => new Response(null, { status: 204 });
    useContentStore.setState({ versao: "v2" });
    await useContentStore.getState().refresh();
    expect(useContentStore.getState().contentCards).toHaveLength(1);
  });
});
