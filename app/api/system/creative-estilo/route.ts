export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { comExecucao, anotar } from "@/lib/obs/correlacao";
import { lerEstiloDasArtes } from "@/lib/traffic/estilo-ler";

// POST /api/system/creative-estilo?max=12 — estilo visual de cada cliente ativo lido das ARTES
// ENTREGUES (sem print). Todo dia útil 07:55: quem não tem leitura vem primeiro; depois relê quem
// venceu (45 dias) ou ganhou 6+ artes novas. Print subido por gente prevalece enquanto vale.
// Erro de um cliente não para os outros; a resposta lista cada um e vai para agent_runs.
export async function POST(req: NextRequest) {
  const gate = requireCron(req); // só o cron: qualquer logado disparava lote pesado (IA/Meta)
  if (gate) return gate;
  const max = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get("max") ?? 12) || 12));
  const forcar = req.nextUrl.searchParams.get("forcar") === "1";
  return comExecucao({ origem: "cron:creative-estilo", ator: "cron" }, async () => {
    const [{ data: clientes }, { data: leituras }] = await Promise.all([
      supabaseAdmin.from("clients").select("id, name").eq("active", true).is("churned_at", null).order("name"),
      supabaseAdmin.from("client_visual_style").select("client_id, created_at").order("created_at", { ascending: false }),
    ]);
    const ultima = new Map<string, string>();
    for (const l of leituras ?? []) if (!ultima.has(l.client_id as string)) ultima.set(l.client_id as string, l.created_at as string);
    // sem leitura primeiro, depois a mais antiga
    const fila = [...(clientes ?? [])].sort((a, b) => (ultima.get(a.id as string) ?? "").localeCompare(ultima.get(b.id as string) ?? ""));
    // ORÇAMENTO DE TEMPO: ~16 s por cliente (gpt-4o com 6 artes). A rota tem 300 s; parar aos 240 s
    // garante resposta com o que foi feito — o resto fica para a próxima rodada (fila por leitura mais antiga).
    const inicio = Date.now();
    const resultados = [];
    let lidos = 0, semTempo = 0;
    for (const c of fila) {
      if (lidos >= max) break;
      if (Date.now() - inicio > 240_000) { semTempo++; continue; }
      const r = await lerEstiloDasArtes({ clientId: c.id as string, por: "cron", forcar });
      if (r.lido) lidos++;
      if (r.motivo === "erro") console.error("[creative-estilo]", r.cliente, r.erro);
      resultados.push(r);
    }
    const erros = resultados.filter((r) => r.motivo === "erro");
    const semLeitura = (clientes ?? []).filter((c) => !ultima.has(c.id as string)).length - resultados.filter((r) => r.lido && r.motivo === "sem_leitura").length;
    anotar(`estilo visual: ${lidos} lidos, ${erros.length} erros, ${semLeitura} ainda sem leitura${semTempo ? `, ${semTempo} ficaram para a próxima rodada (tempo)` : ""}`);
    return NextResponse.json({ ok: erros.length === 0, lidos, aindaSemLeitura: semLeitura, ficaramPorTempo: semTempo, segundos: Math.round((Date.now() - inicio) / 1000), pulados: resultados.filter((r) => !r.lido && r.motivo !== "erro").map((r) => `${r.cliente}: ${r.motivo}`), erros: erros.map((r) => `${r.cliente}: ${r.erro}`), lidosLista: resultados.filter((r) => r.lido).map((r) => `${r.cliente} (${r.artes} artes)`) });
  });
}
