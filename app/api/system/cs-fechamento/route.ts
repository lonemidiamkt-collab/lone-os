export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, ymd, isWeekday } from "@/lib/cs/vigilancia";
import { buildFechamentoDia, type CardDoDia } from "@/lib/cs/postagem";

// POST /api/system/cs-fechamento — FECHA O DIA: pergunta ao TIME o que foi postado.
//
// O furo: em 30 dias o designer entregou 156 artes e só 67 viraram "publicado". Quase sempre o post
// saiu e ninguém moveu o card — e post não marcado não conta em métrica nenhuma (nem na meta da
// pessoa). Em vez de inferir (o que contaria post que não saiu), o CS pergunta no grupo da EQUIPE
// (decisão do Roberto — não no grupo do cliente) e marca com a resposta.
//
// Cron sugerido: dias úteis 18h30 BRT = `30 21 * * 1-5`. `?preview=1` calcula sem postar.
const WEEKDAYS_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const preview = req.nextUrl.searchParams.get("preview") !== null;
  const now = spNow();
  if (!preview && !isWeekday(now)) {
    return NextResponse.json({ ok: true, skip: "fim de semana" });
  }

  const hoje = ymd(now);
  const { data: cards } = await supabaseAdmin
    .from("content_cards")
    .select("id, client_id, title, status, designer_delivered_at, clients(name, nome_fantasia, active, agente_ativo)")
    .eq("due_date", hoje)
    .neq("status", "published")
    .is("archived_at", null);

  type Linha = {
    id: string; client_id: string | null; title: string | null; designer_delivered_at: string | null;
    clients: { name: string | null; nome_fantasia: string | null; active: boolean | null; agente_ativo: boolean | null } | null;
  };

  const pendentes: CardDoDia[] = ((cards ?? []) as unknown as Linha[])
    .filter((c) => c.clients && c.clients.active !== false && c.clients.agente_ativo !== false)
    .map((c) => ({
      cardId: c.id,
      cliente: (c.clients?.nome_fantasia || c.clients?.name || "—").trim(),
      titulo: (c.title || "").trim(),
      temArte: !!c.designer_delivered_at,
    }));

  const diaLabel = `${WEEKDAYS_PT[now.getDay()]}, ${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const msg = buildFechamentoDia(pendentes, diaLabel);

  const jid = process.env.CS_INTERNAL_GROUP_JID || null;
  let postada = false;
  if (msg && jid && !preview) {
    const r = await csSendGroupText(jid, msg);
    postada = r.ok;
    if (!r.ok) console.error("[cs-fechamento] post falhou:", r.error);
  }

  console.log(`[cs-fechamento] ${pendentes.length} pendentes · postada=${postada}`);
  return NextResponse.json({ ok: true, pendentes: pendentes.length, postada, preview: msg });
}
