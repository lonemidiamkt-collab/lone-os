export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/conteudo/mix?clientId= — mix de conteúdo dos últimos 30 dias, por cliente (Leva 7B, N15):
// formato e tema do que foi ao ar no Instagram (client_ig_posts) contra o planejado no quadro.
// Sem clientId: todos os clientes com conteúdo. A conta é lib/conteudo/mix.ts; a leitura dos posts e
// dos cards é a mesma dos Resultados (lib/conteudo/dados.ts).

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { todaySP } from "@/lib/utils";
import { temSocial } from "@/lib/clients/servico";
import { carregarCards, carregarPosts, temColunasIg } from "@/lib/conteudo/dados";
import { janelaDoMix, montarMix, type ClienteDoMix } from "@/lib/conteudo/mix";
import { somarDias, JANELA_DIAS } from "@/lib/conteudo/no-ar";

const PAPEIS = ["admin", "manager", "social", "designer"] as const;

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, [...PAPEIS]);
  if (gate instanceof NextResponse) return gate;

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (clientId && !/^[0-9a-f-]{36}$/i.test(clientId)) return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });
  const hoje = todaySP();
  const { inicio, fim } = janelaDoMix(hoje);

  let q = supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, assigned_social, ig_business_account_id, ig_public_username, service_type")
    .or("active.is.null,active.eq.true").is("draft_status", null);
  if (clientId) q = q.eq("id", clientId);
  const { data: linhas, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const clientes: ClienteDoMix[] = (linhas ?? [])
    .filter((c) => clientId || temSocial(c as { service_type?: string | null }) || !!(c.assigned_social as string | null)?.trim())
    .map((c) => ({
      id: c.id as string,
      nome: ((c.nome_fantasia as string) || (c.name as string) || "").trim(),
      temInstagram: !!c.ig_business_account_id || !!c.ig_public_username,
    }));
  if (!clientes.length) return NextResponse.json({ inicio, fim, clientes: [] });
  const ids = clientes.map((c) => c.id);

  const [comIg, postsLidos] = await Promise.all([
    temColunasIg(),
    carregarPosts(somarDias(inicio, -(JANELA_DIAS + 1)), fim, ids),
  ]);
  if (postsLidos.erro) return NextResponse.json({ error: postsLidos.erro }, { status: 500 });
  const cardsLidos = await carregarCards(somarDias(inicio, -(JANELA_DIAS + 2)), somarDias(fim, JANELA_DIAS + 2), postsLidos.posts.map((p) => p.media_id), comIg);
  if (cardsLidos.erro) return NextResponse.json({ error: cardsLidos.erro }, { status: 500 });

  return NextResponse.json({
    inicio, fim,
    clientes: montarMix({ clientes, posts: postsLidos.posts, cards: cardsLidos.cards.filter((c) => ids.includes(c.client_id)), hoje }),
  });
}
