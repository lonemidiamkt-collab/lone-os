export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, GESTAO } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { campanhaAtual, criarCampanha, iniciarCampanha, pausarCampanha, atualizarCampanha, diaDoPiloto, pilotoRodando } from "@/lib/prospeccao/piloto";
import { salvarConfig } from "@/lib/prospeccao/config";

// GET  /api/prospeccao/campanha            → piloto atual + histórico
// POST { acao: "criar", nome, duracao_dias, limite_dia } | { acao: "iniciar", id } | { acao: "pausar", id, motivo }
//      | { acao: "reativar", id } | { acao: "editar", id, ...campos }
// Reativar é só admin (§6: "somente Roberto Lino poderá autorizar nova ativação").
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const atual = await campanhaAtual();
  const { data: historico } = await supabaseAdmin.from("prospect_campanhas").select("*").order("created_at", { ascending: false }).limit(20);
  return NextResponse.json({ ok: true, campanha: atual, rodando: pilotoRodando(atual), dia: diaDoPiloto(atual), historico: historico ?? [] });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, GESTAO);
  if (gate instanceof NextResponse) return gate;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body?.acao) return NextResponse.json({ error: "acao obrigatória" }, { status: 400 });
  const quem = gate.user.email;
  try {
    switch (body.acao) {
      case "criar": {
        const c = await criarCampanha({ nome: String(body.nome ?? "Piloto SDR Construção RJ"), duracao_dias: Number(body.duracao_dias) || 30, limite_dia: Number(body.limite_dia) || 10, created_by: quem });
        return NextResponse.json({ ok: true, campanha: c });
      }
      case "iniciar": {
        const { data: c } = await supabaseAdmin.from("prospect_campanhas").select("status").eq("id", String(body.id)).single();
        if (!c) return NextResponse.json({ error: "campanha não encontrada" }, { status: 404 });
        if (c.status !== "draft" && gate.papel !== "admin") return NextResponse.json({ error: "só o administrador reativa um piloto" }, { status: 403 });
        const r = await iniciarCampanha(String(body.id), quem);
        await salvarConfig({ ligado: true });
        return NextResponse.json({ ok: true, campanha: r });
      }
      case "reativar": {
        if (gate.papel !== "admin") return NextResponse.json({ error: "só o administrador reativa um piloto" }, { status: 403 });
        const r = await iniciarCampanha(String(body.id), quem);
        await salvarConfig({ ligado: true });
        return NextResponse.json({ ok: true, campanha: r });
      }
      case "pausar": {
        const r = await pausarCampanha(String(body.id), quem, body.motivo ? String(body.motivo) : undefined);
        return NextResponse.json({ ok: true, campanha: r });
      }
      case "editar": {
        const patch: Record<string, unknown> = {};
        if (body.nome) patch.nome = String(body.nome);
        if (body.limite_dia !== undefined) patch.limite_dia = Math.max(1, Math.min(50, Number(body.limite_dia) || 10));
        if (body.duracao_dias !== undefined) patch.duracao_dias = Math.max(1, Math.min(365, Number(body.duracao_dias) || 30));
        if (body.auto_stop !== undefined) patch.auto_stop = !!body.auto_stop;
        if (body.janela_abordagem) patch.janela_abordagem = body.janela_abordagem;
        if (body.janela_resposta) patch.janela_resposta = body.janela_resposta;
        const r = await atualizarCampanha(String(body.id), patch);
        return NextResponse.json({ ok: true, campanha: r });
      }
      default: return NextResponse.json({ error: "ação desconhecida" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "erro" }, { status: 400 });
  }
}
