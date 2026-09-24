export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import * as db from "@/lib/supabase/queries";
import { spNow, ymd } from "@/lib/cs/vigilancia";
import { carregarExtras } from "@/lib/crm/extras";
import { proximoToque } from "@/lib/crm/cadencia";

// POST /api/system/crm-followups — lembrete de follow-up do comercial: leads com "próximo contato"
// vencido/hoje (em etapa aberta) viram uma notificação no sino. Ninguém esquecido.
// Cron sugerido: dias úteis 8h BRT (`0 11 * * 1-5`). ?dry=1 não notifica.
// Leva 7C (N28): conta também o TOQUE DA CADÊNCIA (dia 2/5/12 depois do primeiro contato) que venceu
// — o lead sem "próximo contato" marcado à mão não fica mais esquecido. Só sino, nada de WhatsApp.
const ABERTOS = new Set(["lead", "orcamento", "proposta", "reuniao"]);

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;

  const hoje = ymd(spNow());
  const leads = await db.fetchCrmLeads();
  const abertos = leads.filter((l) => ABERTOS.has(l.estagio));
  const extras = await carregarExtras(abertos.map((l) => l.id));
  const dataDoFollow = (l: (typeof leads)[number]): string | null => {
    const e = extras.get(l.id);
    const t = proximoToque({ estagio: l.estagio, inicio: e?.cadenciaInicio ?? l.createdAt, toques: e?.toques ?? [], hoje });
    const manual = l.proximoContato && l.proximoContato <= hoje ? l.proximoContato : null;
    const cadencia = t && t.situacao !== "futuro" ? t.data : null;
    return [manual, cadencia].filter(Boolean).sort()[0] ?? null;
  };
  const vencendo = abertos
    .map((l) => ({ l, data: dataDoFollow(l) }))
    .filter((x) => x.data)
    .sort((a, b) => a.data!.localeCompare(b.data!))
    .map((x) => x.l);

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
