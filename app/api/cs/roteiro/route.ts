export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";
import { gerarRoteiros, formatRoteiro, type BriefingCliente } from "@/lib/cs/criativo";

// GET /api/cs/roteiro?clientId=…&pedido=…&estagio=…
// Lê o briefing do cliente (client_briefings) e gera 2-3 roteiros de anúncio (Método Lone).
// Suggest-only. Auth: cron (CRON_SECRET) OU usuário logado (UI). Briefing fraco → devolve perguntas.
export async function GET(req: NextRequest) {
  const denied = await requireCronOrUser(req);
  if (denied) return denied;

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });
  const pedido = req.nextUrl.searchParams.get("pedido") ?? undefined;
  const estagio = req.nextUrl.searchParams.get("estagio") ?? undefined;

  const { data: cli } = await supabaseAdmin
    .from("clients").select("name, nome_fantasia, nicho, industry").eq("id", clientId).maybeSingle();
  if (!cli) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const { data: b } = await supabaseAdmin
    .from("client_briefings")
    .select("resumo_estrategico, produtos, publico_alvo, posicionamento, dores, ganchos, ctas, tom_voz, produtos_destaque_atual, palavras_proibidas, concorrentes_evitar_mencionar")
    .eq("client_id", clientId).eq("is_current", true).maybeSingle();

  const nome = (cli.nome_fantasia as string) || (cli.name as string) || "Cliente";
  const briefing: BriefingCliente = {
    nome,
    nicho: (cli.nicho as string) || (cli.industry as string) || undefined,
    resumoEstrategico: (b?.resumo_estrategico as string) || undefined,
    produtos: (b?.produtos as string[]) || undefined,
    publicoAlvo: (b?.publico_alvo as string[]) || undefined,
    posicionamento: (b?.posicionamento as string) || undefined,
    dores: (b?.dores as string[]) || undefined,
    ganchos: (b?.ganchos as string[]) || undefined,
    ctas: (b?.ctas as string[]) || undefined,
    tomVoz: (b?.tom_voz as string) || undefined,
    produtosDestaque: (b?.produtos_destaque_atual as string[]) || undefined,
    palavrasProibidas: (b?.palavras_proibidas as string[]) || undefined,
    concorrentesEvitar: (b?.concorrentes_evitar_mencionar as string[]) || undefined,
  };

  const res = await gerarRoteiros({ briefing, pedido, estagioFunil: estagio });
  if (!res.ok || !res.data) {
    return NextResponse.json({ error: res.error || "Falha ao gerar roteiros" }, { status: 502 });
  }

  const out = res.data;
  const formatted = out.precisa_briefing
    ? [`⚠️ *Briefing insuficiente pra ${nome}* — preciso confirmar:\n` + out.perguntas.map((p) => `• ${p}`).join("\n")]
    : out.roteiros.map((r, i) => formatRoteiro(r, nome, i + 1));

  return NextResponse.json({
    ok: true, cliente: nome, tem_briefing: !!b,
    precisa_briefing: out.precisa_briefing, perguntas: out.perguntas,
    roteiros: out.roteiros.length, formatted,
  });
}
