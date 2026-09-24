export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { papelDoUsuario } from "@/lib/api/require-role";
import { montarLinhaDoTempo, contarPorTipo, type FontesLinha } from "@/lib/clientes/linha-do-tempo";

// GET /api/clients/[id]/linha-do-tempo?dias=90 — A LINHA DO TEMPO ÚNICA do cliente (Leva 7C, N20).
// Registro (timeline_entries) + conversa no grupo (1 linha por dia) + reuniões + perguntas do cliente
// + pedidos de arte + aprovações + NPS. As regras de junção estão em lib/clientes/linha-do-tempo.ts.
//
// Quem vê a ficha vê a linha do tempo. A CONVERSA do grupo (o que o cliente escreveu) segue a regra do
// "humor do cliente" na aba Relacionamento: designer e comercial não recebem — a linha vem sem ela.
// Cada fonte falha sozinha: uma tabela fora do ar vira aviso, não linha do tempo vazia.

const MAX_DIAS = 400;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const papel = await papelDoUsuario(user);
  if (!papel) return NextResponse.json({ error: "Sem permissão para esta área." }, { status: 403 });
  const { id } = await params;

  const dias = Math.min(MAX_DIAS, Math.max(7, Number(req.nextUrl.searchParams.get("dias") ?? 90) || 90));
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const veConversa = papel !== "designer" && papel !== "comercial";

  const [reg, msg, reu, perg, arte, aprov, nps] = await Promise.all([
    supabaseAdmin.from("timeline_entries").select("id, type, actor, description, timestamp, created_at")
      .eq("client_id", id).gte("created_at", desde).order("created_at", { ascending: false }).limit(600),
    veConversa
      ? supabaseAdmin.from("cs_message_corpus").select("created_at, is_team, author_name, text")
        .eq("client_id", id).gte("created_at", desde).order("created_at", { ascending: false }).limit(1500)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin.from("meetings").select("id, title, start_at, estado, responsavel, realizada_em")
      .eq("client_id", id).is("deleted_at", null).gte("start_at", desde).order("start_at", { ascending: false }).limit(200),
    supabaseAdmin.from("customer_requests").select("id, origin_text, author_name, status, aberta_em, respondida_em")
      .eq("client_id", id).gte("aberta_em", desde).order("aberta_em", { ascending: false }).limit(200),
    supabaseAdmin.from("design_requests").select("id, title, status, requested_by, created_at")
      .eq("client_id", id).gte("created_at", desde).order("created_at", { ascending: false }).limit(200),
    supabaseAdmin.from("content_cards").select("id, title, client_approved_at")
      .eq("client_id", id).gte("client_approved_at", desde).is("archived_at", null).limit(200),
    supabaseAdmin.from("cs_nps_pesquisas").select("id, nota, respondido_em, motivo")
      .eq("client_id", id).not("respondido_em", "is", null).gte("respondido_em", desde).limit(50),
  ]);

  const avisos: string[] = [];
  const ler = <T,>(nome: string, r: { data: unknown; error: { message: string } | null }): T[] => {
    if (r.error) { avisos.push(`${nome}: ${r.error.message}`); return []; }
    return (r.data ?? []) as T[];
  };

  const fontes: FontesLinha = {
    registros: ler("registro", reg),
    mensagens: ler("conversa", msg),
    reunioes: ler("reuniões", reu),
    perguntas: ler("perguntas", perg),
    pedidosArte: ler("pedidos de arte", arte),
    aprovacoes: ler("aprovações", aprov),
    nps: ler("NPS", nps),
  };
  // O registro é a fonte principal: sem ele a linha do tempo mentiria "nada aconteceu".
  if (reg.error) return NextResponse.json({ error: `Não consegui ler o histórico: ${reg.error.message}` }, { status: 500 });

  const eventos = montarLinhaDoTempo(fontes, { limite: 500 });
  return NextResponse.json({ eventos, contagem: contarPorTipo(eventos), dias, veConversa, avisos });
}
