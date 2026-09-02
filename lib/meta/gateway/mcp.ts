// Provider do MCP oficial da Meta.
//
// ── O QUE EU TINHA ESCRITO AQUI ANTES ESTAVA ERRADO ─────────────────────────
// A versão anterior deste arquivo dizia "a conta da Lone não está no rollout", em cima do 401
// "This resource is restricted to certain users". A mensagem da Meta é enganosa e eu parei nela.
// O que resolve o caso não está no corpo da resposta, está no HEADER (RFC 9728):
//
//   www-authenticate: Bearer resource_metadata="https://mcp.facebook.com/.well-known/
//     oauth-protected-resource/ads", scope="ads_management ads_read catalog_management
//     business_management pages_show_list instagram_basic ads_mcp_management"
//
// O servidor está dizendo QUAIS scopes exige. O token da Lone (medido em 02/09 via debug_token)
// tem ads_management, ads_read, business_management, instagram_basic, instagram_content_publish,
// instagram_manage_insights, pages_read_engagement, pages_show_list, public_profile — e NÃO tem
// `catalog_management` nem `ads_mcp_management`. Não é rollout: é consentimento que nunca foi
// pedido, porque `META_CONFIG.scopes` não listava esses dois.
//
// O dialog da Meta ACEITA os dois scopes para este app (testado: devolve o login, não
// "invalid scope"), então basta reautorizar. Enquanto isso não acontece, `disponivel()` devolve a
// instrução exata em vez de um diagnóstico que manda esperar por algo que não vai chegar sozinho.
//
// Lição que vale além daqui: erro de autorização se lê no header, não na frase. Uma mensagem
// educada da plataforma ("restrito a certos usuários") custou dias de espera por um rollout que
// não existia.

import type { CapacidadeMeta, InsightEntidade, NivelEntidade, ProviderMeta } from "./index";

const MCP_URL = process.env.META_MCP_URL || "https://mcp.facebook.com/ads";
const PROTOCOLO = "2025-06-18";

/** Scopes que o servidor MCP exige. Vem do header; a constante é só o fallback se ele mudar. */
export const SCOPES_MCP = [
  "ads_management", "ads_read", "catalog_management",
  "business_management", "pages_show_list", "instagram_basic", "ads_mcp_management",
];

/** Extrai os scopes do www-authenticate. É a fonte VIVA — se a Meta mudar a exigência, aparece aqui. */
export function scopesExigidos(wwwAuth: string | null): string[] {
  const m = /scope="([^"]+)"/.exec(wwwAuth ?? "");
  return m ? m[1].split(/\s+/).filter(Boolean) : SCOPES_MCP;
}

type Rpc = { status: number; json: unknown; wwwAuth: string | null };

async function rpc(token: string, metodo: string, params?: Record<string, unknown>): Promise<Rpc> {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // O servidor da Meta responde em SSE quando o cliente aceita; sem este Accept ele recusa
      // com 406 antes mesmo de olhar o token.
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOLO,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: metodo, ...(params ? { params } : {}) }),
    signal: AbortSignal.timeout(30_000),
  });
  const texto = await res.text().catch(() => "");
  // Resposta em SSE vem como "event: message\ndata: {...}" — o JSON está na linha data:.
  const corpo = texto.startsWith("event:") || texto.includes("\ndata:")
    ? (/^data:\s*(.+)$/m.exec(texto)?.[1] ?? texto)
    : texto;
  let json: unknown = null;
  try { json = JSON.parse(corpo); } catch { json = corpo.slice(0, 300); }
  return { status: res.status, json, wwwAuth: res.headers.get("www-authenticate") };
}

export const mcpProvider: ProviderMeta = {
  nome: "mcp",

  async disponivel(token: string): Promise<CapacidadeMeta> {
    const verificadoEm = new Date().toISOString();
    try {
      const { status, json, wwwAuth } = await rpc(token, "initialize", {
        protocolVersion: PROTOCOLO,
        capabilities: {},
        clientInfo: { name: "loneos", version: "1" },
      });

      if (status === 401) {
        // A diferença entre "espere" e "faça isto" mora aqui. Nomeia o que falta no token atual.
        const exigidos = scopesExigidos(wwwAuth);
        const tem = await scopesDoToken(token);
        const faltam = exigidos.filter((s) => !tem.includes(s));
        return {
          fonte: "mcp", disponivel: false, verificadoEm,
          detalhe: faltam.length
            ? `faltam os scopes ${faltam.join(", ")} — reautorize a Meta em /settings`
            : "401 mesmo com todos os scopes concedidos — verificar acesso do usuário ao Business",
        };
      }
      if (status >= 400) return { fonte: "mcp", disponivel: false, detalhe: `HTTP ${status}`, verificadoEm };

      const r = json as { result?: { serverInfo?: { name?: string; version?: string } } } | null;
      const info = r?.result?.serverInfo;
      return {
        fonte: "mcp", disponivel: true, verificadoEm,
        detalhe: `handshake ok${info?.name ? ` (${info.name}${info.version ? ` ${info.version}` : ""})` : ""}`,
      };
    } catch (e) {
      return { fonte: "mcp", disponivel: false, detalhe: String(e).slice(0, 80), verificadoEm };
    }
  },

  async insightsPorEntidade(p: {
    token: string; accountId: string; nivel: NivelEntidade; desde: string; ate: string;
  }): Promise<InsightEntidade[]> {
    // Continua sem mapeamento por adivinhação: os nomes das ferramentas saem de `tools/list`, e
    // só dá para lê-los depois que o handshake passa. A diferença para antes é que agora a
    // mensagem diz o que destrava, em vez de mandar esperar.
    const { status, json, wwwAuth } = await rpc(p.token, "tools/list");
    if (status === 401) {
      const tem = await scopesDoToken(p.token);
      const faltam = scopesExigidos(wwwAuth).filter((s) => !tem.includes(s));
      throw new Error(`MCP sem autorização — faltam os scopes: ${faltam.join(", ") || "(nenhum identificado)"}`);
    }
    if (status >= 400) throw new Error(`MCP respondeu HTTP ${status}`);
    const nomes = ((json as { result?: { tools?: { name?: string }[] } })?.result?.tools ?? [])
      .map((t) => t.name).filter(Boolean);
    throw new Error(`MCP conectado; ferramentas disponíveis: ${nomes.join(", ") || "(nenhuma)"} — mapear antes de usar`);
  },
};

/** Scopes REAIS do token, pela Graph. Sem isto o diagnóstico viraria chute sobre o que falta. */
export async function scopesDoToken(token: string): Promise<string[]> {
  const appId = process.env.META_APP_ID ?? process.env.NEXT_PUBLIC_META_APP_ID ?? "";
  const secret = process.env.META_APP_SECRET ?? "";
  if (!appId || !secret) return [];
  try {
    const url = `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}`
      + `&access_token=${encodeURIComponent(`${appId}|${secret}`)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const j = (await res.json()) as { data?: { scopes?: string[] } };
    return j?.data?.scopes ?? [];
  } catch {
    return [];
  }
}
