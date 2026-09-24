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
import { conteudoDaNovaVersao } from "./_versao";

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

    // ── Conteúdo: versão atual + o que o form mandou ────────────
    const { data: atual, error: atualErr } = await supabaseAdmin
      .from("client_briefings")
      .select("*")
      .eq("client_id", clientId)
      .eq("is_current", true)
      .maybeSingle();
    if (atualErr) {
      return NextResponse.json({ error: `Não consegui ler a versão atual: ${atualErr.message}` }, { status: 500 });
    }

    // ── Insere como NÃO atual, depois troca ─────────────────────
    // Desativar antes e inserir depois deixava o cliente sem briefing quando o insert falhava.
    // O índice único (1 atual por cliente) impede inserir já como atual.
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("client_briefings")
      .insert({
        ...conteudoDaNovaVersao(atual as Record<string, unknown> | null, parsed.data as Record<string, unknown>),
        client_id:  clientId,
        version:    nextVersion,
        is_current: false,
        created_by: memberId,
      })
      .select("id")
      .single();

    if (insertError) {
      Sentry.captureException(insertError, {
        extra: { client_id: clientId, user_email: user.email, version: nextVersion },
      });
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const { error: offErr } = await supabaseAdmin
      .from("client_briefings")
      .update({ is_current: false })
      .eq("client_id", clientId)
      .eq("is_current", true);
    const { error: onErr } = offErr ? { error: offErr } : await supabaseAdmin
      .from("client_briefings")
      .update({ is_current: true })
      .eq("id", inserted.id);
    if (offErr || onErr) {
      // Devolve a versão anterior como atual; a nova fica no histórico, sem apagar nada.
      if (atual?.id) await supabaseAdmin.from("client_briefings").update({ is_current: true }).eq("id", atual.id as string);
      const e = offErr ?? onErr;
      Sentry.captureException(e, { extra: { client_id: clientId, version: nextVersion } });
      return NextResponse.json({ error: `Não consegui ativar a nova versão: ${e?.message}` }, { status: 500 });
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
