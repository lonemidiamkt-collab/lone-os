export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { apareceParaEquipe, estaPausado, hojeSP } from "@/lib/clients/pausa";
import { temSocial } from "@/lib/clients/servico";
import { carregarPosts } from "@/lib/conteudo/dados";
import { contratadoPorSemana, montarMapa, semanasDoMapa, type ClienteMapa } from "@/lib/metrics/mapa-postagem";
import { spDateStr } from "@/lib/utils";

// GET /api/gestao/mapa-postagem?semanas=8 — o mapa cliente × semana (N32): posts no ar no Instagram
// contra o contratado (seg/qua/sex). Só a gestão. Regras em lib/metrics/mapa-postagem.ts.

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  const n = Math.min(Math.max(Number(req.nextUrl.searchParams.get("semanas")) || 8, 4), 12);
  const hoje = hojeSP();
  const semanas = semanasDoMapa(hoje, n);

  const { data: cli, error } = await supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, assigned_social, join_date, created_at, service_type, ig_business_account_id, ig_public_username, posts_goal, active, churned_at, draft_status, paused_at, paused_until");
  if (error) return NextResponse.json({ error: `Não consegui ler os clientes: ${error.message}` }, { status: 500 });

  // Carteira de social do time: contratou social, não é rascunho nem ex-cliente (pausado entra, marcado).
  const clientes: ClienteMapa[] = (cli ?? [])
    .filter((c) => apareceParaEquipe(c) && !c.draft_status && temSocial(c))
    .map((c) => ({
      id: c.id as string,
      nome: ((c.nome_fantasia as string) || (c.name as string) || "Cliente").trim(),
      social: ((c.assigned_social as string) || "").trim() || null,
      entrada: ((c.join_date as string) || "").slice(0, 10) || (c.created_at ? spDateStr(c.created_at as string) : null),
      temInstagram: !!(c.ig_business_account_id || c.ig_public_username),
      pausado: estaPausado(c),
      contratadoSemana: contratadoPorSemana(c.posts_goal as number | null),
    }));

  // Sem filtro por cliente na consulta (um `in.(…)` com 40 ids pesa no header); a grade só lê os da lista.
  const { posts, erro } = await carregarPosts(semanas[0].inicio, semanas[semanas.length - 1].fim);
  if (erro) return NextResponse.json({ error: `Não consegui ler os posts do Instagram: ${erro}` }, { status: 503 });

  return NextResponse.json({ hoje, ...montarMapa({ clientes, posts, semanas, hoje }) });
}
