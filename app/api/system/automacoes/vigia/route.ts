export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { montarPainel } from "@/lib/automacoes/painel";
import { avisoDoVigia } from "@/lib/automacoes/saude";
import { iaFora, type FalhaIa, type IaFora } from "@/lib/ia/saude-ia";

const REPETIR_APOS_MS = 24 * 3600_000;

// POST /api/system/automacoes/vigia — de hora em hora: jobs que FALHARAM ou PARARAM (desligado e
// sem-registro não contam) viram UMA mensagem no grupo administrativo. Cada job é lembrado no
// máximo uma vez a cada 24h (automation_settings.ultimo_alerta_em). ?dry=1 devolve o texto sem enviar.
//
// E A IA EM SI (30/09). O saldo da OpenAI zerou em 25/09 às 7h30 e o Loninho passou 5 dias sem
// entender mensagem nenhuma dos clientes — sem aviso, porque o agente não é rotina agendada. Agora o
// vigia também lê llm_calls: falhas acumuladas desde o último sucesso, com causa conhecida, viram o
// primeiro bloco do aviso (chave `ia:<causa>` em automation_settings, mesmo intervalo de 24h).

/**
 * Falhas de IA desde o último sucesso, nos últimos 7 dias, e a hora desse último sucesso (é ela que
 * diz se a falta de crédito de uma rotina já passou). Nunca derruba o vigia: erro = sem dado.
 */
async function iaAgora(agora: Date): Promise<{ ia: IaFora | null; ultimoOk: string | null }> {
  let ultimoOk: string | null = null;
  try {
    const semana = new Date(agora.getTime() - 7 * 86400_000).toISOString();
    const { data: ok } = await supabaseAdmin.from("llm_calls").select("created_at")
      .eq("ok", true).gte("created_at", semana).order("created_at", { ascending: false }).limit(1).maybeSingle();
    ultimoOk = (ok?.created_at as string | undefined) ?? null;
    const desde = ultimoOk ?? semana;
    const { data: falhas, error } = await supabaseAdmin.from("llm_calls").select("origem, erro, created_at")
      .eq("ok", false).gt("created_at", desde).order("created_at", { ascending: true }).limit(5000);
    if (error) { console.error("[automacoes/vigia] llm_calls:", error.message); return { ia: null, ultimoOk }; }
    return { ia: iaFora((falhas ?? []) as FalhaIa[], agora), ultimoOk };
  } catch (e) {
    console.error("[automacoes/vigia] saúde da IA:", e);
    return { ia: null, ultimoOk };
  }
}

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
  const { ia, ultimoOk: ultimoOkIa } = await iaAgora(agora);

  // O resumo da última falha diz o que quebrou — e é dele que sai a causa que agrupa os jobs. Por
  // isso vale pra TODO job com falha, não só os que venceram as 24h: o grupo precisa estar inteiro.
  const resumos: Record<string, string | null> = {};
  await Promise.all(comProblema.filter((l) => l.saude === "falhou").map(async (l) => {
    const { data } = await supabaseAdmin.from("automation_runs").select("resumo")
      .eq("job", l.id).eq("ensaio", false).eq("skipped", false)
      .order("finished_at", { ascending: false }).limit(1).maybeSingle();
    resumos[l.id] = (data?.resumo as string | null) ?? null;
  }));

  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://painel.lonemidia.com").replace(/\/+$/, "");
  const { texto, marcar } = avisoDoVigia({
    comProblema, resumos, ultimoAlerta, ia, ultimoOkIa, agora, repetirAposMs: REPETIR_APOS_MS, urlCentral: `${base}/automations`,
  });
  const iaResumo = ia ? { causa: ia.causa.chave, desde: ia.desde, falhas: ia.falhas } : null;
  if (!texto) {
    return NextResponse.json({ ok: true, dry, com_problema: comProblema.length, ia: iaResumo, avisados: 0 });
  }
  const jobs = marcar;
  if (dry) return NextResponse.json({ ok: true, dry: true, com_problema: comProblema.length, ia: iaResumo, avisados: 0, jobs, texto });

  const jid = process.env.CS_ADM_GROUP_JID;
  if (!jid) return NextResponse.json({ ok: false, error: "CS_ADM_GROUP_JID (grupo administrativo) não configurado", jobs, texto }, { status: 500 });

  const { csSendGroupText } = await import("@/lib/cs/notify");
  const r = await csSendGroupText(jid, texto, undefined, { origem: "automacoes-vigia", destino: "interno" });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error ?? "falha no envio", jobs }, { status: 502 });

  // Só as colunas do alerta: enabled/updated_by de quem já configurou ficam como estão.
  // `ia:<causa>` mora na mesma tabela que os jobs: é só a data do último aviso, não liga nem desliga nada.
  const { error: errUp } = await supabaseAdmin.from("automation_settings").upsert(
    marcar.map((job) => ({ job, ultimo_alerta_em: agora.toISOString() })),
    { onConflict: "job" },
  );
  if (errUp) console.error("[automacoes/vigia] não marcou o alerta:", errUp.message);

  console.log(`[automacoes/vigia] avisou ${marcar.length}: ${marcar.join(", ")}`);
  return NextResponse.json({ ok: true, dry: false, com_problema: comProblema.length, ia: iaResumo, avisados: marcar.length, jobs });
}
