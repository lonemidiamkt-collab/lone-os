export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { PAPEIS_COMERCIAL } from "@/lib/crm/acesso";
import { supabaseAdmin } from "@/lib/supabase/server";
import { estadoGoogle, listarEventos } from "@/lib/prospeccao/google";
import { cancelarReuniao, deLinha, marcarReuniao, registrarResultado, remarcarReuniao } from "@/lib/crm/reunioes-server";
import type { Formato } from "@/lib/crm/reunioes";

// Reuniões de VENDA do Comercial (só sócios). Ver lib/crm/reunioes.ts.
//   GET   ?de=ISO&ate=ISO → { reunioes, google: { conectado, email, eventos } } (eventos = o resto do Google Agenda)
//   POST  { leadId, inicio, duracao, formato, local?, convidados?, pauta? } → marca (Google + grupo + funil)
//   PATCH { id, acao: "remarcar", inicio, duracao } | { id, acao: "cancelar" } | { id, acao: "realizada"|"nao_veio", resultado? }

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const de = req.nextUrl.searchParams.get("de") ?? new Date(Date.now() - 35 * 86_400_000).toISOString();
  const ate = req.nextUrl.searchParams.get("ate") ?? new Date(Date.now() + 60 * 86_400_000).toISOString();
  const [{ data, error }, g] = await Promise.all([
    supabaseAdmin.from("crm_reunioes").select("*").gte("inicio", de).lte("inicio", ate).order("inicio"),
    estadoGoogle(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const reunioes = (data ?? []).map(deLinha);
  let eventos: Awaited<ReturnType<typeof listarEventos>>["eventos"] = [];
  let erroGoogle: string | null = null;
  if (g.conectado) {
    const ev = await listarEventos(de, ate);
    // O evento que o próprio Comercial criou já aparece como reunião: não mostra duas vezes.
    const nossos = new Set(reunioes.map((r) => r.googleEventId).filter(Boolean));
    eventos = ev.eventos.filter((e) => !nossos.has(e.id));
    erroGoogle = ev.ok ? null : ev.error ?? "erro";
  }
  return NextResponse.json({ reunioes, google: { configurado: g.configurado, conectado: g.conectado, email: g.email ?? null, eventos, erro: erroGoogle } });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const b = await req.json().catch(() => null) as { leadId?: string; inicio?: string; duracao?: number; formato?: Formato; local?: string; convidados?: string[]; pauta?: string; autor?: string } | null;
  if (!b?.leadId || !b.inicio) return NextResponse.json({ error: "Escolha o lead e o horário." }, { status: 400 });
  const r = await marcarReuniao({
    leadId: b.leadId, inicio: b.inicio, duracao: Number(b.duracao ?? 45), formato: b.formato ?? "meet",
    local: b.local ?? null, convidados: Array.isArray(b.convidados) ? b.convidados : [], pauta: b.pauta ?? null,
    autor: b.autor?.slice(0, 80) ?? null,
  });
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  return NextResponse.json(r);
}

export async function PATCH(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS_COMERCIAL);
  if (gate instanceof NextResponse) return gate;
  const b = await req.json().catch(() => null) as { id?: string; acao?: string; inicio?: string; duracao?: number; resultado?: string; autor?: string } | null;
  if (!b?.id || !b.acao) return NextResponse.json({ error: "id e acao obrigatórios" }, { status: 400 });
  const autor = b.autor?.slice(0, 80) ?? null;
  const r = b.acao === "remarcar" ? await remarcarReuniao(b.id, b.inicio ?? "", Number(b.duracao ?? 45), autor)
    : b.acao === "cancelar" ? await cancelarReuniao(b.id, autor)
    : b.acao === "realizada" || b.acao === "nao_veio" ? await registrarResultado(b.id, b.acao, b.resultado ?? null, autor)
    : { ok: false, erro: "ação desconhecida" };
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  return NextResponse.json(r);
}
