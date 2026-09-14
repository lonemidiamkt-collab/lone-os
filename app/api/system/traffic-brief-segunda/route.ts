export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { comExecucao, anotar } from "@/lib/obs/correlacao";
import { temTrafego } from "@/lib/clients/servico";
import { csSendGroupText } from "@/lib/cs/notify";
import { montarBrief, escolherProposta, type ContaDoBrief } from "@/lib/traffic/brief-segunda";

// POST /api/system/traffic-brief-segunda — toda segunda 08:05 BRT. Monta o brief (cinco linhas por
// conta + uma proposta) e GRAVA. Vai ao WhatsApp do tráfego só quando a sombra estiver aprovada:
// precisão do rótulo ≥ 80% com ≥ 20 rótulos, ou agency_settings traffic_brief_whatsapp = 'on'.
// ?dry=1 não envia · ?forcar=1 envia mesmo sem a sombra (uso consciente).
export async function POST(req: NextRequest) {
  const gate = await requireCronOrUser(req);
  if (gate) return gate;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const forcar = req.nextUrl.searchParams.get("forcar") !== null;
  return comExecucao({ origem: "cron:traffic-brief-segunda", ator: "cron" }, async () => {
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const desde7 = new Date(Date.parse(`${hoje}T12:00:00Z`) - 7 * 864e5).toISOString().slice(0, 10);
    const { data: dia } = await supabaseAdmin.from("creative_health").select("data").order("data", { ascending: false }).limit(1).maybeSingle();
    const [{ data: cli }, { data: pols }, { data: saude }, { data: gasto }, { data: hips }, { data: recs }, { data: flag }, { data: rot }] = await Promise.all([
      supabaseAdmin.from("clients").select("id, name, nome_fantasia, status, service_type, meta_ad_account_id").or("active.is.null,active.eq.true").is("churned_at", null).is("draft_status", null).not("meta_ad_account_id", "is", null),
      supabaseAdmin.from("client_traffic_policy").select("client_id, cpl_alerta"),
      dia ? supabaseAdmin.from("creative_health").select("client_id, ad_id, ad_name, estado, vencedor, vencedor_evidencias, evidencias").eq("data", dia.data as string).neq("estado", "SEM_AMOSTRA") : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      supabaseAdmin.from("metric_snapshots").select("client_id, spend, conversions").gte("metric_date", desde7).lt("metric_date", hoje),
      supabaseAdmin.from("creative_hypotheses").select("ad_id, variacoes").order("created_at", { ascending: false }).limit(300),
      supabaseAdmin.from("recommendations").select("client_id, recomendacao, score").eq("fonte", "trafego").in("estado", ["nova", "vista", "aceita"]).order("score", { ascending: false }).limit(300),
      supabaseAdmin.from("agency_settings").select("value").eq("key", "traffic_brief_whatsapp").maybeSingle(),
      supabaseAdmin.from("creative_health").select("rotulo").not("rotulo", "is", null).neq("rotulo", "sem_opiniao"),
    ]);
    const pol = new Map((pols ?? []).map((p) => [p.client_id as string, p.cpl_alerta as number | null]));
    const hip = new Map<string, { nome: string; muda: string; mantem: string; testa: string }[]>();
    for (const h of hips ?? []) if (!hip.has(h.ad_id as string)) hip.set(h.ad_id as string, (h.variacoes as { nome: string; muda: string; mantem: string; testa: string }[]) ?? []);
    const oport = new Map<string, string>();
    for (const r of recs ?? []) if (!oport.has(r.client_id as string)) oport.set(r.client_id as string, r.recomendacao as string);
    const gastoPor = new Map<string, { spend: number; conv: number }>();
    for (const g of gasto ?? []) { const k = g.client_id as string; const a = gastoPor.get(k) ?? { spend: 0, conv: 0 }; a.spend += Number(g.spend ?? 0); a.conv += Number(g.conversions ?? 0); gastoPor.set(k, a); }

    const contas: ContaDoBrief[] = [];
    for (const c of cli ?? []) {
      if (!temTrafego({ service_type: c.service_type as string | null })) continue;
      const g = gastoPor.get(c.id as string) ?? { spend: 0, conv: 0 };
      if (g.spend < 1) continue;
      const daConta = (saude ?? []).filter((s) => s.client_id === c.id);
      const v = daConta.find((s) => s.vencedor);
      const at = daConta.filter((s) => ["CRITICAL", "FATIGUE_PROBABLE"].includes(s.estado as string)).map((s) => ({ adName: (s.ad_name as string) ?? (s.ad_id as string), evidencia: ((s.evidencias as string[]) ?? [])[0] ?? s.estado as string }));
      contas.push({
        cliente: ((c.nome_fantasia as string) || (c.name as string)), status: (c.status as string) ?? null,
        gasto7d: g.spend, conversas7d: g.conv, cpl7d: g.conv > 0 ? g.spend / g.conv : null, cplMeta: pol.get(c.id as string) ?? null,
        vencedor: v ? { adId: v.ad_id as string, adName: (v.ad_name as string) ?? (v.ad_id as string), evidencia: ((v.vencedor_evidencias as string[]) ?? [])[0] ?? "vencedor pela régua do cliente", variacao: hip.get(v.ad_id as string)?.[0] ?? null } : null,
        atencao: at, oportunidade: oport.get(c.id as string) ?? null,
      });
    }
    const proposta = escolherProposta(contas);
    const semana = hoje;
    const label = `${semana.slice(8, 10)}/${semana.slice(5, 7)}`;
    const texto = montarBrief({ contas, semanaLabel: label, nomeGestor: "Julio", proposta });

    const concordo = (rot ?? []).filter((r) => r.rotulo === "concordo").length, totalRot = (rot ?? []).length;
    const sombraAprovada = totalRot >= 20 && concordo / totalRot >= 0.8;
    const podeEnviar = !dry && (forcar || sombraAprovada || flag?.value === "on");
    const destino = process.env.CS_TRAFFIC_GROUP_JID;
    let msgId: string | null = null, enviado = false;
    if (podeEnviar && destino) {
      const r = await csSendGroupText(destino, texto, undefined, { origem: "traffic-brief-segunda", destino: "interno" });
      enviado = r.ok; msgId = r.id ?? null;
    }
    const { data: salvo, error } = await supabaseAdmin.from("traffic_briefs").insert({ semana, texto, contas, proposta, enviado_whatsapp: enviado, msg_id: msgId }).select("id").single();
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    anotar(`brief segunda: ${contas.length} contas, proposta ${proposta ? proposta.cliente : "nenhuma"}, whatsapp=${enviado}`);
    return NextResponse.json({ ok: true, id: salvo.id, contas: contas.length, proposta: proposta?.cliente ?? null, enviadoWhatsapp: enviado, sombra: { rotulos: totalRot, precisao: totalRot ? Math.round((concordo / totalRot) * 100) : null, aprovada: sombraAprovada }, previa: texto.slice(0, 600) });
  });
}
export const GET = POST;
