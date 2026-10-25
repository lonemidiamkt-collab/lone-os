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
//
// 25/10/2026 (auditoria 14.2): envio "incerto" (timeout, 5xx genérico — pode ter saído) não é mais
// "não enviei": responde 202 com `incerto` e o aviso "confira antes de mandar de novo". A tela mantém o
// texto mas pede confirmação para reenviar — antes a pessoa reenviava e o prospect recebia 2x.
const AVISO_INCERTO = "O WhatsApp não confirmou o envio — a mensagem PODE ter saído. Confira a conversa no celular do número antes de mandar de novo.";

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
    if (!env.ok && !env.incerto) return NextResponse.json({ error: env.error }, { status: 502 });
    // Incerto: marca como enviada mesmo assim — o botão não manda a mesma resposta automática de novo.
    await atualizarProspect(id, { contexto_comercial: { ...(p.contexto_comercial ?? {}), pos_automacao_em: new Date().toISOString() } });
    await registrarEvento(id, { tipo: "pos_automacao", mensagem: r, responsavel: "SDR_AI", motivo: `disparada por ${ator}` });
    return NextResponse.json({ ok: true, texto: r, prospect: await buscarProspect(id), ...(env.incerto ? { incerto: true, aviso: AVISO_INCERTO } : {}) }, { status: env.incerto ? 202 : 200 });
  }
  if (ator === "cron") return NextResponse.json({ error: "envio manual exige login" }, { status: 401 });
  const gate = { user: { email: ator } };
  const texto = (body?.texto ?? "").trim();
  if (!texto) return NextResponse.json({ error: "texto vazio" }, { status: 400 });
  const v = textoSeguro(texto, 2000);
  if (!v.ok && v.motivo !== "emoji") return NextResponse.json({ error: `mensagem barrada: ${v.motivo}` }, { status: 400 });
  const r = await enviarAoProspect(p, texto, { autor: "humano", estagio_antes: p.estagio });
  if (!r.ok && !r.incerto) return NextResponse.json({ error: `Não enviei: ${r.error ?? "erro"}. Nada saiu — pode tentar de novo.` }, { status: 502 });
  // Saiu (ou pode ter saído): o humano está na conversa, o agente pausa do mesmo jeito.
  await atualizarProspect(id, { modo_agente: p.owner === "ROBERTO" ? "observacao" : "pausado", pausado_ate: null, precisa_humano: false, motivo_humano: null });
  await registrarEvento(id, { tipo: r.incerto ? "humano_enviou_incerto" : "humano_enviou", mensagem: texto, responsavel: gate.user.email, ...(r.incerto ? { motivo: r.error ?? "sem confirmação" } : {}) });
  if (r.incerto) return NextResponse.json({ ok: true, incerto: true, aviso: AVISO_INCERTO, prospect: await buscarProspect(id) }, { status: 202 });
  return NextResponse.json({ ok: true, prospect: await buscarProspect(id) });
}
