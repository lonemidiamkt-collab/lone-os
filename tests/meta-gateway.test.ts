import { describe, it, expect, vi, afterEach } from "vitest";
import { mcpProvider } from "@/lib/meta/gateway/mcp";
import { marketingApiProvider } from "@/lib/meta/gateway/marketing-api";

// ── O 401 do MCP não era rollout: era SCOPE ────────────────────────────────
//
// A primeira leitura destes testes dizia "a conta não entrou no rollout", em cima da frase do
// corpo da resposta ("This resource is restricted to certain users"). Errado, e caro: mandava
// esperar por algo que nunca chegaria sozinho.
//
// O que a Meta realmente devolve (medido em 02/09, header, não corpo):
//   www-authenticate: Bearer resource_metadata="…/oauth-protected-resource/ads",
//     scope="ads_management ads_read catalog_management business_management pages_show_list
//            instagram_basic ads_mcp_management"
//
// O token da Lone tinha 5 dos 7 — faltavam `catalog_management` e `ads_mcp_management`, que nunca
// haviam sido pedidos porque não estavam em META_CONFIG.scopes. É consentimento, não fila.
//
// Estes testes existem para que a leitura correta não se perca: erro de autorização se lê no
// header.
describe("gateway: por que o MCP recusa", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  const RESP_401 = () => new Response(
    JSON.stringify({ title: "This resource is restricted to certain users", status: 401 }),
    {
      status: 401,
      headers: {
        "www-authenticate": 'Bearer resource_metadata="https://mcp.facebook.com/.well-known/'
          + 'oauth-protected-resource/ads", scope="ads_management ads_read catalog_management '
          + 'business_management pages_show_list instagram_basic ads_mcp_management"',
      },
    },
  );

  it("extrai do header EXATAMENTE os scopes que faltam no token", async () => {
    // 1ª chamada = handshake (401); 2ª = debug_token, devolvendo o que o token tem hoje.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(RESP_401())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { scopes: ["ads_management", "ads_read", "business_management", "instagram_basic", "pages_show_list"] },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.META_APP_ID = "app"; process.env.META_APP_SECRET = "sec";

    const c = await mcpProvider.disponivel("tok");
    expect(c.disponivel).toBe(false);
    // O diagnóstico tem que NOMEAR o que falta — "espere o rollout" não é acionável.
    expect(c.detalhe).toContain("catalog_management");
    expect(c.detalhe).toContain("ads_mcp_management");
    expect(c.detalhe).toMatch(/reautorize/i);
    expect(c.detalhe).not.toMatch(/rollout/i);
  });

  it("com todos os scopes e ainda 401, aponta para o acesso ao Business", async () => {
    // Caso diferente: o consentimento está completo, então o problema é outro — e dizer
    // "faltam scopes: (nenhum)" mandaria procurar no lugar errado.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(RESP_401())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { scopes: ["ads_management", "ads_read", "catalog_management", "business_management",
                         "pages_show_list", "instagram_basic", "ads_mcp_management"] },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const c = await mcpProvider.disponivel("tok");
    expect(c.disponivel).toBe(false);
    expect(c.detalhe).toMatch(/Business/i);
  });

  it("quando o consentimento vier, o handshake basta — sem mudar código", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ jsonrpc: "2.0", result: { serverInfo: { name: "meta-ads" } } }),
      { status: 200 },
    )));
    const c = await mcpProvider.disponivel("tok");
    expect(c.disponivel).toBe(true);
    expect(c.detalhe).toContain("meta-ads");
  });

  it("lê resposta em SSE, que é como o servidor da Meta responde", async () => {
    // O endpoint devolve text/event-stream. JSON.parse direto no corpo falharia e o handshake
    // bom seria lido como erro.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      'event: message\ndata: {"jsonrpc":"2.0","result":{"serverInfo":{"name":"meta-ads","version":"1"}}}\n\n',
      { status: 200, headers: { "content-type": "text/event-stream" } },
    )));
    const c = await mcpProvider.disponivel("tok");
    expect(c.disponivel).toBe(true);
    expect(c.detalhe).toContain("meta-ads");
  });

  it("não finge implementar o que não pôde inspecionar", async () => {
    // Continua sem mapear as ferramentas por adivinhação — mas o erro agora diz o que destrava,
    // em vez de mandar esperar.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(RESP_401())
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { scopes: ["ads_read"] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(mcpProvider.insightsPorEntidade({
      token: "t", accountId: "act_1", nivel: "ad", desde: "2026-01-01", ate: "2026-01-02",
    })).rejects.toThrow(/ads_mcp_management/);
  });
});

describe("gateway: Marketing API é a base", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("disponível quando o escopo de leitura está concedido", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: [{ permission: "ads_read", status: "granted" }, { permission: "ads_management", status: "granted" }],
    }), { status: 200 })));
    const c = await marketingApiProvider.disponivel("tok");
    expect(c.disponivel).toBe(true);
    expect(c.detalhe).toContain("ads_read");
  });

  it("sem ads_read, indisponível — e diz o que falta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: [{ permission: "public_profile", status: "granted" }],
    }), { status: 200 })));
    const c = await marketingApiProvider.disponivel("tok");
    expect(c.disponivel).toBe(false);
    expect(c.detalhe).toContain("ads_read");
  });

  it("normaliza a resposta da Graph para o contrato do gateway", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: [{
        ad_id: "123", ad_name: "ADS - VIDEO", campaign_name: "Camp", adset_name: "CJ",
        spend: "45.50", impressions: "1200", clicks: "30", ctr: "2.5", frequency: "1.8",
        date_start: "2026-08-31",
        actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "7" }],
      }],
    }), { status: 200 })));
    const r = await marketingApiProvider.insightsPorEntidade({
      token: "t", accountId: "act_1", nivel: "ad", desde: "2026-08-31", ate: "2026-08-31",
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ entityId: "123", entityName: "ADS - VIDEO", spend: 45.5, conversions: 7, frequency: 1.8 });
  });
});
