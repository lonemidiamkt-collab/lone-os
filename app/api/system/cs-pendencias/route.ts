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

  // Expira pendências que o time nunca decidiu (ok/não) há muito tempo. Sem isso a fila só cresce
  // (58 pendentes de 22 dias na vistoria), poluindo o board e a autoavaliação. 14 dias = morta.
  // Não conta como recusa (é 'expirada', não 'descartada') pra não sujar o falso-positivo.
  // O UPDATE precisa devolver o que fez. Sem `.select()` o PostgREST não conta linha nenhuma e o
  // erro ia pro lixo: o codigo estava deployado e mesmo assim 37 pendencias com mais de 14 dias
  // continuavam "pendente", com updated_at NULL em TODAS — nunca tocou uma linha e ninguem viu.
  // Mesma classe do bug do status `blocked`, que falhava calado no enum.
  let expiradas = 0;
  let erroExpirar: string | null = null;
  let mortasHoje: { cliente: string; resumo: string }[] = [];
  if (!previewOnly) {
    const morta = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: mortas, error } = await supabaseAdmin
      .from("cs_demandas")
      .update({ status: "expirada", updated_at: new Date().toISOString() })
      .eq("status", "pendente")
      .lt("created_at", morta)
      .select("codigo, cliente_nome, resumo");
    if (error) erroExpirar = error.message;
    else {
      expiradas = mortas?.length ?? 0;
      mortasHoje = (mortas ?? [])
        .filter((d) => !/\(teste\)/i.test((d.cliente_nome as string) ?? ""))
        .map((d) => ({ cliente: (d.cliente_nome as string) || "Cliente", resumo: (d.resumo as string) || "demanda" }));
    }
    if (erroExpirar) console.error("[cs-pendencias] falha ao expirar pendencias:", erroExpirar);
  }

  const desde = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("cs_demandas")
    .select("codigo, cliente_nome, resumo, responsavel, urgencia, message_text")
    .eq("status", "pendente")
    .not("msg_id_sugestao", "is", null) // só as que realmente foram sugeridas no grupo
    .gte("created_at", desde)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Tira o cliente de teste do lembrete — foco no trabalho REAL (igual às métricas de acurácia).
  const itens: PendenciaItem[] = (data ?? [])
    .filter((d) => !/\(teste\)/i.test((d.cliente_nome as string) ?? ""))
    .map((d) => ({
      codigo: (d.codigo as string) || null,
      cliente: (d.cliente_nome as string) || "Cliente",
      resumo: (d.resumo as string) || (d.message_text as string) || "demanda",
      responsavel: (d.responsavel as string) || null,
      urgencia: (d.urgencia as string) || undefined,
    }));

  const msg = buildPendenciasDigest(itens);
  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;

  // MORRER EM SILÊNCIO ERA O PIOR DESFECHO. A expiração limpava a fila sem contar a ninguém: em 60
  // dias, 89 sugestões sumiram assim, e a checagem manual mostrou que a maioria era pedido REAL de
  // cliente (confiança média 0.85) que nunca virou trabalho. O número só apareceu numa auditoria.
  // Agora o time vê o que está sendo perdido, no dia em que se perde — e pode ressuscitar.
  if (mortasHoje.length && PENDENCIAS_LIVE && internalJid && !previewOnly) {
    const linhas = mortasHoje.slice(0, 10).map((m) => `• *${m.cliente}* — ${m.resumo.slice(0, 80)}`);
    const texto = [
      mortasHoje.length === 1
        ? "🗑️ *Um pedido de cliente foi arquivado por falta de decisão* (14 dias sem ok nem não):"
        : `🗑️ *${mortasHoje.length} pedidos de cliente foram arquivados por falta de decisão* (14 dias sem ok nem não):`,
      "",
      linhas.join("\n"),
      mortasHoje.length > 10 ? `\n_e mais ${mortasHoje.length - 10}._` : "",
      "",
      "Se algum ainda vale, me diz o cliente e o que era que eu crio o card agora.",
    ].filter(Boolean).join("\n");
    await csSendGroupText(internalJid, texto, undefined, { origem: "cs-pendencias-expiradas", destino: "interno" });
  }

  let postada = false;
  if (PENDENCIAS_LIVE && internalJid && !previewOnly && msg) {
    const r = await csSendGroupText(internalJid, msg, undefined, { origem: "cs-pendencias", destino: "interno" });
    postada = r.ok;
    if (!r.ok) console.error("[cs-pendencias] post falhou:", r.error);
  }

  console.log(`[cs-pendencias] dia=${ymd(now)} pendentes=${itens.length} postada=${postada}`);
  return NextResponse.json({ ok: true, live: PENDENCIAS_LIVE, pendentes: itens.length, expiradas, avisadas: mortasHoje.length, erroExpirar, postada, preview: msg || "(nada pendente)" });
}
