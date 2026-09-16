export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { buscarProspect, atualizarProspect } from "@/lib/prospeccao/db";
import { enviarAoProspect } from "@/lib/prospeccao/envio";
import { registrarEvento } from "@/lib/prospeccao/maquina";
import { textoSeguro } from "@/lib/prospeccao/mensagens";

// POST /api/prospeccao/prospects/:id/enviar { texto } — mensagem manual (humano) pelo número do agente.
// Pausa o agente neste prospect (o humano está na conversa); "retomar" devolve.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;
  const p = await buscarProspect(id);
  if (!p) return NextResponse.json({ error: "prospect não encontrado" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { texto?: string } | null;
  const texto = (body?.texto ?? "").trim();
  if (!texto) return NextResponse.json({ error: "texto vazio" }, { status: 400 });
  const v = textoSeguro(texto, 2000);
  if (!v.ok && v.motivo !== "emoji") return NextResponse.json({ error: `mensagem barrada: ${v.motivo}` }, { status: 400 });
  const r = await enviarAoProspect(p, texto, { autor: "humano", estagio_antes: p.estagio });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  await atualizarProspect(id, { modo_agente: p.owner === "ROBERTO" ? "observacao" : "pausado", pausado_ate: null, precisa_humano: false, motivo_humano: null });
  await registrarEvento(id, { tipo: "humano_enviou", mensagem: texto, responsavel: gate.user.email });
  return NextResponse.json({ ok: true, prospect: await buscarProspect(id) });
}
