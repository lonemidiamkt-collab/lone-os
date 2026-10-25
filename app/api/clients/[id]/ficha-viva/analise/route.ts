// app/api/clients/[id]/ficha-viva/analise/route.ts — o diagnóstico da Ficha Viva do lado da equipe.
// Admin apenas.
//
// GET  — o diagnóstico mais recente (respostas + estrutura). 25/10/2026 (onda 6, item 12.1): a tela lia
//        direto do navegador e ignorava o erro — falha virava "O cliente ainda não respondeu. Envie o
//        link", o time cobrava o cliente por algo que ele já tinha respondido e a estrutura automática
//        não rodava. Aqui erro é 503 e "não respondeu" é { diagnostico: null }.
// POST — salva a estrutura EDITADA pelo time ({ analise, diagId }) ou volta à versão anterior
//        ({ acao: "voltar_anterior", diagId }). Toda troca guarda a versão que estava (12.2), e a edição
//        fica marcada com quando e quem (é o que faz o "Refazer" pedir confirmação).
//        `diagId` grava no diagnóstico que estava aberto na tela, não no "mais recente" — se o cliente
//        reenviou durante a edição, a edição não cai na resposta nova (sem `diagId`: o mais recente).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { buscarMembroPorEmail } from "@/lib/equipe/membro-server";
import { salvarEdicao, voltarAnterior } from "@/lib/fichaViva/analise";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const { id: clientId } = await params;

  const { data, error } = await supabaseAdmin
    .from("client_diagnostics")
    .select("id, respostas, analise, status, answered_at")
    .eq("client_id", clientId)
    .order("answered_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[ficha-viva/analise] diagnóstico não lido:", error.message);
    return NextResponse.json({ error: "Não consegui carregar o diagnóstico agora. Tente de novo em instantes." }, { status: 503 });
  }
  return NextResponse.json({ diagnostico: data ?? null });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id: clientId } = await params;
  const body = await req.json().catch(() => ({}));
  const voltando = body?.acao === "voltar_anterior";
  const diagId = typeof body?.diagId === "string" && UUID.test(body.diagId) ? body.diagId : null;
  if (!voltando && (!body?.analise || typeof body.analise !== "object")) {
    return NextResponse.json({ error: "Estrutura inválida" }, { status: 422 });
  }

  // O diagnóstico que estava aberto (sempre deste cliente); sem id, o mais recente.
  const base = supabaseAdmin.from("client_diagnostics").select("id, analise").eq("client_id", clientId);
  const { data: diag, error: eDiag } = diagId
    ? await base.eq("id", diagId).maybeSingle()
    : await base.order("answered_at", { ascending: false }).limit(1).maybeSingle();
  if (eDiag) return NextResponse.json({ error: "Não consegui ler o diagnóstico agora. Nada foi salvo — tente de novo." }, { status: 503 });
  if (!diag) return NextResponse.json({ error: "Sem diagnóstico pra editar" }, { status: 404 });

  let analise;
  if (voltando) {
    analise = voltarAnterior(diag.analise);
    if (!analise) return NextResponse.json({ error: "Não há versão anterior guardada desta estrutura." }, { status: 409 });
  } else {
    const { membro } = await buscarMembroPorEmail<{ name?: string | null }>(user.email, "name, email");
    analise = salvarEdicao(body.analise, diag.analise, (membro?.name as string) || user.email, new Date().toISOString());
  }

  const { error } = await supabaseAdmin
    .from("client_diagnostics")
    .update({ analise, status: "analisado", analyzed_at: new Date().toISOString() })
    .eq("id", diag.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, analise, diagId: diag.id });
}
