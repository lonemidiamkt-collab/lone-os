// app/api/system/contratos-d4sign-pendentes/route.ts — "⏳ Ainda não assinaram o contrato" no GRUPO DE CADASTRO.
//
// Dia útil, de manhã, UMA mensagem — e só se houver contrato enviado há 3 dias ou mais sem todas as
// assinaturas: cada um com quem falta e há quantos dias (lib/contracts/assinatura.ts#avisarPendentes).
// Sem pendência, nada sai. Antes de escrever, relê na D4Sign os mais antigos (o que couber nas 10 chamadas da
// hora), para não dizer que falta quem assinou de madrugada.
//
//   ?dry=1 → o texto exato, sem reler a D4Sign, sem mandar e sem gravar.
//
// Cron: `30 11 * * 1-5` (8h30 BRT). Feriado não manda (isBusinessDay).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { isBusinessDay, spNow, ymd } from "@/lib/cs/vigilancia";
import { avisarPendentes } from "@/lib/contracts/assinatura";

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;

  const hoje = spNow();
  if (!dry && !(await isBusinessDay(hoje))) {
    return NextResponse.json({ ok: true, dry, enviado: false, skip: "fora de dia útil" });
  }
  const r = await avisarPendentes({ dry, dia: ymd(hoje) });
  console.log(`[contratos-d4sign-pendentes] dia=${ymd(hoje)} itens=${r.itens.length} relidos=${r.relidos} enviado=${r.enviado} dry=${dry}${r.motivo ? ` motivo=${r.motivo}` : ""}`);
  return NextResponse.json(r);
}
