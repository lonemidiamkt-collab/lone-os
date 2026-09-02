// META CAPABILITY GATEWAY — o resto do sistema não sabe de onde o dado veio.
//
// PRA QUE (Roberto, 02/09): "se MCP estiver disponível → usa MCP; se não → fallback para Marketing
// API. O resto do LanioOS nem precisa saber qual deles foi usado. Isso evita dependência
// tecnológica."
//
// ESTADO MEDIDO EM 02/09: `mcp.facebook.com/ads` EXISTE (os outros caminhos devolvem "MCP server
// not found", esse não) e responde 401 para o token da Lone. A primeira leitura disso foi ERRADA
// — dizia "a conta não está no rollout", em cima da frase do corpo. O header conta a verdade:
//
//   www-authenticate: … scope="… catalog_management … ads_mcp_management"
//
// Faltavam DOIS scopes no token, que nunca tinham sido pedidos. É consentimento, não fila de
// liberação: reautorizar resolve. Ver lib/meta/gateway/mcp.ts e /api/meta/mcp/status.
//
// O gateway segue rodando sobre a Marketing API — o que o documento define como infraestrutura
// principal de execução. O valor dele não é escolher entre dois caminhos: é impedir que o sistema
// fique amarrado à URL da Graph API, como já estava. Com o consentimento dado, o MCP entra sozinho
// na próxima janela de verificação e nada acima muda.

export type FonteMeta = "marketing-api" | "mcp";

export interface CapacidadeMeta {
  fonte: FonteMeta;
  disponivel: boolean;
  detalhe?: string;
  verificadoEm?: string;
}

export interface InsightEntidade {
  entityId: string;
  entityName?: string;
  campaignName?: string;
  adsetName?: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr?: number;
  cpm?: number;
  frequency?: number;
  conversions: number;
}

export type NivelEntidade = "campaign" | "adset" | "ad";

/**
 * O contrato. Quem consome o gateway programa contra isto, nunca contra a Graph API.
 *
 * As operações de LEITURA estão aqui. As de ESCRITA (pausar, alterar orçamento) ficam
 * deliberadamente de fora até existir a camada de política por cliente: o token já tem
 * `ads_management` concedido, e expor escrita antes dos limites seria criar o caminho fácil para o
 * acidente que a política existe para impedir.
 */
export interface ProviderMeta {
  nome: FonteMeta;
  /** Testa se este provider responde para a conta. Barato — não pode custar uma leitura completa. */
  disponivel(token: string): Promise<CapacidadeMeta>;
  insightsPorEntidade(p: {
    token: string; accountId: string; nivel: NivelEntidade;
    desde: string; ate: string;
  }): Promise<InsightEntidade[]>;
}

// ── Seleção do provider ─────────────────────────────────────────────────────

import { marketingApiProvider } from "./marketing-api";
import { mcpProvider } from "./mcp";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Ordem de preferência. MCP primeiro porque, quando autorizado, traz diagnóstico nativo da Meta. */
const PROVIDERS: ProviderMeta[] = [mcpProvider, marketingApiProvider];

/**
 * Escolhe quem atende, e GRAVA o que descobriu.
 *
 * A verificação é cara demais para rodar a cada chamada e barata demais para valer um cache eterno:
 * o rollout do MCP é progressivo, então a resposta muda sem aviso. Guardamos em radar_capabilities
 * com validade — o dia em que a Meta liberar, o sistema percebe sozinho na próxima janela em vez de
 * esperar alguém desconfiar e ir testar.
 */
export async function escolherProvider(token: string, maxIdadeHoras = 12): Promise<{ provider: ProviderMeta; capacidade: CapacidadeMeta }> {
  const { data: cache } = await supabaseAdmin
    .from("radar_capabilities").select("chave, disponivel, detalhe, testado_em")
    .in("chave", PROVIDERS.map((p) => `meta.${p.nome}`));

  const agora = Date.now();
  for (const p of PROVIDERS) {
    const linha = (cache ?? []).find((c) => c.chave === `meta.${p.nome}`);
    const idadeH = linha?.testado_em ? (agora - new Date(linha.testado_em as string).getTime()) / 3.6e6 : Infinity;

    // Cache válido e positivo: usa. Cache válido e negativo: pula sem gastar chamada. A validade
    // de 12h continua certa por outro motivo agora: o dia em que alguém reautorizar com os scopes
    // do MCP, o sistema percebe sozinho — ninguém precisa lembrar de vir mexer aqui.
    if (idadeH < maxIdadeHoras) {
      if (linha?.disponivel) {
        return { provider: p, capacidade: { fonte: p.nome, disponivel: true, detalhe: String(linha.detalhe ?? ""), verificadoEm: String(linha.testado_em) } };
      }
      continue;
    }

    const cap = await p.disponivel(token);
    await supabaseAdmin.from("radar_capabilities").upsert(
      { chave: `meta.${p.nome}`, disponivel: cap.disponivel, detalhe: cap.detalhe ?? null, testado_em: new Date().toISOString() },
      { onConflict: "chave" },
    );
    if (cap.disponivel) return { provider: p, capacidade: cap };
  }

  // Nenhum disponível: devolve a Marketing API mesmo assim, para o erro aparecer na chamada real
  // com a mensagem da Meta, em vez de virar um "nenhum provider" genérico que não ajuda a depurar.
  return {
    provider: marketingApiProvider,
    capacidade: { fonte: "marketing-api", disponivel: false, detalhe: "nenhum provider respondeu como disponível" },
  };
}
