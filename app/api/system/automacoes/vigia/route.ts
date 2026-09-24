export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { montarPainel } from "@/lib/automacoes/painel";
import { textoVigia } from "@/lib/automacoes/saude";

const REPETIR_APOS_MS = 24 * 3600_000;

// POST /api/system/automacoes/vigia — de hora em hora: jobs que FALHARAM ou PARARAM (desligado e
// sem-registro não contam) viram UMA mensagem no grupo administrativo. Cada job é lembrado no
// máximo uma vez a cada 24h (automation_settings.ultimo_alerta_em). ?dry=1 devolve o texto sem enviar.
export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const agora = new Date();

  let painel: Awaited<ReturnType<typeof montarPainel>>;
  try { painel = await montarPainel(agora); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
  const { linhas, configs } = painel;
  const ultimoAlerta = new Map(configs.map((c) => [c.job, c.ultimo_alerta_em]));

  const comProblema = linhas.filter((l) => l.saude === "falhou" || l.saude === "parado");
  const novos = comProblema.filter((l) => {
    const t = ultimoAlerta.get(l.id);
    return !t || agora.getTime() - new Date(t).getTime() >= REPETIR_APOS_MS;
  });
  if (!novos.length) {
    return NextResponse.json({ ok: true, dry, com_problema: comProblema.length, avisados: 0 });
  }

  // O resumo da última falha diz o que quebrou — sem ele o aviso só manda abrir a Central.
  const resumos: Record<string, string | null> = {};
  await Promise.all(novos.filter((l) => l.saude === "falhou").map(async (l) => {
    const { data } = await supabaseAdmin.from("automation_runs").select("resumo")
      .eq("job", l.id).eq("ensaio", false).eq("skipped", false)
      .order("finished_at", { ascending: false }).limit(1).maybeSingle();
    resumos[l.id] = (data?.resumo as string | null) ?? null;
  }));

  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://painel.lonemidia.com").replace(/\/+$/, "");
  const texto = textoVigia(novos, resumos, `${base}/automations`);
  const jobs = novos.map((l) => ({ job: l.id, saude: l.saude }));
  if (dry) return NextResponse.json({ ok: true, dry: true, com_problema: comProblema.length, avisados: 0, jobs, texto });

  const jid = process.env.CS_ADM_GROUP_JID;
  if (!jid) return NextResponse.json({ ok: false, error: "CS_ADM_GROUP_JID (grupo administrativo) não configurado", jobs, texto }, { status: 500 });

  const { csSendGroupText } = await import("@/lib/cs/notify");
  const r = await csSendGroupText(jid, texto, undefined, { origem: "automacoes-vigia", destino: "interno" });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error ?? "falha no envio", jobs }, { status: 502 });

  // Só as colunas do alerta: enabled/updated_by de quem já configurou ficam como estão.
  const { error: errUp } = await supabaseAdmin.from("automation_settings").upsert(
    novos.map((l) => ({ job: l.id, ultimo_alerta_em: agora.toISOString() })),
    { onConflict: "job" },
  );
  if (errUp) console.error("[automacoes/vigia] não marcou o alerta:", errUp.message);

  console.log(`[automacoes/vigia] avisou ${novos.length}: ${novos.map((l) => `${l.id}=${l.saude}`).join(", ")}`);
  return NextResponse.json({ ok: true, dry: false, com_problema: comProblema.length, avisados: novos.length, jobs });
}
