export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { comExecucao, anotar } from "@/lib/obs/correlacao";
import { loadRoteiroPrefs } from "@/lib/cs/load-briefing";
import type { BriefingCliente } from "@/lib/cs/criativo";
import { analisarVencedor, roteiroDaVariacao } from "@/lib/traffic/vencedor";

// POST /api/system/creative-vencedores — para cada VENCEDOR de hoje (creative_health.vencedor)
// sem análise para a versão atual do criativo: elementos → hipóteses → 2 variações → roteiro.
// Custa IA (gpt-4o com visão + o gerador de roteiro): ?max=N limita por rodada (padrão 8).
// Cron depois do creative-health. SOMBRA: grava creative_hypotheses, não envia nada.

export async function POST(req: NextRequest) {
  const gate = requireCron(req); // só o cron: qualquer logado disparava lote pesado (IA/Meta)
  if (gate) return gate;
  const max = Math.min(30, Math.max(1, Number(req.nextUrl.searchParams.get("max") ?? 8) || 8));
  const soCliente = req.nextUrl.searchParams.get("clientId") || "";
  return comExecucao({ origem: "cron:creative-vencedores", ator: "cron" }, async () => {
    const { data: dia } = await supabaseAdmin.from("creative_health").select("data").order("data", { ascending: false }).limit(1).maybeSingle();
    if (!dia) return NextResponse.json({ ok: true, gerados: 0, motivo: "sem avaliação" });
    let q = supabaseAdmin.from("creative_health").select("ad_id, client_id, ad_name, amostra, vencedor_evidencias, baseline")
      .eq("data", dia.data as string).eq("vencedor", true).order("severidade", { ascending: true });
    if (soCliente) q = q.eq("client_id", soCliente);
    const { data: vencedores, error } = await q;
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });

    const adIds = (vencedores ?? []).map((v) => v.ad_id as string);
    if (!adIds.length) return NextResponse.json({ ok: true, gerados: 0, motivo: "sem vencedores" });
    const [{ data: cri }, { data: feitas }] = await Promise.all([
      supabaseAdmin.from("creative_snapshots").select("ad_id, hash, tipo, thumb_url, image_url, body, title, cta").in("ad_id", adIds).order("capturado_em", { ascending: false }),
      supabaseAdmin.from("creative_hypotheses").select("ad_id, hash").in("ad_id", adIds),
    ]);
    const criativo = new Map<string, Record<string, unknown>>();
    for (const c of cri ?? []) if (!criativo.has(c.ad_id as string)) criativo.set(c.ad_id as string, c);
    const jaFeita = new Set((feitas ?? []).map((f) => `${f.ad_id}|${f.hash}`));
    const { data: politicas } = await supabaseAdmin.from("client_traffic_policy").select("client_id, cpl_alerta");
    const meta = new Map((politicas ?? []).map((p) => [p.client_id as string, p.cpl_alerta as number | null]));

    let gerados = 0, pulados = 0;
    const erros: string[] = [];
    for (const v of vencedores ?? []) {
      if (gerados >= max) break;
      const c = criativo.get(v.ad_id as string);
      if (!c) { pulados++; continue; } // sem criativo guardado ainda: espera o próximo sync
      if (jaFeita.has(`${v.ad_id}|${c.hash}`)) { pulados++; continue; }
      try {
        const { data: cli } = await supabaseAdmin.from("clients").select("id, name, nome_fantasia, nicho, industry, fixed_briefing, campaign_briefing").eq("id", v.client_id as string).maybeSingle();
        const nome = ((cli?.nome_fantasia as string) || (cli?.name as string) || "Cliente");
        const am = (v.amostra ?? {}) as { gasto7d?: number; conversas7d?: number; diasRodando?: number };
        const base = (v.baseline ?? {}) as { ctrMediano?: number | null };
        const gasto = Number(am.gasto7d ?? 0), conv = Number(am.conversas7d ?? 0);
        const resultado = { cpl: conv > 0 ? gasto / conv : null, cplMeta: meta.get(v.client_id as string) ?? null, conversas: conv, gasto, ctr: null, ctrConta: base.ctrMediano ?? null, dias: Number(am.diasRodando ?? 0) };
        const crv = { adId: v.ad_id as string, adName: v.ad_name as string, tipo: c.tipo as string, thumbUrl: (c.thumb_url as string) || (c.image_url as string) || null, body: c.body as string, title: c.title as string, cta: c.cta as string };

        const an = await analisarVencedor({ criativo: crv, resultado, cliente: nome, nicho: (cli?.nicho as string) || (cli?.industry as string) || null });
        if (!an.ok || !an.data) { erros.push(`${nome}/${v.ad_id}: análise: ${an.error ?? "?"}`); continue; }

        const { data: b } = await supabaseAdmin.from("client_briefings")
          .select("resumo_estrategico, produtos, publico_alvo, posicionamento, dores, ganchos, ctas, tom_voz, produtos_destaque_atual, palavras_proibidas, concorrentes_evitar_mencionar")
          .eq("client_id", v.client_id as string).eq("is_current", true).maybeSingle();
        const briefing: BriefingCliente = {
          nome, nicho: (cli?.nicho as string) || (cli?.industry as string) || undefined,
          resumoEstrategico: (b?.resumo_estrategico as string) || ((cli?.fixed_briefing as string) || (cli?.campaign_briefing as string) || "").trim() || undefined,
          produtos: (b?.produtos as string[]) || undefined, publicoAlvo: (b?.publico_alvo as string[]) || undefined,
          posicionamento: (b?.posicionamento as string) || undefined, dores: (b?.dores as string[]) || undefined,
          ganchos: (b?.ganchos as string[]) || undefined, ctas: (b?.ctas as string[]) || undefined, tomVoz: (b?.tom_voz as string) || undefined,
          produtosDestaque: (b?.produtos_destaque_atual as string[]) || undefined, palavrasProibidas: (b?.palavras_proibidas as string[]) || undefined,
          concorrentesEvitar: (b?.concorrentes_evitar_mencionar as string[]) || undefined,
        };
        const preferencias = await loadRoteiroPrefs(v.client_id as string);
        const roteiros = [];
        for (const variacao of an.data.variacoes.slice(0, 2)) {
          const r = await roteiroDaVariacao({ briefing, preferencias, criativo: crv, analise: an.data, variacao });
          roteiros.push({ variacao: variacao.nome, roteiro: r });
        }
        const { error: e } = await supabaseAdmin.from("creative_hypotheses").upsert({
          ad_id: v.ad_id, hash: c.hash, client_id: v.client_id, data: dia.data, resultado,
          elementos: an.data.elementos, hipoteses: an.data.hipoteses, variacoes: an.data.variacoes, resumo: an.data.resumo_para_o_time,
          roteiros, modelo: "gpt-4o",
        }, { onConflict: "ad_id,hash" });
        if (e) { erros.push(`${nome}: gravar: ${e.message.slice(0, 60)}`); continue; }
        gerados++;
      } catch (err) {
        erros.push(`${v.ad_id}: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`);
      }
    }
    anotar(`vencedores: ${gerados} análises, ${pulados} pulados`);
    return NextResponse.json({ ok: erros.length === 0, dia: dia.data, vencedores: vencedores?.length ?? 0, gerados, pulados, erros: erros.slice(0, 8) });
  });
}

export const GET = POST;
