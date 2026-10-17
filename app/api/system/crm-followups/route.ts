export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import { spNow, ymd } from "@/lib/cs/vigilancia";
import { carregarExtras } from "@/lib/crm/extras";
import { proximoToque } from "@/lib/crm/cadencia";
import { ehAberta } from "@/lib/crm/etapas";
import { DESTINO_AVISOS_COMERCIAL } from "@/lib/crm/acesso";

// POST /api/system/crm-followups — lembrete de follow-up do comercial: leads com "próximo contato"
// vencido/hoje, toque da cadência vencido, ou "retomar em" que chegou (em etapa aberta) viram UMA
// notificação no sino. Cron: dias úteis 8h BRT (`0 11 * * 1-5`). ?dry=1 não notifica.
// Out/2026: o aviso vai só para quem cuida do comercial (target_user) — antes ia para o sino do time
// todo, com o nome dos leads. Só sino, nada de WhatsApp.

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;

  const hoje = ymd(spNow());
  const leads = await db.fetchCrmLeads();
  const abertos = leads.filter((l) => ehAberta(l.estagio));
  const extras = await carregarExtras(abertos.map((l) => l.id));
  const dataDoFollow = (l: (typeof leads)[number]): string | null => {
    if (l.retomarEm && l.retomarEm > hoje) return null; // estacionado de propósito
    const e = extras.get(l.id);
    const t = proximoToque({ estagio: l.estagio, inicio: e?.cadenciaInicio ?? l.createdAt, toques: e?.toques ?? [], hoje, retomarEm: l.retomarEm });
    const manual = l.proximoContato && l.proximoContato <= hoje ? l.proximoContato : null;
    const retomada = l.retomarEm && l.retomarEm <= hoje ? l.retomarEm : null;
    const cadencia = t && t.situacao !== "futuro" ? t.data : null;
    return [manual, retomada, cadencia].filter(Boolean).sort()[0] ?? null;
  };
  const vencendo = abertos
    .map((l) => ({ l, data: dataDoFollow(l) }))
    .filter((x) => x.data)
    .sort((a, b) => a.data!.localeCompare(b.data!))
    .map((x) => x.l);

  let notificado = false;
  if (vencendo.length > 0 && !dry) {
    const nomes = vencendo.slice(0, 6).map((l) => l.empresa || l.contatoNome).join(", ");
    const extra = vencendo.length > 6 ? ` +${vencendo.length - 6}` : "";
    const { error } = await supabaseAdmin.from("notifications").insert({
      type: "content",
      title: `Comercial: ${vencendo.length} contato${vencendo.length === 1 ? "" : "s"} pra fazer hoje`,
      body: `${nomes}${extra}`,
      target_user: DESTINO_AVISOS_COMERCIAL,
      read: false,
    });
    if (error) console.error("[crm-followups] notificação falhou:", error.message);
    notificado = !error;
  }
  console.log(`[crm-followups] vencendo=${vencendo.length} dry=${dry} notificado=${notificado}`);
  return NextResponse.json({ ok: true, dry, notificado, vencendo: vencendo.length });
}
