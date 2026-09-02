// Provider do MCP oficial da Meta — pronto para quando a conta entrar no rollout.
//
// MEDIDO EM 02/09/2026, não suposto:
//   POST https://mcp.facebook.com/ads      → 401 "This resource is restricted to certain users"
//   POST https://mcp.facebook.com/ads/mcp  → 404 "MCP server not found for path"
//   POST https://mcp.facebook.com/         → 404 "MCP server not found for path"
//
// A leitura disso importa: o servidor EXISTE e `/ads` é o caminho válido — os outros dois devolvem
// "server not found" e esse devolve erro de autorização. Ou seja, não é URL errada; é a conta da
// Lone que ainda não foi liberada.
//
// Este arquivo existe para que a liberação seja uma troca de configuração, não uma reescrita. O
// `disponivel()` faz o handshake de verdade a cada verificação, então no dia em que a Meta liberar
// o gateway passa a usá-lo sozinho — sem ninguém precisar lembrar de conferir.

import type { CapacidadeMeta, InsightEntidade, NivelEntidade, ProviderMeta } from "./index";

const MCP_URL = process.env.META_MCP_URL || "https://mcp.facebook.com/ads";

async function rpc(token: string, metodo: string, params?: Record<string, unknown>) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: metodo, ...(params ? { params } : {}) }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

export const mcpProvider: ProviderMeta = {
  nome: "mcp",

  async disponivel(token: string): Promise<CapacidadeMeta> {
    try {
      const { status, json } = await rpc(token, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "loneos", version: "1" },
      });
      if (status === 401) {
        return {
          fonte: "mcp", disponivel: false,
          detalhe: "conta fora do rollout (401: restrito a certos usuários)",
          verificadoEm: new Date().toISOString(),
        };
      }
      if (status >= 400) {
        return { fonte: "mcp", disponivel: false, detalhe: `HTTP ${status}`, verificadoEm: new Date().toISOString() };
      }
      const r = json as { result?: { serverInfo?: { name?: string } } } | null;
      return {
        fonte: "mcp", disponivel: true,
        detalhe: `handshake ok${r?.result?.serverInfo?.name ? ` (${r.result.serverInfo.name})` : ""}`,
        verificadoEm: new Date().toISOString(),
      };
    } catch (e) {
      return { fonte: "mcp", disponivel: false, detalhe: String(e).slice(0, 80), verificadoEm: new Date().toISOString() };
    }
  },

  async insightsPorEntidade(): Promise<InsightEntidade[]> {
    // Deliberadamente não implementado por adivinhação. O documento aponta que a superfície de
    // ferramentas do MCP vem mudando entre contas; escrever agora um mapeamento baseado em schema
    // que não pude inspecionar produziria código que parece pronto e quebra na primeira chamada
    // real. Quando o acesso liberar, `tools/list` diz os nomes e aí isto se escreve em minutos.
    throw new Error("MCP indisponível para esta conta — use marketing-api");
  },
};
