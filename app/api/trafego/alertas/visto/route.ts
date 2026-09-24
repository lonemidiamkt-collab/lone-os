export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { carregarVistos, desmarcarVistos, marcarVistos, type ResultadoVisto } from "@/lib/traffic/hoje/vistos";
import { ehNivelAlerta, ehTipoAlerta, fimDoVisto, infoDoVisto } from "@/lib/traffic/hoje/visto";
import type { AlertaRef } from "@/lib/traffic/hoje/tipos";

// /api/trafego/alertas/visto — o "visto" dos alertas de tráfego (traffic_alert_acks).
//
//   GET  → os vistos que ainda estão no prazo: [{ clientId, tipo, nivel, por, em, ate }]. A tela aplica
//          a regra da gravidade (lib/traffic/hoje/visto.ts vistoVale) com o nível atual do alerta.
//   POST { acao: "marcar" | "desmarcar", alertas: [{ clientId, tipo, nivel }], horas? }
//
// Visto vale 24h (ou `horas`, até 72) e cai se o alerta piorar. Enquanto vale, o alerta aparece
// apagado no Hoje e na Defesa Ativa e não sai no WhatsApp (saldo e queda), no PDF do diagnóstico
// nem no Início. Sem a tabela (migração manual), devolve `disponivel: false` e não quebra nada.

const TRAFEGO: Papel[] = ["admin", "manager", "traffic"];
const MAX_ALERTAS = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, TRAFEGO);
  if (gate instanceof NextResponse) return gate;
  const { disponivel, mapa } = await carregarVistos();
  const agora = Date.now();
  const vistos = [...mapa.values()]
    .filter((v) => fimDoVisto(v) > agora)
    .map((v) => ({ clientId: v.client_id, tipo: v.tipo, ...infoDoVisto(v) }));
  return NextResponse.json({ disponivel, vistos });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, TRAFEGO);
  if (gate instanceof NextResponse) return gate;

  let corpo: { acao?: unknown; alertas?: unknown; horas?: unknown };
  try { corpo = await req.json(); } catch { return NextResponse.json({ error: "Corpo inválido." }, { status: 400 }); }

  const acao = corpo.acao;
  if (acao !== "marcar" && acao !== "desmarcar") {
    return NextResponse.json({ error: "Ação deve ser \"marcar\" ou \"desmarcar\"." }, { status: 400 });
  }
  const brutos = Array.isArray(corpo.alertas) ? corpo.alertas : [];
  if (brutos.length === 0 || brutos.length > MAX_ALERTAS) {
    return NextResponse.json({ error: `Mande de 1 a ${MAX_ALERTAS} alertas.` }, { status: 400 });
  }
  const alertas: AlertaRef[] = [];
  for (const b of brutos as Record<string, unknown>[]) {
    const clientId = typeof b?.clientId === "string" ? b.clientId : "";
    if (!UUID.test(clientId) || !ehTipoAlerta(b.tipo) || (acao === "marcar" && !ehNivelAlerta(b.nivel))) {
      return NextResponse.json({ error: "Alerta inválido (cliente, tipo ou gravidade)." }, { status: 400 });
    }
    alertas.push({ clientId, tipo: b.tipo, nivel: ehNivelAlerta(b.nivel) ? b.nivel : "info" });
  }

  if (acao === "desmarcar") {
    return responder(await desmarcarVistos(alertas));
  }

  // Nome de quem viu, como está no time (a tela mostra "Visto por Julio").
  const { data: membro } = await supabaseAdmin.from("team_members").select("name")
    .eq("email", gate.user.email.toLowerCase()).maybeSingle();
  const horas = typeof corpo.horas === "number" ? corpo.horas : null;
  return responder(await marcarVistos(alertas, { email: gate.user.email, nome: (membro?.name as string | undefined) ?? null }, horas));
}

/** 503 = tabela ainda não criada (a tela esconde o "visto"); 500 = falha de gravação. */
function responder(r: ResultadoVisto) {
  if (r.ok) return NextResponse.json({ ok: true, disponivel: true });
  return NextResponse.json({ error: r.erro ?? "Não consegui gravar o visto.", disponivel: r.disponivel }, { status: r.disponivel ? 500 : 503 });
}
