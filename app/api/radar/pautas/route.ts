export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// GET  /api/radar/pautas — o que o Radar achou, pronto para o social media decidir.
// POST /api/radar/pautas — registra a decisão (usada / descartada / guardada).
//
// Sem esta tela o Radar produz e ninguém vê — foi o que aconteceu com os alertas de queda, que
// ficaram meses sendo detectados sem nunca chegar a ninguém. E a decisão não é só burocracia: pauta
// descartada com motivo é o único jeito de o sistema aprender o que NÃO serve para este time.

export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status") || "nova";
  const { data: pautas, error } = await supabaseAdmin
    .from("radar_pautas")
    .select("id, client_id, cliente_nome, nicho, tendencia, perfis_na_tendencia, fit_score, ideia, hook, formato, roteiro, cta, porque_funciona, referencias, status, decidido_por, decidido_em, trend_id, created_at")
    .eq("status", status)
    .order("fit_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A referência precisa vir com contexto, senão o link sozinho não diz nada: o social media tem
  // que ver de QUEM é, o tamanho do perfil e quanto aquilo performou acima do normal dele.
  const links = [...new Set((pautas ?? []).flatMap((p) => (p.referencias as string[]) ?? []))];
  const contexto = new Map<string, Record<string, unknown>>();
  if (links.length) {
    const { data: midias } = await supabaseAdmin.from("radar_media")
      .select("permalink, outlier_ratio, posted_at, media_type, analysis_level, profile_id, followers_na_coleta")
      .in("permalink", links);
    const perfilIds = [...new Set((midias ?? []).map((m) => m.profile_id as string))];
    const { data: perfis } = perfilIds.length
      ? await supabaseAdmin.from("radar_profiles").select("id, username, followers, faixa").in("id", perfilIds)
      : { data: [] as Record<string, unknown>[] };
    const porId = new Map((perfis ?? []).map((p) => [p.id as string, p]));
    for (const m of midias ?? []) {
      const p = porId.get(m.profile_id as string);
      contexto.set(m.permalink as string, {
        perfil: p?.username ?? "?",
        seguidores: Number(m.followers_na_coleta) || Number(p?.followers) || null,
        outlier: m.outlier_ratio ? Math.round(Number(m.outlier_ratio) * 10) / 10 : null,
        quando: m.posted_at, tipo: m.media_type,
        // Diz com que material a leitura foi feita. "video" aqui significa miniatura, não o vídeo.
        nivel: m.analysis_level ?? "texto",
      });
    }
  }

  const { data: trends } = await supabaseAdmin.from("radar_trends")
    .select("id, forca, status, perfis_count, midias_count");
  const porTrend = new Map((trends ?? []).map((t) => [t.id as string, t]));

  return NextResponse.json({
    pautas: (pautas ?? []).map((p) => ({
      ...p,
      forca: porTrend.get(p.trend_id as string)?.forca ?? null,
      status_tendencia: porTrend.get(p.trend_id as string)?.status ?? null,
      referencias: ((p.referencias as string[]) ?? []).map((url) => ({ url, ...(contexto.get(url) ?? {}) })),
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { id?: string; decisao?: string; motivo?: string };
  if (!body.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  if (!["usada", "descartada", "guardada"].includes(String(body.decisao))) {
    return NextResponse.json({ error: "decisão inválida" }, { status: 400 });
  }
  if (body.decisao === "descartada" && !body.motivo) {
    // Descarte sem motivo não ensina nada — e o objetivo do botão é justamente ensinar.
    return NextResponse.json({ error: "diga por que descartou" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("radar_pautas").update({
    status: body.decisao,
    decidido_por: user.email ?? "equipe",
    decidido_em: new Date().toISOString(),
    motivo_descarte: body.decisao === "descartada" ? String(body.motivo).slice(0, 120) : null,
  }).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
