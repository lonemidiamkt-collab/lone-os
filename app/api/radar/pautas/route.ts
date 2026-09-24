export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/api/require-role";
import { todaySP } from "@/lib/utils";

// Quem abre o Planejamento (lib/navegacao/menu.ts → CONTEUDO). Antes bastava estar logado.
const PAPEIS = ["admin", "manager", "social", "designer"] as const;

// GET  /api/radar/pautas — o que o Radar achou, pronto para o social media decidir. Vem junto, por
//      cliente, as datas que ele já tem no board (`ocupadas`) — é com elas que a tela sugere a data
//      do card ("Usar esta pauta" cria o card já no próximo dia de postagem livre).
// POST /api/radar/pautas — registra a decisão (usada / descartada / guardada). Com `cardId`, liga a
//      pauta ao card que saiu dela (radar_pautas.content_card_id, migration 20260924190000).
//
// Sem esta tela o Radar produz e ninguém vê — foi o que aconteceu com os alertas de queda, que
// ficaram meses sendo detectados sem nunca chegar a ninguém. E a decisão não é só burocracia: pauta
// descartada com motivo é o único jeito de o sistema aprender o que NÃO serve para este time.

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, [...PAPEIS]);
  if (gate instanceof NextResponse) return gate;

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

  // Datas que cada cliente já tem no board daqui pra frente: a data sugerida pula essas.
  const clientIds = [...new Set((pautas ?? []).map((p) => p.client_id as string).filter(Boolean))];
  const ocupadas: Record<string, string[]> = {};
  if (clientIds.length) {
    const { data: cards } = await supabaseAdmin.from("content_cards").select("client_id, due_date")
      .in("client_id", clientIds).is("archived_at", null).gte("due_date", todaySP());
    for (const c of cards ?? []) {
      const id = c.client_id as string;
      (ocupadas[id] ??= []).push(c.due_date as string);
    }
  }

  return NextResponse.json({
    ocupadas,
    pautas: (pautas ?? []).map((p) => ({
      ...p,
      forca: porTrend.get(p.trend_id as string)?.forca ?? null,
      status_tendencia: porTrend.get(p.trend_id as string)?.status ?? null,
      referencias: ((p.referencias as string[]) ?? []).map((url) => ({ url, ...(contexto.get(url) ?? {}) })),
    })),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, [...PAPEIS]);
  if (gate instanceof NextResponse) return gate;
  const { user } = gate;

  const body = (await req.json().catch(() => ({}))) as { id?: string; decisao?: string; motivo?: string; cardId?: string };
  if (!body.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  if (!["usada", "descartada", "guardada"].includes(String(body.decisao))) {
    return NextResponse.json({ error: "decisão inválida" }, { status: 400 });
  }
  if (body.decisao === "descartada" && !body.motivo) {
    // Descarte sem motivo não ensina nada — e o objetivo do botão é justamente ensinar.
    return NextResponse.json({ error: "diga por que descartou" }, { status: 400 });
  }

  const linha: Record<string, unknown> = {
    status: body.decisao,
    decidido_por: user.email ?? "equipe",
    decidido_em: new Date().toISOString(),
    motivo_descarte: body.decisao === "descartada" ? String(body.motivo).slice(0, 120) : null,
  };
  // Liga a pauta ao card que saiu dela. A coluna vem da migration 20260924190000: antes dela, a
  // decisão grava igual e só o vínculo fica de fora (select * em vez de pedir a coluna — pedir
  // coluna inexistente dá 400 e vira alerta no Sentry).
  let ligada = false;
  if (body.decisao === "usada" && typeof body.cardId === "string" && body.cardId) {
    const { data: atual } = await supabaseAdmin.from("radar_pautas").select("*").eq("id", body.id).maybeSingle();
    if (atual && "content_card_id" in atual) { linha.content_card_id = body.cardId; ligada = true; }
  }

  const { error } = await supabaseAdmin.from("radar_pautas").update(linha).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, ligada });
}
