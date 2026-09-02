export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";
import { getMetaToken } from "@/lib/traffic/sync-core";
import { mcpProvider, scopesDoToken, SCOPES_MCP } from "@/lib/meta/gateway/mcp";
import { META_CONFIG } from "@/lib/meta/config";

// GET /api/meta/mcp/status — por que o MCP da Meta não conecta, e o que exatamente resolve.
//
// Existe porque o diagnóstico anterior ("a conta não está no rollout") mandava esperar por algo
// que não ia chegar. O bloqueio real é consentimento: o token nunca pediu `ads_mcp_management`
// nem `catalog_management`. Só o dono da conta pode conceder — então o máximo que dá para
// automatizar é deixar o passo a passo exato, com os links certos, a uma chamada de distância.

export async function GET(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;

  const token = await getMetaToken();
  if (!token) {
    return NextResponse.json({ conectado: false, motivo: "sem token da Meta salvo em agency_settings" });
  }

  const [cap, tem] = await Promise.all([mcpProvider.disponivel(token), scopesDoToken(token)]);
  const faltam = SCOPES_MCP.filter((s) => !tem.includes(s));

  // COMO O TOKEN É OBTIDO AQUI, de verdade: não existe rota de callback no projeto e
  // `getOAuthUrl` não é chamada em lugar nenhum — o token em uso é USER type, colado à mão em
  // /settings. Montar um link OAuth com redirect_uri que não está cadastrado no app produziria um
  // erro no meio do caminho e faria parecer que a Meta recusou. O caminho honesto é o Graph API
  // Explorer, que é o fluxo que já funciona nesta conta.
  const faltamTxt = faltam.join(" + ");
  const explorer = `https://developers.facebook.com/tools/explorer/?app_id=${encodeURIComponent(META_CONFIG.appId)}`;
  // Antes do Explorer: a permissão precisa EXISTIR no app. `ads_mcp_management` é específica do
  // MCP e pode não estar adicionada — nesse caso ela nem aparece na lista para marcar, e o
  // Explorer sozinho não resolveria.
  const permissoesDoApp = `https://developers.facebook.com/apps/${encodeURIComponent(META_CONFIG.appId)}/app-review/permissions/`;

  return NextResponse.json({
    conectado: cap.disponivel,
    detalhe: cap.detalhe,
    verificadoEm: cap.verificadoEm,
    scopes_do_token: tem,
    scopes_exigidos: SCOPES_MCP,
    scopes_faltando: faltam,
    proximo_passo: cap.disponivel
      ? ["nada — MCP conectado"]
      : faltam.length
        ? [
            `1. Ver se ${faltamTxt} constam no app (link permissoes_do_app). Se ads_mcp_management não estiver na lista, é ela que precisa ser adicionada primeiro — sem isso o Explorer não tem o que marcar.`,
            `2. No Graph API Explorer, escolher o app da Lone e marcar ${faltamTxt} JUNTO das que já usamos (gerar token só com as novas derrubaria relatório, portal e Instagram).`,
            `3. Estender para 60 dias e colar em /settings. Na próxima verificação (cache de 12h) o gateway passa a usar o MCP sozinho.`,
          ]
        : ["scopes ok mas 401 — conferir se o usuário do token administra o Business da conta de anúncio"],
    permissoes_do_app: cap.disponivel ? null : permissoesDoApp,
    graph_api_explorer: cap.disponivel ? null : explorer,
  });
}
