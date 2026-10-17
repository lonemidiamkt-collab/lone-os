export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { interpretar } from "@/lib/crm/assistente-server";
import { hojeSP } from "@/lib/crm/meta";

// POST /api/system/crm-assistente-ensaio { texto } — ENSAIO do Loninho do grupo de vendas: mostra o que
// ele faria com a frase (IA + conferência em código) SEM gravar nem mandar nada. Para testar frases
// novas antes de usar no grupo. Protegido pelo CRON_SECRET; não é rotina agendada.

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const body = await req.json().catch(() => null) as { texto?: string; hoje?: string } | null;
  if (!body?.texto?.trim()) return NextResponse.json({ error: "texto obrigatório" }, { status: 400 });
  const hoje = body.hoje && /^\d{4}-\d{2}-\d{2}$/.test(body.hoje) ? body.hoje : hojeSP();
  const r = await interpretar(body.texto, "Ensaio", hoje);
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 502 });
  return NextResponse.json({
    ok: true, hoje,
    passos: r.passos.map((p) => ("lead" in p ? { ...p, lead: p.lead.empresa || p.lead.contatoNome } : p)),
  });
}
