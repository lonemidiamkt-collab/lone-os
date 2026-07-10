export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getIgSnapshotCached } from "@/lib/meta/igSnapshot";

// POST /api/system/ig-snapshots — pré-gera os relatórios de Instagram (semana + mês) de cada cliente
// com IG mapeado, guardando no cache (client_ig_snapshots). Assim o portal/interno lê do cache e NÃO
// bate na Meta ao vivo (evita rate limit). Cron sugerido: 1x/dia. Espaça as chamadas pra não estourar
// a cota da Meta. ?clientId=… roda só um.
export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const onlyClient = req.nextUrl.searchParams.get("clientId");

  let q = supabaseAdmin.from("clients").select("id, name, nome_fantasia").not("ig_business_account_id", "is", null);
  if (onlyClient) q = supabaseAdmin.from("clients").select("id, name, nome_fantasia").eq("id", onlyClient);
  const { data: clients } = await q;

  const feitos: string[] = [];
  for (const c of clients ?? []) {
    for (const periodo of ["week", "month"] as const) {
      const snap = await getIgSnapshotCached(c.id as string, periodo, true); // force = gera fresco e grava
      if (snap.mapped && !snap.error) feitos.push(`${(c.nome_fantasia as string) || (c.name as string)}/${periodo}`);
      // pequeno respiro entre chamadas pra não estourar a cota da Meta
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return NextResponse.json({ ok: true, gerados: feitos.length, detalhe: feitos });
}
