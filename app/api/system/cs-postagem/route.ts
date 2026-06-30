export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, ymd, isWeekday } from "@/lib/cs/vigilancia";
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

  const wd = now.getDay();              // 1=seg … 5=sex
  const firme = wd === 1 || wd === 5;   // seg/sex = todos esperados
  const videoDay = wd === 3;            // quarta = dia de Reels (só quem faz vídeo)
  const hoje = ymd(now);
  const diaLabel = `${WEEKDAYS_PT[wd]}, ${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Clientes ATIVOS com social + perfil de conteúdo.
  const { data: clientsData, error: cErr } = await supabaseAdmin
    .from("clients")
    .select("id, name, assigned_social, active, perfil_conteudo")
    .or("active.is.null,active.eq.true");
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  const clientes = (clientsData ?? []).filter(
    (c) => (c.assigned_social as string)?.trim() && !(c.name as string)?.startsWith("🧪"),
  );
  const fazVideo = (c: (typeof clientes)[number]) => c.perfil_conteudo === "video" || c.perfil_conteudo === "completo";

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
    // seg/sex: todos; quarta: só quem faz vídeo; ter/qui: ninguém (dia fora)
    esperado: firme ? true : (videoDay ? fazVideo(c) : false),
  }));

  // Segunda: lembrete pra adiantar os roteiros dos vídeos de quarta.
  const videoQuarta = wd === 1 ? clientes.filter(fazVideo).map((c) => (c.name as string) || "Cliente") : undefined;

  const msg = buildPostingReport({ diaLabel, videoDay, clientes: lista, videoQuarta });

  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
  let postada = false;
  if (msg && POSTAGEM_LIVE && internalJid && !previewOnly) {
    const r = await csSendGroupText(internalJid, msg);
    postada = r.ok;
    if (!r.ok) console.error("[cs-postagem] post falhou:", r.error);
  }

  const esperadosN = lista.filter((c) => c.esperado).length;
  console.log(`[cs-postagem] ${hoje} wd=${wd} firme=${firme} video=${videoDay} esperados=${esperadosN} comPost=${comPost.size} postada=${postada} skip=${!msg}`);
  return NextResponse.json({
    ok: true, live: POSTAGEM_LIVE, dia: diaLabel, firme, video_day: videoDay,
    esperados: esperadosN,
    com_post: lista.filter((c) => c.esperado && c.temPost).length,
    sem_post: lista.filter((c) => c.esperado && !c.temPost).length,
    video_quarta: videoQuarta ?? null, postada, skip: !msg, preview: msg,
  });
}
