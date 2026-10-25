export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, businessHoursSince } from "@/lib/cs/vigilancia";
import { fetchContentCards } from "@/lib/supabase/queries";
import { computeOperationalKpis } from "@/lib/kpis/operational";
import {
  cardsParados, formatRaioXGestor, formatRaioXSemCards, retrabalhoPorSocial, type ReworkEvent, type RetrabalhoDoRaioX,
} from "@/lib/cs/gestor";
import { resultadoDosEnvios, SEM_GRUPO_INTERNO, type FalhaEnvio } from "@/lib/automacoes/envios";
import type { ContentCard } from "@/lib/types";

// POST /api/system/cs-raio-x — "Raio-X do Gestor": gargalo do fluxo (lead time, prazo) + cards
// travados por social (tempo real parado na coluna). Posta no grupo interno.
// Cron sugerido: sexta 16h BRT (`0 19 * * 5`), junto do relatório semanal. ?dry=1 não posta.
export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;

  // 25/10/2026 (onda 5): cards que não foram lidos não viram "🎯 Nada travado — Fluxo em dia!". fetchContentCards
  // lança na falha; o raio-x sai dizendo que não leu (o retrabalho segue) e a rotina responde ok:false.
  let cards: ContentCard[] | null = null;
  let erroCards: string | null = null;
  try { cards = await fetchContentCards(); } // ativos (não arquivados)
  catch (e) {
    erroCards = e instanceof Error ? e.message : String(e);
    console.error("[cs-raio-x] cards não lidos:", erroCards);
  }
  const kpis = cards ? computeOperationalKpis(cards) : null;
  // businessHoursSince exige o relógio REAL (nunca spNow — deslocaria o getTime em ~3h).
  const agora = new Date();
  const parados = cards ? cardsParados(cards, (c) => businessHoursSince(c.columnEnteredAt?.[c.status], agora)) : null;

  // Retrabalho dos últimos 7 dias (log append-only — content_approvals apaga o histórico). Leitura que falha não
  // vira "0 — ninguém precisou refazer" (25/10/2026).
  const desde7d = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: reworkRows, error: erroRework } = await supabaseAdmin
    .from("cs_rework_events").select("social_media, client_name").gte("created_at", desde7d);
  if (erroRework) console.error("[cs-raio-x] retrabalho não lido:", erroRework.message);
  const retrabalho: RetrabalhoDoRaioX = erroRework ? "nao_lido" : retrabalhoPorSocial((reworkRows ?? []) as ReworkEvent[]);

  const now = spNow();
  const dataLabel = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const texto = kpis && parados ? formatRaioXGestor(kpis, parados, dataLabel, retrabalho) : formatRaioXSemCards(dataLabel, retrabalho);

  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
  let enviado = false;
  // `ok` só quando o raio-x chegou no grupo (24/10/2026, auditoria 5.12) — antes respondia ok com o envio recusado.
  const falhas: FalhaEnvio[] = [];
  if (!dry && !internalJid) falhas.push({ alvo: "grupo interno", erro: SEM_GRUPO_INTERNO });
  if (!dry && internalJid) {
    const r = await csSendGroupText(internalJid, texto, undefined, { origem: "cs-raio-x", destino: "interno" });
    enviado = r.ok;
    if (!r.ok) falhas.push({ alvo: "grupo interno", erro: r.error ?? "o WhatsApp recusou" });
  }
  console.log(`[cs-raio-x] travados=${parados?.length ?? "não lidos"} gargalo=${kpis?.bottleneck?.stage ?? "-"} dry=${dry} enviado=${enviado}`);
  const envios = resultadoDosEnvios(falhas);
  // Leitura que falhou é falha da rotina mesmo com a mensagem enviada: a Central de Automações mostra a falha.
  const leituras = [
    erroCards ? `não consegui ler os cards (${erroCards})` : null,
    erroRework ? `não consegui ler o retrabalho (${erroRework.message})` : null,
  ].filter((x): x is string => !!x);
  const erro = [...leituras, envios.erro].filter(Boolean).join("; ") || undefined;
  return NextResponse.json({ ...envios, ok: envios.ok && leituras.length === 0, ...(erro ? { erro } : {}), dry, enviado, texto, kpis, parados });
}
