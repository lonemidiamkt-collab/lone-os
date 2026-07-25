export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { spNow, ymd } from "@/lib/cs/vigilancia";

// GET /api/dashboard/published-month — contagem REAL de posts publicados no MÊS.
// Antes o dashboard contava `status === "published"` do board ao vivo, SEM filtro de mês e SEM os
// arquivados → não batia com a realidade. Aqui: do banco, cards que viraram "published" desde o 1º dia
// do mês (BRT), INCLUINDO arquivados (o card publicado é a verdade). Devolve total + por social.
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // 1º dia do mês corrente em BRT (status_changed_at = quando o card virou publicado).
  const inicioMes = `${ymd(spNow()).slice(0, 7)}-01T00:00:00-03:00`;

  const { data, error } = await supabaseAdmin
    .from("content_cards")
    .select("social_media, client_id")
    .eq("status", "published")
    .gte("status_changed_at", inicioMes);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byMember: Record<string, number> = {};
  const byClient: Record<string, number> = {}; // posts/mês REAIS por cliente (a tabela mostrava 0/12 à toa)
  for (const c of data ?? []) {
    const m = (c.social_media as string)?.trim() || "—";
    byMember[m] = (byMember[m] || 0) + 1;
    const cid = c.client_id as string;
    if (cid) byClient[cid] = (byClient[cid] || 0) + 1;
  }
  return NextResponse.json({ total: (data ?? []).length, byMember, byClient });
}
