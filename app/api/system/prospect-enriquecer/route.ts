export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { comExecucao } from "@/lib/obs/correlacao";
import { carregarConfig } from "@/lib/prospeccao/config";
import { campanhaAtual, pilotoRodando } from "@/lib/prospeccao/piloto";
import { listarPorEstagio } from "@/lib/prospeccao/db";
import { enriquecerProspect } from "@/lib/prospeccao/enriquecer";

// POST /api/system/prospect-enriquecer — 07:00–08:30 BRT a cada 15 min: até `lote` prospects
// `descoberto` → pesquisa completa → score → icp_aprovado / fora_icp. ?lote=N (padrão 6).
export async function POST(req: NextRequest) {
  // Cron (CRON_SECRET) ou gestão logada (botões da página /prospeccao).
  if (requireCron(req)) { const gate = await requireRole(req, GESTAO); if (gate instanceof NextResponse) return gate; }
  const lote = Math.min(30, Number(req.nextUrl.searchParams.get("lote") ?? "") || 10);
  return comExecucao({ origem: "prospeccao:enriquecer", ator: "sdr" }, async () => {
    const cfg = await carregarConfig();
    const campanha = await campanhaAtual();
    if (!cfg.ligado || !pilotoRodando(campanha)) return NextResponse.json({ ok: true, pulado: !cfg.ligado ? "agente desligado" : "piloto não está rodando" });
    const candidatos = (await listarPorEstagio(["descoberto"], lote * 2)).sort((a, b) => a.created_at.localeCompare(b.created_at));
    // Claim otimista: dois runs (cron a cada 15 min + botão) não pesquisam a mesma empresa duas vezes.
    const { supabaseAdmin } = await import("@/lib/supabase/server");
    const fila = [];
    for (const p of candidatos) {
      if (fila.length >= lote) break;
      const { data } = await supabaseAdmin.from("prospects").update({ next_action_type: "ENRIQUECENDO" }).eq("id", p.id).neq("next_action_type", "ENRIQUECENDO").select("id");
      if (data?.length) fila.push(p);
    }
    const resultados: { id: string; nome: string; estagio: string; score: number | null; classe: string | null; etapas: string[]; erros: string[] }[] = [];
    for (const p of fila) {
      try {
        const r = await enriquecerProspect(p, cfg);
        resultados.push({ id: p.id, nome: p.nome, estagio: r.prospect.estagio, score: r.prospect.score, classe: r.prospect.classe, etapas: r.etapas, erros: r.erros });
      } catch (err) {
        resultados.push({ id: p.id, nome: p.nome, estagio: p.estagio, score: null, classe: null, etapas: [], erros: [err instanceof Error ? err.message : String(err)] });
        await supabaseAdmin.from("prospects").update({ next_action_type: "ENRIQUECER" }).eq("id", p.id).eq("next_action_type", "ENRIQUECENDO");
      }
    }
    console.log(`[prospect-enriquecer] ${resultados.length} processados: ${resultados.map((r) => `${r.nome}=${r.classe ?? "?"}`).join(", ")}`);
    return NextResponse.json({ ok: true, processados: resultados.length, resultados });
  });
}
