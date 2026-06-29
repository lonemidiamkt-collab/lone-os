export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, ymd, isFirmPostingDay, isWeekday } from "@/lib/cs/vigilancia";
import { buildPostingReport, type PostingClient } from "@/lib/cs/postagem";

// POST /api/system/cs-postagem — relatório de POSTAGEM do dia, no grupo da equipe.
// Dia firme (seg/sex): balanço completo (quem tem/não tem pauta). Dia fora (ter/qua/qui):
// só posta se algum cliente tiver post agendado pra hoje. Cron sugerido: dias úteis 8h30 BRT.
const POSTAGEM_LIVE = true; // false = calcula e devolve o preview, mas NÃO posta.

const WEEKDAYS_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const previewOnly = req.nextUrl.searchParams.get("preview") !== null;
  const now = spNow();
  if (!isWeekday(now)) {
    return NextResponse.json({ ok: true, skip: "fim de semana", dia: ymd(now) });
  }

  const hoje = ymd(now);
  const firme = isFirmPostingDay(now); // seg/sex
  const diaLabel = `${WEEKDAYS_PT[now.getDay()]}, ${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Clientes ATIVOS com social (os esperados a postar).
  const { data: clientsData, error: cErr } = await supabaseAdmin
    .from("clients")
    .select("id, name, assigned_social, active")
    .or("active.is.null,active.eq.true");
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  const clientes = (clientsData ?? []).filter((c) => (c.assigned_social as string)?.trim());

  // Cards com due_date = hoje (pauta do dia) → quais clientes têm post.
  const { data: cardsData } = await supabaseAdmin
    .from("content_cards")
    .select("client_id")
    .eq("due_date", hoje)
    .is("archived_at", null);
  const comPost = new Set((cardsData ?? []).map((k) => k.client_id as string));

  const lista: PostingClient[] = clientes.map((c) => ({
    nome: (c.name as string) || "Cliente",
    temPost: comPost.has(c.id as string),
  }));

  const msg = buildPostingReport({ diaLabel, firme, clientes: lista });

  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
  let postada = false;
  if (msg && POSTAGEM_LIVE && internalJid && !previewOnly) {
    const r = await csSendGroupText(internalJid, msg);
    postada = r.ok;
    if (!r.ok) console.error("[cs-postagem] post falhou:", r.error);
  }

  console.log(`[cs-postagem] ${hoje} firme=${firme} clientes=${lista.length} comPost=${comPost.size} postada=${postada} skip=${!msg}`);
  return NextResponse.json({
    ok: true, live: POSTAGEM_LIVE, dia: diaLabel, firme,
    clientes: lista.length, com_post: lista.filter((c) => c.temPost).length,
    sem_post: lista.filter((c) => !c.temPost).length,
    postada, skip: !msg, preview: msg,
  });
}
