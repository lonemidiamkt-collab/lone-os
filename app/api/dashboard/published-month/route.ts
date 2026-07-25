export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { postsMes, postsSemana, historicoMensal } from "@/lib/metrics/producao";

// GET /api/dashboard/published-month — métricas REAIS de produção (semana, mês e histórico).
//
// A fonte é `content_card_transitions` (lib/metrics/producao.ts), alimentada pelo trigger da migration
// 078: registra o EVENTO de publicação por qualquer caminho (UI, WhatsApp, cron) e sobrevive ao card
// ser arquivado. Antes isto lia o board ao vivo — que exclui arquivados e não filtrava mês (mostrava
// 3 quando o real era 67) — e o campo manual clients.posts_this_month, que estava zerado.
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const meses = Math.min(Math.max(Number(req.nextUrl.searchParams.get("meses") ?? 6), 1), 24);
  const [mes, semana, historico, { data: prontas }] = await Promise.all([
    postsMes(), postsSemana(), historicoMensal(meses),
    // Arte ENTREGUE pelo designer e ainda não publicada: é produção feita que não virou post.
    // Sem isto, um cliente com 3 artes prontas na fila aparece como "0/12" — parecendo abandonado.
    supabaseAdmin.from("content_cards").select("client_id")
      .not("designer_delivered_at", "is", null).neq("status", "published").is("archived_at", null),
  ]);

  const artesProntas: Record<string, number> = {};
  for (const c of prontas ?? []) {
    const cid = c.client_id as string;
    if (cid) artesProntas[cid] = (artesProntas[cid] || 0) + 1;
  }

  return NextResponse.json({
    artesProntas,
    // Contrato antigo mantido (o dashboard já consome total/byMember/byClient = mês corrente).
    total: mes.total,
    byMember: mes.byMember,
    byClient: mes.byClient,
    // Novos: a visão semanal e o histórico que o dono pediu.
    semana: { total: semana.total, byMember: semana.byMember, byClient: semana.byClient },
    historico,
  });
}
