export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow } from "@/lib/cs/vigilancia";
import { computeAutoavaliacao, formatAutoavaliacao, type DemandaAval } from "@/lib/cs/autoavaliacao";

// POST /api/system/cs-autoavaliacao — Cap 7: relatório semanal de acurácia do agente.
// Toda segunda, mede sugeriu→aprovou/recusou dos últimos 7 dias e posta no grupo interno.
// Cron sugerido: segunda 10h BRT (`0 13 * * 1`). ?dry=1 não posta (retorna o texto).
export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;

  const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("cs_demandas").select("tipo, status, cliente_nome")
    .gte("created_at", desde)
    .not("cliente_nome", "ilike", "%(teste)%"); // exclui o cliente-teste das métricas reais
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const stats = computeAutoavaliacao((data ?? []) as DemandaAval[]);
  const now = spNow();
  const fim = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const ini = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const inicio = `${String(ini.getDate()).padStart(2, "0")}/${String(ini.getMonth() + 1).padStart(2, "0")}`;
  const texto = formatAutoavaliacao(stats, `${inicio} a ${fim}`);

  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
  let enviado = false;
  if (!dry && internalJid) {
    const r = await csSendGroupText(internalJid, texto);
    enviado = r.ok;
  }
  console.log(`[cs-autoavaliacao] total=${stats.total} aprov=${stats.aprovadas} recus=${stats.recusadas} dry=${dry}`);
  return NextResponse.json({ ok: true, dry, enviado, stats, texto });
}
