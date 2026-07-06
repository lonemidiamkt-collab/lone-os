export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import * as db from "@/lib/supabase/queries";
import { spNow, ymd } from "@/lib/cs/vigilancia";

// POST /api/system/crm-followups — lembrete de follow-up do comercial: leads com "próximo contato"
// vencido/hoje (em etapa aberta) viram uma notificação no sino. Ninguém esquecido.
// Cron sugerido: dias úteis 8h BRT (`0 11 * * 1-5`). ?dry=1 não notifica.
const ABERTOS = new Set(["lead", "orcamento", "proposta", "reuniao"]);

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;

  const hoje = ymd(spNow());
  const leads = await db.fetchCrmLeads();
  const vencendo = leads
    .filter((l) => l.proximoContato && l.proximoContato <= hoje && ABERTOS.has(l.estagio))
    .sort((a, b) => (a.proximoContato || "").localeCompare(b.proximoContato || ""));

  let notificado = false;
  if (vencendo.length > 0 && !dry) {
    const nomes = vencendo.slice(0, 6).map((l) => l.contatoNome).join(", ");
    const extra = vencendo.length > 6 ? ` +${vencendo.length - 6}` : "";
    await db.insertNotification({
      type: "content",
      title: `Follow-up: ${vencendo.length} lead${vencendo.length === 1 ? "" : "s"} pra contatar hoje`,
      body: `${nomes}${extra}`,
      read: false,
    });
    notificado = true;
  }
  console.log(`[crm-followups] vencendo=${vencendo.length} dry=${dry}`);
  return NextResponse.json({ ok: true, dry, notificado, vencendo: vencendo.length });
}
