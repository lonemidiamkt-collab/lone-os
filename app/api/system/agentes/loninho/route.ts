export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { JOB_LONINHO } from "@/lib/agentes/catalogo";
import { lerInterruptorLoninho } from "@/lib/agentes/loninho-server";
import { csSendGroupText } from "@/lib/cs/notify";

// POST /api/system/agentes/loninho — o interruptor geral do Loninho. {ligado, ate?}
//   ligado:false         → desliga até alguém religar;
//   ligado:false + ate   → pausa até a data (máximo 7 dias) e volta sozinho;
//   ligado:true          → religa. Grava paused_until = agora (marca a retomada, como a Central de Automações).
// Mesma linha e mesmo formato de automation_settings (job "agente:loninho").
//
// O grupo do time fica sabendo: Loninho calado sem explicação parece defeito, e a regra da casa é que
// falha (ou desligamento) aparece como tal. Se o aviso não sair, a resposta diz — o interruptor vale igual.
const PAUSA_MAX_MS = 7 * 86400_000;

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function nomeDe(email: string): Promise<string> {
  try {
    const { data } = await supabaseAdmin.from("team_members").select("name").ilike("email", email).maybeSingle();
    const nome = ((data?.name as string | undefined) ?? "").trim().split(/\s+/)[0];
    if (nome) return nome;
  } catch { /* sem nome: usa o e-mail */ }
  return email.split("@")[0] || "alguém da gestão";
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;

  let b: { ligado?: unknown; ate?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  if (typeof b.ligado !== "boolean") return NextResponse.json({ error: "ligado precisa ser true/false." }, { status: 400 });

  const agora = new Date();
  let ate: string | null = null;
  if (!b.ligado && b.ate != null) {
    const t = typeof b.ate === "string" ? Date.parse(b.ate) : NaN;
    if (Number.isNaN(t) || t <= agora.getTime()) return NextResponse.json({ error: "A pausa precisa terminar no futuro." }, { status: 400 });
    if (t - agora.getTime() > PAUSA_MAX_MS) return NextResponse.json({ error: "Pausa de no máximo 7 dias — para mais que isso, desligue." }, { status: 400 });
    ate = new Date(t).toISOString();
  }

  const antes = await lerInterruptorLoninho(agora).catch(() => null);
  const por = gate.user.email || gate.user.id;
  const { error } = await supabaseAdmin.from("automation_settings").upsert({
    job: JOB_LONINHO,
    // Pausa = ligado com paused_until no futuro (volta sozinho); desligar = enabled false.
    enabled: b.ligado || !!ate,
    paused_until: b.ligado ? agora.toISOString() : ate,
    updated_by: por,
    updated_at: agora.toISOString(),
  }, { onConflict: "job" });
  if (error) return NextResponse.json({ error: `Não consegui salvar: ${error.message}` }, { status: 500 });
  console.log(`[agentes/loninho] ligado=${b.ligado} ate=${ate ?? "-"} por ${por}`);

  // Aviso no grupo do time — só quando o estado muda de verdade.
  let aviso: { enviado: boolean; erro?: string } = { enviado: false };
  const mudou = !antes || antes.ligado !== b.ligado || (!b.ligado && antes.pausadoAte !== ate);
  const jid = process.env.CS_INTERNAL_GROUP_JID || "";
  if (mudou) {
    if (!jid) aviso = { enviado: false, erro: "CS_INTERNAL_GROUP_JID não configurado" };
    else {
      const nome = await nomeDe(gate.user.email || "");
      const texto = b.ligado
        ? `▶️ *Loninho religado* por ${nome}. Voltei a ler os grupos.\nMensagem que chegou enquanto eu estava desligado não foi lida: confiram os grupos desse intervalo.`
        : `⏸️ *Loninho ${ate ? "pausado" : "desligado"}* por ${nome} na Central de Agentes${ate ? ` até ${quando(ate)}` : ""}.\nEnquanto isso não leio os grupos (clientes, time e vendas) e não respondo ninguém. As rotinas agendadas seguem pela Central de Automações.`;
      const r = await csSendGroupText(jid, texto, undefined, { origem: "agentes:interruptor-loninho", destino: "interno" });
      aviso = r.ok ? { enviado: true } : { enviado: false, erro: r.error ?? "o aviso não saiu" };
    }
  }

  return NextResponse.json({ ok: true, ligado: b.ligado, ate, aviso });
}
