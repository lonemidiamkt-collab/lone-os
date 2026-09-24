export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/conteudo/resultados?mes=YYYY-MM — a aba "Resultados" do Social.
//
// Conta o que FOI AO AR no Instagram (client_ig_posts), não o card arrastado para a coluna: no prazo
// × atrasado contra a data planejada do card que casou com o post, post sem card, card planejado
// que não saiu e o mix de formatos — por cliente e por social media. A regra de casamento é a do
// "No ar" automático (lib/conteudo/no-ar.ts); a conta, lib/conteudo/resultados.ts.
//
// client_ig_posts é só do service_role (RLS fechado), por isso a conta mora aqui e não no navegador.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { todaySP } from "@/lib/utils";
import { temSocial } from "@/lib/clients/servico";
import { carregarCards, carregarPosts, mesOuAtual, temColunasIg } from "@/lib/conteudo/dados";
import { montarResultados, limitesDoMes, type ClienteResultado } from "@/lib/conteudo/resultados";
import { somarDias, JANELA_DIAS } from "@/lib/conteudo/no-ar";

// Mesmos papéis que abrem o Social (lib/navegacao/menu.ts → CONTEUDO).
const PAPEIS = ["admin", "manager", "social", "designer"] as const;

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, [...PAPEIS]);
  if (gate instanceof NextResponse) return gate;

  const mes = mesOuAtual(req.nextUrl.searchParams.get("mes"));
  const { inicio, fim } = limitesDoMes(mes);
  const hoje = todaySP();

  const { data: linhasClientes, error: erroClientes } = await supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, assigned_social, posts_goal, last_post_date, ig_business_account_id, ig_public_username, service_type")
    .or("active.is.null,active.eq.true").is("draft_status", null);
  if (erroClientes) return NextResponse.json({ error: erroClientes.message }, { status: 500 });

  // Quem tem conteúdo com a gente: pacote com social, ou social media atribuído.
  const clientes: ClienteResultado[] = (linhasClientes ?? [])
    .filter((c) => temSocial(c as { service_type?: string | null }) || !!(c.assigned_social as string | null)?.trim())
    .map((c) => ({
      id: c.id as string,
      nome: ((c.nome_fantasia as string) || (c.name as string) || "").trim(),
      social: ((c.assigned_social as string) || "").trim() || null,
      temInstagram: !!c.ig_business_account_id || !!c.ig_public_username,
      meta: (c.posts_goal as number | null) ?? null,
      ultimoPost: (c.last_post_date as string | null) ?? null,
    }));
  const ids = clientes.map((c) => c.id);
  if (!ids.length) {
    return NextResponse.json(montarResultados({ mes, hoje, clientes: [], posts: [], cards: [] }));
  }

  // Margem dos dois lados: o casamento olha ±1 dia, e card do dia 30 pode ter saído no dia 1º.
  const [comIg, postsLidos] = await Promise.all([
    temColunasIg(),
    carregarPosts(somarDias(inicio, -(JANELA_DIAS + 1)), somarDias(fim, JANELA_DIAS + 1), ids),
  ]);
  if (postsLidos.erro) return NextResponse.json({ error: postsLidos.erro }, { status: 500 });
  const cardsLidos = await carregarCards(
    somarDias(inicio, -(JANELA_DIAS + 2)), somarDias(fim, JANELA_DIAS + 2),
    postsLidos.posts.map((p) => p.media_id), comIg,
  );
  if (cardsLidos.erro) return NextResponse.json({ error: cardsLidos.erro }, { status: 500 });

  const r = montarResultados({ mes, hoje, clientes, posts: postsLidos.posts, cards: cardsLidos.cards });
  return NextResponse.json({ ...r, hoje });
}
