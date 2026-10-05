export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// /api/system/avisos-falados — o acompanhamento dos avisos falados (lib/avisos/regras.ts).
//
// POST (cron de 15 em 15 min, dia útil das 8h às 18h): relê na Meta o gasto de hoje das contas que
//   pararam e fecha o evento da que voltou a rodar — é daí que sai o "quanto tempo levou".
//   O saldo é fechado pelo sync-saldos (de 2 em 2h), que já lê o saldo de todas as contas.
//   Desligar este job na Central de Automações também cala a voz (o aviso continua no sino).
// GET ?relatorio=1: a medição do teste — mediana de minutos com voz × sem voz, por tipo.

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fecharContasQueVoltaram } from "@/lib/avisos/trafego-server";
import { medir, TESTE_FIM, TESTE_INICIO, type EventoMedido } from "@/lib/avisos/regras";

export async function POST(req: NextRequest) {
  const negado = requireCron(req);
  if (negado) return negado;
  const { data: cfg } = await supabaseAdmin.from("agency_settings").select("value").eq("key", "meta_token").maybeSingle();
  const token = cfg?.value as string | undefined;
  if (!token) return NextResponse.json({ error: "meta_token ausente" }, { status: 500 });
  const r = await fecharContasQueVoltaram(token);
  return NextResponse.json({ ok: true, ...r });
}

export async function GET(req: NextRequest) {
  const negado = requireCron(req);
  if (negado) return negado;
  const desde = req.nextUrl.searchParams.get("desde") ?? TESTE_INICIO;
  const ate = req.nextUrl.searchParams.get("ate") ?? TESTE_FIM;
  const { data, error } = await supabaseAdmin.from("avisos_trafego")
    .select("tipo, braco, detectado_em, resolvido_em, ouvido_em").gte("dia", desde).lte("dia", ate);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const linhas = medir((data ?? []) as EventoMedido[]);
  return NextResponse.json({
    ok: true, desde, ate, linhas,
    leitura: "medianaMinutos = da detecção até a conta voltar a gastar (conta parada, checado de 15 em 15 min) ou o saldo ser recarregado (checado de 2 em 2h). 'controle' = só WhatsApp e sino, sem voz.",
  });
}
