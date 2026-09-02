import { describe, it, expect, vi, afterEach } from "vitest";
import { mcpProvider } from "@/lib/meta/gateway/mcp";
import { marketingApiProvider } from "@/lib/meta/gateway/marketing-api";

// Medido em 02/09: mcp.facebook.com/ads responde 401 "restricted to certain users" para o token da
// Lone, enquanto /ads/mcp e / respondem "MCP server not found". O servidor existe e o caminho está
// certo — a conta é que não entrou no rollout. O gateway precisa ler essa diferença.
describe("gateway: MCP existe mas não é nosso ainda", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("401 vira indisponível com o motivo certo, não erro genérico", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ title: "This resource is restricted to certain users", status: 401 }),
      { status: 401 },
    )));
    const c = await mcpProvider.disponivel("tok");
    expect(c.disponivel).toBe(false);
    expect(c.detalhe).toMatch(/rollout/i);
    expect(c.verificadoEm).toBeTruthy();
  });

  it("quando a Meta liberar, o handshake basta — sem mudar código", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ jsonrpc: "2.0", result: { serverInfo: { name: "meta-ads" } } }),
      { status: 200 },
    )));
    const c = await mcpProvider.disponivel("tok");
    expect(c.disponivel).toBe(true);
    expect(c.detalhe).toContain("meta-ads");
  });

  it("não finge implementar o que não pôde inspecionar", async () => {
    // Escrever o mapeamento das ferramentas por adivinhação produziria código que parece pronto e
    // quebra na primeira chamada real.
    await expect(mcpProvider.insightsPorEntidade({
      token: "t", accountId: "act_1", nivel: "ad", desde: "2026-01-01", ate: "2026-01-02",
    })).rejects.toThrow(/indispon[íi]vel/i);
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
