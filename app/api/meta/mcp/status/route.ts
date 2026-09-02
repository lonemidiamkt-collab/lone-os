export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getMetaToken } from "@/lib/traffic/sync-core";
import { mcpProvider, scopesDoToken, SCOPES_MCP } from "@/lib/meta/gateway/mcp";
import { META_CONFIG } from "@/lib/meta/config";

// MCP da Meta: diagnóstico (GET) e conexão em um passo (POST).
//
// O 401 nunca foi rollout — faltavam `catalog_management` e `ads_mcp_management` no token, que
// nunca haviam sido pedidos. Medido em 02/09, o dialog da Meta ACEITA os dois para este app:
// pedir `ads_mcp_management` devolve 302 (manda para o login) enquanto um scope inventado devolve
// 500. Ou seja, não depende de App Review nem de adicionar permissão — depende de alguém
// autorizar, e só o dono da conta pode.
//
// Como isso é o único passo que não dá para automatizar, tudo em volta dele foi: o GET monta o
// link já com os escopos certos, e o POST recebe o token curto que volta da autorização, estende
// para 60 dias, confere os escopos, testa o handshake do MCP e só então grava. Sem isso o Roberto
// teria que estender o token à mão, conferir escopo à mão e descobrir o resultado depois.

/** Redirect que NÃO precisa estar cadastrado no app — a Meta devolve o token no fragmento. */
const REDIRECT_MCP = "https://www.facebook.com/connect/login_success.html";

function linkAutorizacao(): string {
  const url = new URL(`https://www.facebook.com/${META_CONFIG.graphApiVersion}/dialog/oauth`);
  url.searchParams.set("client_id", META_CONFIG.appId);
  url.searchParams.set("redirect_uri", REDIRECT_MCP);
  // Pede o que já usamos MAIS o que o MCP exige. Autorizar só com os novos derrubaria relatório,
  // portal e Instagram — o token novo substitui o antigo, não soma.
  url.searchParams.set("scope", [...new Set([...META_CONFIG.scopes, ...SCOPES_MCP])].join(","));
  url.searchParams.set("response_type", "token");
  return url.toString();
}

export async function GET(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;

  const token = await getMetaToken();
  if (!token) {
    return NextResponse.json({
      conectado: false,
      motivo: "sem token da Meta salvo em agency_settings",
      link_autorizacao: linkAutorizacao(),
    });
  }

  const [cap, tem] = await Promise.all([mcpProvider.disponivel(token), scopesDoToken(token)]);
  const faltam = SCOPES_MCP.filter((s) => !tem.includes(s));

  return NextResponse.json({
    conectado: cap.disponivel,
    detalhe: cap.detalhe,
    verificadoEm: cap.verificadoEm,
    scopes_do_token: tem,
    scopes_faltando: faltam,
    link_autorizacao: cap.disponivel ? null : linkAutorizacao(),
    como: cap.disponivel ? null : [
      "1. Abrir o link_autorizacao logado com a conta que administra o Business da Lone.",
      "2. Autorizar. A Meta redireciona para uma página em branco cuja URL tem #access_token=…",
      "3. Mandar essa URL inteira (ou só o token) num POST para esta mesma rota, campo `token`.",
      "   O resto — estender p/ 60 dias, conferir escopo, testar o MCP, salvar — é automático.",
    ],
  });
}

/** POST { token } — recebe o token curto da autorização e faz o resto sozinho. */
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  const bruto = (body?.token ?? "").trim();
  if (!bruto) return NextResponse.json({ error: "campo `token` obrigatório" }, { status: 400 });

  // Aceita a URL inteira que a Meta devolve — copiar da barra de endereço é mais fácil (e menos
  // sujeito a erro) do que garimpar o token no meio do fragmento.
  const curto = /access_token=([^&#]+)/.exec(bruto)?.[1] ?? bruto;

  // 1) Estender para 60 dias. Um token de 2h conectaria o MCP e o derrubaria na mesma tarde.
  const p = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: META_CONFIG.appId,
    client_secret: META_CONFIG.appSecret,
    fb_exchange_token: curto,
  });
  const troca = await fetch(`https://graph.facebook.com/${META_CONFIG.graphApiVersion}/oauth/access_token?${p}`,
    { signal: AbortSignal.timeout(20_000) });
  const dadosTroca = (await troca.json().catch(() => ({}))) as
    { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!troca.ok || !dadosTroca.access_token) {
    return NextResponse.json({ ok: false, etapa: "estender", erro: dadosTroca.error?.message ?? `HTTP ${troca.status}` }, { status: 400 });
  }
  const longo = dadosTroca.access_token;

  // 2) Conferir os escopos ANTES de salvar. Um token novo sem os antigos derrubaria relatório,
  // portal e Instagram — é exatamente o erro que a pressa produz aqui.
  const tem = await scopesDoToken(longo);
  const faltamMcp = SCOPES_MCP.filter((s) => !tem.includes(s));
  const perdidos = META_CONFIG.scopes.filter((s) => !tem.includes(s) && !SCOPES_MCP.includes(s));
  if (perdidos.length) {
    return NextResponse.json({
      ok: false, etapa: "conferir",
      erro: `este token perdeu escopos que o sistema usa: ${perdidos.join(", ")}. Autorize de novo marcando TODAS as permissões.`,
      nao_salvei: true,
    }, { status: 400 });
  }

  // 3) Testar o MCP de verdade com o token novo, antes de trocar o que está funcionando.
  const cap = await mcpProvider.disponivel(longo);

  // 4) Salvar. Mesmo se o MCP não conectar, um token com escopos completos é bom — mas o retorno
  // diz exatamente o que aconteceu, em vez de um "ok" que esconde meio sucesso.
  const expiraEm = Date.now() + (dadosTroca.expires_in ?? 60 * 86400) * 1000;
  const { error } = await supabaseAdmin.from("agency_settings").upsert([
    { key: "meta_token", value: longo },
    { key: "meta_token_expires_at", value: String(expiraEm) },
    { key: "meta_token_type", value: "long" },
  ], { onConflict: "key" });
  if (error) return NextResponse.json({ ok: false, etapa: "salvar", erro: error.message }, { status: 500 });

  // Invalida o cache do gateway para o MCP entrar já na próxima chamada, não daqui a 12h.
  await supabaseAdmin.from("radar_capabilities")
    .upsert({ chave: "meta.mcp", disponivel: cap.disponivel, detalhe: cap.detalhe ?? null, testado_em: new Date().toISOString() },
      { onConflict: "chave" });

  return NextResponse.json({
    ok: true,
    mcp_conectado: cap.disponivel,
    detalhe: cap.detalhe,
    escopos_faltando: faltamMcp,
    token_expira_em_dias: Math.round((expiraEm - Date.now()) / 86400000),
    escopos: tem,
  });
}
