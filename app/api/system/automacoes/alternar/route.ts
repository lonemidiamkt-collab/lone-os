export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { automacaoPorId } from "@/lib/automacoes/registro";

// POST /api/system/automacoes/alternar — {job, enabled, pausar_ate?}
//   enabled:false            → desliga até alguém religar;
//   enabled:true + pausar_ate → pausa até a data (depois volta sozinho);
//   enabled:true             → religa. Grava paused_until = agora: marca a retomada, e o "parado"
//                              passa a contar dali (senão o vigia acusaria o job assim que religasse).
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  let b: { job?: unknown; enabled?: unknown; pausar_ate?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const job = typeof b.job === "string" ? b.job : "";
  const a = automacaoPorId(job);
  if (!a) return NextResponse.json({ error: "Job desconhecido." }, { status: 404 });
  if (!a.controlavel) {
    return NextResponse.json({
      error: "Este job roda direto pelo crontab do servidor, sem passar pela Central. Para desligar, é preciso editar o crontab.",
    }, { status: 400 });
  }
  if (typeof b.enabled !== "boolean") return NextResponse.json({ error: "enabled precisa ser true/false." }, { status: 400 });

  const agora = new Date();
  let pausadoAte: string | null = agora.toISOString();
  if (b.enabled && b.pausar_ate != null) {
    const t = typeof b.pausar_ate === "string" ? Date.parse(b.pausar_ate) : NaN;
    if (Number.isNaN(t) || t <= agora.getTime()) return NextResponse.json({ error: "pausar_ate precisa ser uma data no futuro." }, { status: 400 });
    if (t - agora.getTime() > 60 * 86400_000) return NextResponse.json({ error: "Pausa de no máximo 60 dias — para mais que isso, desligue." }, { status: 400 });
    pausadoAte = new Date(t).toISOString();
  }

  const { error } = await supabaseAdmin.from("automation_settings").upsert({
    job,
    enabled: b.enabled,
    paused_until: b.enabled ? pausadoAte : null,
    updated_by: gate.user.email || gate.user.id,
    updated_at: agora.toISOString(),
  }, { onConflict: "job" });
  if (error) return NextResponse.json({ error: `Não consegui salvar: ${error.message}` }, { status: 500 });

  console.log(`[automacoes/alternar] ${job} enabled=${b.enabled} pausado_ate=${b.enabled && b.pausar_ate ? pausadoAte : "-"} por ${gate.user.email}`);
  return NextResponse.json({ ok: true, job, enabled: b.enabled, pausado_ate: b.enabled && b.pausar_ate ? pausadoAte : null });
}
