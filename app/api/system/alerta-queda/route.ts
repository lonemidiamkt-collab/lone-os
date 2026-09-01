export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";

// POST /api/system/alerta-queda — avisa o time quando o resultado de um cliente cai.
//
// PRA QUE (Roberto): "alerta de queda antes do cliente perceber, isso é bom pra gente".
//
// A detecção já existia: o defense-scan roda a cada 15 min, compara com a média dos 7 dias e grava
// em anomaly_alerts (spend caiu 80%, cpl subiu 80%, ctr caiu 50%, impressions caiu 70%). O que
// faltava era o aviso SAIR do banco — 58 alertas numa semana, nenhum notificado. Detectar sem
// avisar é o mesmo que não detectar.
//
// TRÊS TRAVAS CONTRA VIRAR RUÍDO. O Roberto já disse que recebe textão demais no grupo, e alerta
// que ninguém lê é pior que alerta nenhum:
//   1. só critical/high — medium não acorda ninguém;
//   2. uma linha por CLIENTE (o pior sintoma dele), não uma por métrica: um anúncio que parou
//      dispara spend, impressions e ctr ao mesmo tempo, e são o mesmo problema;
//   3. notified_at — o mesmo alerta nunca é avisado duas vezes.

const ROTULO: Record<string, { texto: (p: number) => string; ordem: number }> = {
  spend:       { texto: () => "parou de gastar", ordem: 0 },
  impressions: { texto: (p) => `entrega caiu ${Math.abs(Math.round(p))}%`, ordem: 1 },
  cpl:         { texto: (p) => `custo por conversa subiu ${Math.round(p)}%`, ordem: 2 },
  ctr:         { texto: (p) => `cliques caíram ${Math.abs(Math.round(p))}%`, ordem: 3 },
};

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;

  // Últimas 24h. Alerta de anteontem já não é "antes do cliente perceber".
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: alertas, error } = await supabaseAdmin
    .from("anomaly_alerts")
    .select("id, client_id, metric, severity, percent_change, current_value, baseline_value, metric_date")
    .is("notified_at", null).is("acknowledged_at", null)
    .in("severity", ["critical", "high"])
    .gte("detected_at", desde)
    .order("detected_at", { ascending: false });

  if (error) return NextResponse.json({ error: `leitura falhou: ${error.message}` }, { status: 500 });
  if (!alertas?.length) return NextResponse.json({ ok: true, alertas: 0, clientes: 0, enviado: false });

  // Nomes: um alerta com UUID no lugar do nome do cliente não serve pra ninguém agir.
  const ids = [...new Set(alertas.map((a) => a.client_id as string))];
  const { data: clientes } = await supabaseAdmin.from("clients")
    .select("id, name, active, draft_status").in("id", ids);
  const porId = new Map((clientes ?? []).map((c) => [c.id as string, c]));

  // Um item por cliente, com o sintoma mais grave. Cliente inativo ou rascunho não entra: verba
  // parada ali é o esperado, não uma queda.
  const porCliente = new Map<string, { nome: string; sintoma: string; severidade: string; ids: string[] }>();
  for (const a of alertas) {
    const c = porId.get(a.client_id as string);
    if (!c || c.active === false || c.draft_status != null) continue;
    const r = ROTULO[a.metric as string];
    if (!r) continue;
    const atual = porCliente.get(a.client_id as string);
    const sintoma = r.texto(Number(a.percent_change) || 0);
    if (!atual) {
      porCliente.set(a.client_id as string, {
        nome: (c.name as string) ?? "(sem nome)", sintoma, severidade: a.severity as string, ids: [a.id as string],
      });
    } else {
      atual.ids.push(a.id as string);
      // Fica com o sintoma mais explicativo (spend parado > entrega caiu > custo subiu > ctr).
      const ordemAtual = Object.entries(ROTULO).find(([, v]) => atual.sintoma.startsWith(v.texto(0).slice(0, 6)))?.[1].ordem ?? 9;
      if (r.ordem < ordemAtual) { atual.sintoma = sintoma; atual.severidade = a.severity as string; }
    }
  }

  if (!porCliente.size) {
    // Havia alertas, mas todos de cliente inativo. Marca como notificados pra não reprocessar.
    await supabaseAdmin.from("anomaly_alerts").update({ notified_at: new Date().toISOString() })
      .in("id", alertas.map((a) => a.id as string));
    return NextResponse.json({ ok: true, alertas: alertas.length, clientes: 0, enviado: false, motivo: "só clientes inativos" });
  }

  const lista = [...porCliente.values()].sort((a, b) =>
    (a.severidade === "critical" ? 0 : 1) - (b.severidade === "critical" ? 0 : 1));

  const texto = [
    `⚠️ *Queda de resultado — ${lista.length} cliente${lista.length > 1 ? "s" : ""}*`, "",
    ...lista.map((c) => `• *${c.nome}* — ${c.sintoma}`),
    "", "Comparado com a média dos últimos 7 dias da própria conta.",
    "Vale conferir hoje: o cliente costuma perceber a queda antes da gente.",
  ].join("\n");

  if (dry) return NextResponse.json({ ok: true, alertas: alertas.length, clientes: lista.length, dry: true, texto });

  const jid = process.env.CS_TRAFFIC_GROUP_JID || "";
  if (!jid) return NextResponse.json({ error: "CS_TRAFFIC_GROUP_JID não configurado" }, { status: 500 });

  const r = await csSendGroupText(jid, texto, undefined, { origem: "alerta-queda", destino: "interno" });
  if (!r.ok) return NextResponse.json({ error: r.error, clientes: lista.length }, { status: 500 });

  // Só marca como notificado DEPOIS de o envio confirmar. Marcar antes perderia o alerta se a
  // Evolution estivesse fora — e ninguém saberia que houve queda.
  await supabaseAdmin.from("anomaly_alerts").update({ notified_at: new Date().toISOString() })
    .in("id", [...porCliente.values()].flatMap((c) => c.ids));

  return NextResponse.json({ ok: true, alertas: alertas.length, clientes: lista.length, enviado: true });
}
