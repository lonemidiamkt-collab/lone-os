// app/api/meta/reconectar/route.ts — trocar o token da Meta da agência, conferindo ANTES.
//
// 25/10/2026 (auditoria de erro recuperável, 9.5). O login do Facebook voltava ao painel e o navegador
// GRAVAVA o token na hora (lib/meta/useMetaAds.ts), antes de saber de quem era o perfil, que permissões
// vinham e quantas contas ele alcançava. Perfil errado = saldos, alertas, portal e relatórios lendo outra
// coisa, e o token anterior perdido. Falha ao gravar só ia para o console.
//
// POST { token, expiresIn?, confirmar?, aceitarRisco?, aceitarCurto? } — só admin.
//   · sem `confirmar`: só confere e devolve a prévia (perfil, permissões que faltam, "de N para M contas").
//     NADA é gravado.
//   · `confirmar: true`: estende para 60 dias e grava. Se a troca perde conta da carteira ou permissão,
//     exige `aceitarRisco: true` (a tela pede a confirmação reforçada). Se a extensão falhar, NÃO grava o
//     token curto (~1h) por cima do atual — devolve `precisaDecidir: "curto"`; com `aceitarCurto: true`
//     grava o curto.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { getMetaToken } from "@/lib/traffic/sync-core";
import { contasDoToken, escoposConcedidos, perfilDoToken } from "@/lib/meta/alcance-token";
import { compararAlcance, escoposFaltando, trocaArriscada, avisosDaTroca, type PreviaTroca } from "@/lib/meta/troca-token";

async function estender(curto: string): Promise<{ ok: true; token: string; expiresIn: number } | { ok: false; erro: string }> {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID ?? process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret) return { ok: false, erro: "META_APP_SECRET não configurado no servidor" };
  const p = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: appId, client_secret: secret, fb_exchange_token: curto });
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?${p}`, { signal: AbortSignal.timeout(20_000) });
    const d = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: { message?: string } };
    if (!res.ok || !d.access_token) return { ok: false, erro: d.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, token: d.access_token, expiresIn: d.expires_in ?? 60 * 86400 };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Só um admin troca o token da Meta." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as {
    token?: unknown; expiresIn?: unknown; confirmar?: unknown; aceitarRisco?: unknown; aceitarCurto?: unknown;
  } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ error: "O login do Facebook não trouxe o token. Clique em Reconectar de novo." }, { status: 400 });

  // ── Prévia: de quem é, o que pode, o que alcança ──
  const [perfil, escopos, alcanceNovo] = await Promise.all([perfilDoToken(token), escoposConcedidos(token), contasDoToken(token)]);
  if (!perfil.ok) {
    return NextResponse.json({ error: `A Meta recusou o token novo (${perfil.erro}). Nada mudou — o token atual continua.` }, { status: 400 });
  }
  if (!escopos.ok || !alcanceNovo.ok) {
    const motivo = !escopos.ok ? escopos.erro : !alcanceNovo.ok ? alcanceNovo.erro : "";
    return NextResponse.json({ error: `Não consegui conferir o que o token novo alcança (${motivo}). Nada mudou — tente de novo.` }, { status: 502 });
  }
  const { data: carteira, error: cErr } = await supabaseAdmin
    .from("ad_accounts").select("meta_account_id, account_name, clients(name, nome_fantasia)");
  if (cErr) return NextResponse.json({ error: `Não consegui ler a carteira de contas (${cErr.message}). Nada mudou.` }, { status: 503 });
  const contas = ((carteira ?? []) as unknown as { meta_account_id: string; account_name: string | null; clients: { name?: string; nome_fantasia?: string | null } | null }[])
    .map((c) => ({ id: c.meta_account_id, nome: c.clients?.nome_fantasia || c.clients?.name || c.account_name || c.meta_account_id }));

  const atual = await getMetaToken();
  let alcanceAtual: Set<string> | null = null;
  if (atual && atual !== token) {
    const r = await contasDoToken(atual);
    if (r.ok) alcanceAtual = r.valor;
  }
  const previa: PreviaTroca = {
    perfil: perfil.valor || null,
    escoposFaltando: escoposFaltando(escopos.valor),
    alcance: compararAlcance(contas, alcanceNovo.valor, alcanceAtual),
  };
  const corpoPrevia = { previa, avisos: avisosDaTroca(previa), arriscada: trocaArriscada(previa), temTokenAtual: !!atual };

  if (body?.confirmar !== true) return NextResponse.json({ ok: true, gravado: false, ...corpoPrevia });

  if (trocaArriscada(previa) && body?.aceitarRisco !== true) {
    return NextResponse.json({
      error: `Esta troca perde ${previa.alcance.perdidas.length ? `${previa.alcance.perdidas.length} conta(s) da carteira` : ""}${previa.alcance.perdidas.length && previa.escoposFaltando.length ? " e " : ""}${previa.escoposFaltando.length ? "permissões" : ""}. Confirme o aviso na tela ou refaça o login. Nada mudou.`,
    }, { status: 409 });
  }

  // ── Estende para 60 dias. Falhou: não troca um token bom por um de ~1h sem perguntar ──
  const longo = await estender(token);
  let gravar: { token: string; expiresIn: number | null; tipo: "long" | "short" };
  if (longo.ok) {
    gravar = { token: longo.token, expiresIn: longo.expiresIn, tipo: "long" };
  } else if (body?.aceitarCurto === true) {
    const exp = typeof body?.expiresIn === "number" && Number.isFinite(body.expiresIn) ? body.expiresIn : null;
    gravar = { token, expiresIn: exp, tipo: "short" };
  } else {
    return NextResponse.json({
      ok: false, gravado: false, precisaDecidir: "curto", ...corpoPrevia,
      erro: `A troca pelo token de 60 dias falhou (${longo.erro}). O token atual continua valendo. Dá para salvar o token curto, que dura cerca de 1 hora.`,
    });
  }

  const agora = new Date().toISOString();
  const linhas = [
    { key: "meta_token", value: gravar.token, updated_at: agora },
    { key: "meta_token_type", value: gravar.tipo, updated_at: agora },
    ...(gravar.expiresIn ? [{ key: "meta_token_expires_at", value: String(Date.now() + (gravar.expiresIn - 300) * 1000), updated_at: agora }] : []),
  ];
  const { error } = await supabaseAdmin.from("agency_settings").upsert(linhas, { onConflict: "key" });
  if (error) return NextResponse.json({ error: `Não consegui gravar o token novo (${error.message}). O atual continua.` }, { status: 500 });
  if (!gravar.expiresIn) {
    // Sem validade informada: não deixa a data do token anterior valendo para o novo.
    await supabaseAdmin.from("agency_settings").delete().eq("key", "meta_token_expires_at");
  }
  return NextResponse.json({ ok: true, gravado: true, tipo: gravar.tipo, ...corpoPrevia });
}
