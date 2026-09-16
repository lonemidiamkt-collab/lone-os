export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";

// GET /api/prospeccao/prospects?estagio=&classe=&cidade=&segmento=&q=&humano=1&limite=&pagina=
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const q = req.nextUrl.searchParams;
  const limite = Math.min(500, Number(q.get("limite") ?? "") || 200);
  const pagina = Math.max(0, Number(q.get("pagina") ?? "") || 0);
  let query = supabaseAdmin.from("prospects").select(
    "id, nome, cidade, uf, segmento, classe, score, estagio, etapa_pipeline, owner, modo_agente, precisa_humano, motivo_humano, decisor_nome, decisor_confianca, distancia_km, modalidade_preferida, telefone, whatsapp_verificado, instagram, next_action_type, next_action_at, next_action_owner, ultima_interacao_em, ultima_msg_de, reuniao_em, reuniao_tipo, ranking_dia, ranking_pos, primeira_abordagem_em, origem, created_at, updated_at",
    { count: "exact" },
  );
  const estagios = q.get("estagio")?.split(",").filter(Boolean);
  if (estagios?.length) query = query.in("estagio", estagios);
  const classes = q.get("classe")?.split(",").filter(Boolean);
  if (classes?.length) query = query.in("classe", classes);
  if (q.get("cidade")) query = query.eq("cidade", q.get("cidade")!);
  if (q.get("segmento")) query = query.eq("segmento", q.get("segmento")!);
  if (q.get("humano")) query = query.eq("precisa_humano", true);
  if (q.get("modalidade")) query = query.eq("modalidade_preferida", q.get("modalidade")!);
  const busca = q.get("q")?.trim();
  if (busca) query = query.or(`nome.ilike.%${busca}%,razao_social.ilike.%${busca}%,decisor_nome.ilike.%${busca}%,telefone.ilike.%${busca.replace(/\D/g, "") || busca}%,instagram.ilike.%${busca}%`);
  const ordem = q.get("ordem") ?? "score";
  if (ordem === "recentes") query = query.order("updated_at", { ascending: false });
  else if (ordem === "proxima") query = query.order("next_action_at", { ascending: true, nullsFirst: false });
  else query = query.order("score", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  const { data, error, count } = await query.range(pagina * limite, pagina * limite + limite - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: cidades } = await supabaseAdmin.from("prospects").select("cidade").not("cidade", "is", null).limit(5000);
  const { data: segmentos } = await supabaseAdmin.from("prospects").select("segmento").not("segmento", "is", null).limit(5000);
  const uniq = (xs: unknown[]) => Array.from(new Set(xs.map((x) => String(x)))).sort();
  return NextResponse.json({ ok: true, prospects: data ?? [], total: count ?? 0, filtros: { cidades: uniq((cidades ?? []).map((c) => c.cidade)), segmentos: uniq((segmentos ?? []).map((s) => s.segmento)) } });
}
