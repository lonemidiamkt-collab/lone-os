import { describe, it, expect, vi, beforeEach } from "vitest";

// O duplo do authedFetch é uma CLOSURE simples, não um vi.fn(). O vi.fn() guarda o resultado de
// cada chamada em `mock.results`; quando esse resultado é uma promessa rejeitada, o vitest a
// contabiliza como não tratada e derruba o caso — mesmo com o catch de `chamar` funcionando.
// As chamadas ficam registradas à mão, que é tudo o que se precisa aqui.
let impl: (url: string, init?: RequestInit) => Promise<Response> = async () => {
  throw new Error("implementação não definida no teste");
};
const chamadas: Array<{ url: string; init?: RequestInit }> = [];

vi.mock("@/lib/supabase/authed-fetch", () => ({
  authedFetch: (url: string, init?: RequestInit) => {
    chamadas.push({ url, init });
    return impl(url, init);
  },
  SESSAO_EXPIRADA: "lone:sessao-expirada",
}));

const { chamar } = await import("@/lib/api/chamar");

const resposta = (status: number, corpo: string) =>
  ({ ok: status >= 200 && status < 300, status, text: async () => corpo }) as unknown as Response;

beforeEach(() => { chamadas.length = 0; });

describe("chamar — nunca deixa o clique sem resposta", () => {
  it("devolve os dados quando dá certo", async () => {
    impl = async () => resposta(200, '{"id":"abc"}');
    const r = await chamar<{ id: string }>("/api/x", { a: 1 });
    expect(r.ok).toBe(true);
    expect(r.data?.id).toBe("abc");
    expect(r.erro).toBeNull();
  });

  it("rede caída vira frase, não exceção", async () => {
    // authedFetch REJEITA quando não há rede. Em try/finally sem catch isso subia e o clique
    // morria em silêncio — só o spinner desligava.
    impl = async () => { throw new Error("Failed to fetch"); };
    const r = await chamar("/api/x", {});
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
    expect(r.erro).toMatch(/sem conex/i);
  });

  it("corpo em HTML não estoura o JSON.parse", async () => {
    // O caso real: durante um deploy o nginx devolve HTML de 502 e `await r.json()` rejeitava
    // ANTES de qualquer checagem de r.ok.
    impl = async () => resposta(502, "<html><body>502 Bad Gateway</body></html>");
    const r = await chamar("/api/x", {});
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/reiniciando/i);
    expect(r.erro).not.toMatch(/Unexpected token/i);
  });

  it("prefere a mensagem do servidor quando existe", async () => {
    impl = async () => resposta(422, '{"error":"Reunião precisa de um cliente."}');
    expect((await chamar("/api/x", {})).erro).toBe("Reunião precisa de um cliente.");
  });

  it("traduz sessão expirada", async () => {
    impl = async () => resposta(401, "");
    expect((await chamar("/api/x", {})).erro).toMatch(/sess[ãa]o/i);
  });

  it("200 com corpo vazio continua sendo sucesso", async () => {
    impl = async () => resposta(204, "");
    const r = await chamar("/api/x", {});
    expect(r.ok).toBe(true);
    expect(r.data).toBeNull();
  });

  it("monta JSON por padrão e GET quando não há corpo", async () => {
    impl = async () => resposta(200, "{}");
    await chamar("/api/x", { a: 1 });
    expect(chamadas[0].init).toMatchObject({ method: "POST", body: '{"a":1}' });
    await chamar("/api/x");
    expect(chamadas[1].init).toMatchObject({ method: "GET" });
    expect(chamadas[1].init?.body).toBeUndefined();
  });

  it("não força Content-Type em FormData", async () => {
    // O boundary do multipart vem do próprio FormData; sobrescrever quebra o upload.
    impl = async () => resposta(200, "{}");
    const fd = new FormData();
    fd.append("file", new Blob(["x"]), "a.png");
    await chamar("/api/upload", fd);
    expect(chamadas[0].init?.body).toBe(fd);
    expect(chamadas[0].init?.headers).toBeUndefined();
  });

  it("respeita o método pedido", async () => {
    impl = async () => resposta(200, "{}");
    await chamar("/api/x", { a: 1 }, { method: "PATCH" });
    expect(chamadas[0].init).toMatchObject({ method: "PATCH" });
  });
});
