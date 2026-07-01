export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, ymd, isBusinessDay } from "@/lib/cs/vigilancia";
import { buildPendenciasDigest, type PendenciaItem } from "@/lib/cs/pendencias";

// POST /api/system/cs-pendencias — lembrete diário das sugestões PENDENTES no grupo interno.
// Fecha o loop do suggest-only: o agente capta muito, mas card só nasce quando alguém dá "ok".
// Backstage (o cliente nunca vê). Cron sugerido: 9h BRT (= `0 12 * * 1-5`, UTC = BRT+3).
const PENDENCIAS_LIVE = true; // false = calcula e devolve o preview, mas NÃO posta no WhatsApp.

// Só cutuca pendências RECENTES (não fica nagando sobre demanda de semanas atrás).
const JANELA_DIAS = 7;

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  // ?preview=1 → calcula e devolve o texto, mas NÃO posta (pra validar com dados reais sem spammar).
  const previewOnly = req.nextUrl.searchParams.get("preview") !== null;

  const now = spNow();
  // Só em dia útil (não cutuca no fim de semana/feriado). Preview ignora o gate.
  if (!previewOnly && !(await isBusinessDay(now))) {
    return NextResponse.json({ ok: true, skip: "fora de dia útil", dia: ymd(now) });
  }

  const desde = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("cs_demandas")
    .select("cliente_nome, resumo, responsavel, urgencia, message_text")
    .eq("status", "pendente")
    .not("msg_id_sugestao", "is", null) // só as que realmente foram sugeridas no grupo
    .gte("created_at", desde)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Tira o cliente de teste do lembrete — foco no trabalho REAL (igual às métricas de acurácia).
  const itens: PendenciaItem[] = (data ?? [])
    .filter((d) => !/\(teste\)/i.test((d.cliente_nome as string) ?? ""))
    .map((d) => ({
      cliente: (d.cliente_nome as string) || "Cliente",
      resumo: (d.resumo as string) || (d.message_text as string) || "demanda",
      responsavel: (d.responsavel as string) || null,
      urgencia: (d.urgencia as string) || undefined,
    }));

  const msg = buildPendenciasDigest(itens);
  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;

  let postada = false;
  if (PENDENCIAS_LIVE && internalJid && !previewOnly && msg) {
    const r = await csSendGroupText(internalJid, msg);
    postada = r.ok;
    if (!r.ok) console.error("[cs-pendencias] post falhou:", r.error);
  }

  console.log(`[cs-pendencias] dia=${ymd(now)} pendentes=${itens.length} postada=${postada}`);
  return NextResponse.json({ ok: true, live: PENDENCIAS_LIVE, pendentes: itens.length, postada, preview: msg || "(nada pendente)" });
}
