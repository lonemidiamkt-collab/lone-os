export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { buscarProspect, atualizarProspect } from "@/lib/prospeccao/db";
import { enviarAoProspect } from "@/lib/prospeccao/envio";
import { registrarEvento } from "@/lib/prospeccao/maquina";
import { textoSeguro, respostaPosAutomacao } from "@/lib/prospeccao/mensagens";
import { requireCron } from "@/lib/api/cron-guard";
import { carregarConfig } from "@/lib/prospeccao/config";
import { mensagensDoProspect } from "@/lib/prospeccao/db";

// POST /api/prospeccao/prospects/:id/enviar { texto } — mensagem manual (humano) pelo número do agente.
// Pausa o agente neste prospect (o humano está na conversa); "retomar" devolve.
// { chave: "pos_automacao" } — a RAFAELA manda a mensagem do template (sem pausar): usado para
// destravar um prospect cujo bot respondeu antes de esta resposta existir.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let ator = "cron";
  if (requireCron(req)) { const gate = await requireRole(req, GESTAO); if (gate instanceof NextResponse) return gate; ator = gate.user.email; }
  const { id } = await ctx.params;
  const p = await buscarProspect(id);
  if (!p) return NextResponse.json({ error: "prospect não encontrado" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { texto?: string; chave?: string } | null;
  if (body?.chave === "pos_automacao") {
    if (p.contexto_comercial?.pos_automacao_em) return NextResponse.json({ error: "a resposta à mensagem automática já saiu" }, { status: 409 });
    const cfg = await carregarConfig();
    const historico = (await mensagensDoProspect(p.id)).map((m) => ({ autor: m.autor, texto: m.texto }));
    const r = await respostaPosAutomacao({ p, cfg, historico });
    const env = await enviarAoProspect(p, r, { autor: "agente", estagio_antes: p.estagio });
    if (!env.ok) return NextResponse.json({ error: env.error }, { status: 502 });
    await atualizarProspect(id, { contexto_comercial: { ...(p.contexto_comercial ?? {}), pos_automacao_em: new Date().toISOString() } });
    await registrarEvento(id, { tipo: "pos_automacao", mensagem: r, responsavel: "SDR_AI", motivo: `disparada por ${ator}` });
    return NextResponse.json({ ok: true, texto: r, prospect: await buscarProspect(id) });
  }
  if (ator === "cron") return NextResponse.json({ error: "envio manual exige login" }, { status: 401 });
  const gate = { user: { email: ator } };
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
