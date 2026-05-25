export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { briefingInputSchema } from "@/lib/schemas/briefing";
import {
  canRead, canWrite,
  resolveMemberId, fetchCurrentBriefing,
  idemCacheKey, getIdemCached, setIdemCached,
} from "./_lib";

// ── GET /api/clients/[id]/briefing ────────────────────────────
// Roles: todos autenticados

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;

  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!canRead(user)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  Sentry.setContext("briefing_get", { client_id: clientId, user_email: user.email });

  try {
    const result = await fetchCurrentBriefing(clientId);
    return NextResponse.json(result);
  } catch (err) {
    Sentry.captureException(err, { extra: { client_id: clientId, user_email: user.email } });
    return NextResponse.json({ error: "Erro interno ao buscar briefing" }, { status: 500 });
  }
}

// ── POST /api/clients/[id]/briefing ───────────────────────────
// Roles: admin, manager (isAdmin)
// Cria nova versão. Nunca atualiza in-place.
// Suporta Idempotency-Key para evitar duplo-submit.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: clientId } = await params;

  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!canWrite(user)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  // ── Idempotency ──────────────────────────────────────────────
  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (idempotencyKey) {
    const cached = getIdemCached(idemCacheKey(clientId, user.id, idempotencyKey));
    if (cached) {
      return NextResponse.json(cached.body, { status: cached.status });
    }
  }

  // ── Parse + validação Zod ────────────────────────────────────
  const rawBody = await req.json().catch(() => null);
  if (rawBody === null) {
    return NextResponse.json({ error: "Body inválido ou ausente" }, { status: 400 });
  }

  const parsed = briefingInputSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  Sentry.setContext("briefing_post", {
    client_id: clientId,
    user_email: user.email,
    // LGPD: não logar conteúdo do briefing
  });

  try {
    const memberId = await resolveMemberId(user.email);

    // ── Versão seguinte ──────────────────────────────────────────
    const { data: maxRow } = await supabaseAdmin
      .from("client_briefings")
      .select("version")
      .eq("client_id", clientId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (maxRow?.version ?? 0) + 1;

    // ── Desativa versão atual ────────────────────────────────────
    await supabaseAdmin
      .from("client_briefings")
      .update({ is_current: false })
      .eq("client_id", clientId)
      .eq("is_current", true);

    // ── Insere nova versão ───────────────────────────────────────
    const payload = parsed.data;
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("client_briefings")
      .insert({
        client_id:                     clientId,
        version:                       nextVersion,
        is_current:                    true,
        created_by:                    memberId,

        resumo_estrategico:            payload.resumo_estrategico ?? null,
        produtos:                      payload.produtos            ?? [],
        publico_alvo:                  payload.publico_alvo        ?? [],
        posicionamento:                payload.posicionamento      ?? null,
        dores:                         payload.dores               ?? [],
        ganchos:                       payload.ganchos             ?? [],
        ctas:                          payload.ctas                ?? [],
        observacoes_estrategicas:      payload.observacoes_estrategicas ?? null,

        paleta_cores:                  payload.paleta_cores           ?? [],
        tipografia:                    payload.tipografia             ?? null,
        logo_url:                      payload.logo_url               ?? null,
        referencias_visuais:           payload.referencias_visuais    ?? [],
        elementos_evitar:              payload.elementos_evitar       ?? [],

        tom_voz:                       payload.tom_voz               ?? null,
        pessoa_verbal:                 payload.pessoa_verbal          ?? null,
        usa_emoji:                     payload.usa_emoji              ?? null,
        usa_giria:                     payload.usa_giria              ?? null,
        palavras_proibidas:            payload.palavras_proibidas     ?? [],
        hashtags_padrao:               payload.hashtags_padrao        ?? [],

        horarios_preferidos:           payload.horarios_preferidos           ?? null,
        produtos_destaque_atual:       payload.produtos_destaque_atual       ?? [],
        concorrentes_evitar_mencionar: payload.concorrentes_evitar_mencionar ?? [],

        observacoes_internas:          payload.observacoes_internas ?? null,
      })
      .select("id")
      .single();

    if (insertError) {
      Sentry.captureException(insertError, {
        extra: { client_id: clientId, user_email: user.email, version: nextVersion },
      });
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // ── Retorna objeto canônico da view (com completeness_percent) ─
    const { briefing, total_versions } = await fetchCurrentBriefing(clientId);

    const responseBody = { briefing, total_versions };
    const responseStatus = 201;

    if (idempotencyKey) {
      setIdemCached(idemCacheKey(clientId, user.id, idempotencyKey), responseStatus, responseBody);
    }

    return NextResponse.json(responseBody, { status: responseStatus });
  } catch (err) {
    Sentry.captureException(err, {
      extra: { client_id: clientId, user_email: user.email },
    });
    return NextResponse.json({ error: "Erro interno ao salvar briefing" }, { status: 500 });
  }
}
