export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { comExecucao, anotar } from "@/lib/obs/correlacao";
import { temSocial } from "@/lib/clients/servico";
import { pautasDoVencedor } from "@/lib/traffic/pauta-do-trafego";

// POST /api/system/creative-social?max=10 — para cada VENCEDOR de cliente que também tem SOCIAL
// contratado: 3 pautas orgânicas no Radar de Oportunidades (radar_pautas), marcadas como vindas
// do tráfego. Uma leva por (cliente, produto) a cada 14 dias. Cron 07:50.
export async function POST(req: NextRequest) {
  const gate = await requireCronOrUser(req);
  if (gate) return gate;
  const max = Math.min(30, Math.max(1, Number(req.nextUrl.searchParams.get("max") ?? 10) || 10));
  return comExecucao({ origem: "cron:creative-social", ator: "cron" }, async () => {
    const { data: dia } = await supabaseAdmin.from("creative_health").select("data").order("data", { ascending: false }).limit(1).maybeSingle();
    if (!dia) return NextResponse.json({ ok: true, geradas: 0, motivo: "sem avaliação" });
    const { data: venc } = await supabaseAdmin.from("creative_health").select("ad_id, client_id, ad_name, amostra, vencedor_evidencias").eq("data", dia.data as string).eq("vencedor", true);
    if (!venc?.length) return NextResponse.json({ ok: true, geradas: 0, motivo: "sem vencedores" });
    const clientIds = [...new Set(venc.map((v) => v.client_id as string))];
    const adIds = venc.map((v) => v.ad_id as string);
    const [{ data: cli }, { data: attrs }, { data: hips }, { data: briefs }, { data: recentes }] = await Promise.all([
      supabaseAdmin.from("clients").select("id, name, nome_fantasia, nicho, industry, service_type").in("id", clientIds),
      supabaseAdmin.from("creative_attributes").select("ad_id, produto, oferta").in("ad_id", adIds),
      supabaseAdmin.from("creative_hypotheses").select("ad_id, elementos").in("ad_id", adIds),
      supabaseAdmin.from("client_briefings").select("client_id, tom_voz, palavras_proibidas, produtos_destaque_atual").in("client_id", clientIds).eq("is_current", true),
      supabaseAdmin.from("radar_pautas").select("client_id, tendencia").in("client_id", clientIds).gte("created_at", new Date(Date.now() - 14 * 864e5).toISOString()).like("tendencia", "🏆 Tráfego:%"),
    ]);
    const cliente = new Map((cli ?? []).map((c) => [c.id as string, c]));
    const attr = new Map((attrs ?? []).map((a) => [a.ad_id as string, a]));
    const hip = new Map((hips ?? []).map((h) => [h.ad_id as string, h]));
    const brief = new Map((briefs ?? []).map((b) => [b.client_id as string, b]));
    const jaFeito = new Set((recentes ?? []).map((r) => `${r.client_id}|${String(r.tendencia).toLowerCase()}`));

    let geradas = 0, pulados = 0; const erros: string[] = [];
    for (const v of venc) {
      if (geradas >= max) break;
      const c = cliente.get(v.client_id as string);
      if (!c || !temSocial({ service_type: c.service_type as string | null })) { pulados++; continue; }
      const a = attr.get(v.ad_id as string);
      const elementos = (hip.get(v.ad_id as string)?.elementos as { tipo: string; descricao: string }[] | undefined) ?? [];
      const produto = (a?.produto as string) || elementos.find((e) => /produto|servi/i.test(e.tipo))?.descricao || null;
      if (!produto) { pulados++; continue; } // sem produto identificado, não há pauta a puxar
      const tendencia = `🏆 Tráfego: ${produto} — anúncio vencedor`;
      if (jaFeito.has(`${c.id}|${tendencia.toLowerCase()}`)) { pulados++; continue; }
      const nome = ((c.nome_fantasia as string) || (c.name as string));
      const b = brief.get(c.id as string);
      const evidencia = (v.vencedor_evidencias as string[] | null)?.[0] ?? `anúncio "${v.ad_name}" vencedor esta semana`;
      const r = await pautasDoVencedor({ cliente: nome, nicho: (c.nicho as string) || (c.industry as string) || null, produto, oferta: (a?.oferta as string) ?? null, evidencia, tomVoz: (b?.tom_voz as string) ?? null, palavrasProibidas: (b?.palavras_proibidas as string[]) ?? [], produtosDestaque: (b?.produtos_destaque_atual as string[]) ?? [] });
      if (!r.ok || !r.data) { erros.push(`${nome}: ${r.error ?? "?"}`); continue; }
      const linhas = r.data.angulos.slice(0, 3).map((g) => ({
        client_id: c.id, cliente_nome: nome, nicho: (c.nicho as string) || (c.industry as string) || null, tendencia, perfis_na_tendencia: 0,
        ideia: g.titulo, hook: g.hook, formato: g.formato, roteiro: g.roteiro, cta: g.cta,
        porque_funciona: `${evidencia}. O público está respondendo a "${produto}" nos anúncios — no orgânico, ângulo ${g.angulo}, não a oferta.`,
        referencias: [`meta ad ${v.ad_id}`], status: "nova", fit_score: 90,
      }));
      const { error } = await supabaseAdmin.from("radar_pautas").insert(linhas);
      if (error) { erros.push(`${nome}: gravar: ${error.message.slice(0, 60)}`); continue; }
      jaFeito.add(`${c.id}|${tendencia.toLowerCase()}`);
      geradas += linhas.length;
    }
    anotar(`social: ${geradas} pautas de ${venc.length} vencedores (${pulados} pulados)`);
    return NextResponse.json({ ok: erros.length === 0, vencedores: venc.length, geradas, pulados, erros: erros.slice(0, 8) });
  });
}
export const GET = POST;
