export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { confirmarDemanda } from "@/lib/cs/confirmar-demanda-server";
import { textoPautaParcial } from "@/lib/cs/confirmar-demanda";
import { csSendGroupText } from "@/lib/cs/notify";
import { papelDoUsuario } from "@/lib/api/require-role";
import { nomeDeQuemDecide, podeDecidirDemanda, podeReabrir, SEM_PERMISSAO_DECIDIR } from "@/lib/cs/decidir-demanda";

// GET /api/cs/decide?codigos=a1b2,c3d4 — o "Decidir" do feed do Agente (Leva 7C, N25) abre a
// sugestão antes de decidir: o que o cliente escreveu, o que o agente entendeu e o briefing que vai
// para o card. Só as PENDENTES (código só é único entre elas). Designer e comercial não leem a conversa.
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const papel = await papelDoUsuario(user);
  if (!podeDecidirDemanda(papel)) {
    return NextResponse.json({ error: "Sem permissão para esta área." }, { status: 403 });
  }
  const codigos = (req.nextUrl.searchParams.get("codigos") ?? "")
    .split(",").map((c) => c.trim()).filter((c) => /^[\w-]{2,40}$/.test(c)).slice(0, 20);
  if (!codigos.length) return NextResponse.json({ error: "codigos obrigatório" }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("cs_demandas")
    .select("codigo, cliente_nome, tipo, resumo, message_text, briefing, author, urgencia, created_at")
    .in("codigo", codigos).eq("status", "pendente").order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: `Não consegui ler as sugestões: ${error.message}` }, { status: 500 });
  return NextResponse.json({
    demandas: (data ?? []).map((d) => ({
      codigo: d.codigo as string, cliente: (d.cliente_nome as string) || "Cliente", tipo: (d.tipo as string) || "demanda",
      resumo: (d.resumo as string) || "", mensagem: ((d.message_text as string) || "").slice(0, 1200),
      briefing: ((d.briefing as string) || "").slice(0, 1500), autor: (d.author as string) || null,
      urgencia: (d.urgencia as string) || null, criadaEm: d.created_at as string,
    })),
  });
}

// POST /api/cs/decide — a equipe decide uma sugestão do Agente CS PELA PLATAFORMA (painel Agente
// Lone), espelhando o "ok/não" do WhatsApp: cria o ContentCard (ou descarta), marca a demanda e
// avisa o grupo interno pra manter os dois lados em sincronia. Suggest-only continua: só age no ok.
//   body: { id, acao: "confirmar" | "descartar" | "reabrir", ajuste?: string }
//
// 25/10/2026 (auditoria 11.4): a mesma autoridade do WhatsApp e do GET — gestão, social e tráfego;
// designer e comercial não decidem pedido de cliente. O descarte confere o update, grava QUEM descartou
// (nome do cadastro) e tem volta: "reabrir" devolve o pedido descartado para pendente (o "Desfazer" da tela).
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const papel = await papelDoUsuario(user);
  if (!podeDecidirDemanda(papel)) return NextResponse.json({ error: SEM_PERMISSAO_DECIDIR }, { status: 403 });

  const body = await req.json().catch(() => null);
  const idBody = body?.id as string | undefined;
  const codigo = (body?.codigo as string | undefined)?.trim();
  const acao = body?.acao as string | undefined;
  const ajuste = (body?.ajuste as string | undefined)?.trim();
  if ((!idBody && !codigo) || (acao !== "confirmar" && acao !== "descartar" && acao !== "reabrir")) {
    return NextResponse.json({ error: "id (ou codigo) e acao (confirmar|descartar|reabrir) obrigatórios" }, { status: 400 });
  }
  if (acao === "reabrir" && !idBody) return NextResponse.json({ error: "reabrir precisa do id do pedido" }, { status: 400 });

  // O feed de prioridades só conhece o código curto (o mesmo do "ok <código>" no grupo); código só é
  // único entre as pendentes, então a busca por código filtra status pendente.
  const busca = supabaseAdmin.from("cs_demandas").select("*");
  const { data: d, error: buscaErr } = idBody
    ? await busca.eq("id", idBody).maybeSingle()
    : await busca.eq("codigo", codigo!).eq("status", "pendente").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (buscaErr) return NextResponse.json({ error: "Não consegui ler a demanda. Tente de novo." }, { status: 500 });
  if (!d) {
    return NextResponse.json({ error: idBody ? "demanda não encontrada" : "Essa demanda já foi decidida ou não existe mais." }, { status: 404 });
  }
  const id = d.id as string;
  // Nome de quem decide (cadastro da equipe) — é ele que fica em decided_by e no aviso do grupo.
  const { data: tm } = await supabaseAdmin.from("team_members").select("name").eq("email", user.email).maybeSingle();
  const quem = nomeDeQuemDecide(tm?.name as string | undefined, user.email);
  const resumo = (d.resumo as string) || (d.message_text as string) || "demanda";
  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
  const sug = (d.msg_id_sugestao as string) || undefined; // threading: responde a sugestão no grupo

  // ── Voltar para pendente (o "Desfazer" do descarte) ──
  if (acao === "reabrir") {
    const { data: outra, error: errOutra } = await supabaseAdmin.from("cs_demandas").select("id")
      .eq("codigo", d.codigo as string).eq("status", "pendente").neq("id", id).limit(1).maybeSingle();
    if (errOutra) return NextResponse.json({ error: "Não consegui conferir o código do pedido. Tente de novo." }, { status: 500 });
    const pode = podeReabrir({ status: d.status as string }, !!outra);
    if (!pode.ok) return NextResponse.json({ error: pode.erro }, { status: 409 });
    const { data: voltou, error: errVolta } = await supabaseAdmin.from("cs_demandas")
      .update({ status: "pendente", decided_at: null, decided_by: null })
      .eq("id", id).eq("status", "descartada").select("id");
    if (errVolta) return NextResponse.json({ error: `Não consegui voltar o pedido para pendente: ${errVolta.message}` }, { status: 500 });
    if (!voltou?.length) return NextResponse.json({ error: "O pedido mudou enquanto isso — recarregue." }, { status: 409 });
    if (internalJid) await csSendGroupText(internalJid, `↩️ *${resumo}* voltou para pendente — ${quem} desfez o descarte (pela plataforma). Vale o mesmo: *ok* · *não* · *ajustar*.`, sug);
    console.log(`[CS/decide] ${d.codigo} reaberta por ${quem}`);
    return NextResponse.json({ ok: true, decision: "pendente", id });
  }

  // Idempotente: se já foi decidida (no zap ou por outra pessoa), não refaz nem duplica card.
  if (d.status !== "pendente") return NextResponse.json({ ok: true, jaDecidida: d.status as string });

  if (acao === "descartar") {
    // Só descarta se AINDA está pendente (o "ok" no WhatsApp pode ter chegado no meio) e confere o erro:
    // antes a rota respondia "descartada" mesmo quando o update falhava.
    const { data: desc, error: errDesc } = await supabaseAdmin.from("cs_demandas")
      .update({ status: "descartada", decided_at: new Date().toISOString(), decided_by: quem })
      .eq("id", id).eq("status", "pendente").select("id");
    if (errDesc) return NextResponse.json({ error: `Não consegui descartar: ${errDesc.message}. O pedido continua pendente.` }, { status: 500 });
    if (!desc?.length) return NextResponse.json({ ok: true, jaDecidida: "decidida no meio-tempo" });
    if (internalJid) await csSendGroupText(internalJid, `🗑️ *${resumo}* descartada por ${quem} (pela plataforma).`, sug);
    console.log(`[CS/decide] ${d.codigo} descartada por ${quem}`);
    return NextResponse.json({ ok: true, decision: "descartada", id, por: quem });
  }

  // confirmar → cria o card (ajuste opcional entra no briefing antes).
  // 21/10/2026 (auditoria 5.9): só vira "confirmada" com card criado. Antes, card que falhava deixava
  // a demanda confirmada sem card — a nova tentativa dava "já foi decidida" e o pedido sumia. E a
  // demanda sem cliente virava card no cliente de TESTE; agora é recusada.
  let briefing = (d.briefing as string) || (d.message_text as string) || "";
  if (ajuste) briefing = `${briefing}\n\n---\n✏️ ${quem}: ${ajuste}`.trim();

  const r = await confirmarDemanda(d, {
    quem, titulo: resumo, briefing, notaPauta: ajuste || null, gravar: { briefing },
  });
  if (!r.ok) {
    console.error(`[CS/decide] ${d.codigo} NÃO confirmada (${r.motivo}): ${r.erro}`);
    const erro = r.motivo === "sem_cliente"
      ? "Essa demanda não tem cliente vinculado — não dá pra criar o card. Descarte e peça de novo dizendo o cliente."
      : r.motivo === "pauta_sem_itens"
        ? "Não consegui recuperar os itens dessa pauta. Ela continua pendente — monte direto no board ou descarte."
        : `Não consegui criar o card (${r.erro}). A demanda continua pendente — tente de novo.`;
    return NextResponse.json({ error: erro, motivo: r.motivo }, { status: r.motivo === "card_falhou" ? 502 : 409 });
  }

  const ehPauta = d.tipo === "pauta_semanal";
  const parcial = textoPautaParcial(r.criados, r.total, r.falhas);
  if (internalJid) {
    await csSendGroupText(internalJid, ehPauta
      ? `✅ Pauta da *${resumo.replace("Pauta da semana ", "semana ")}* de *${d.cliente_nome}* aprovada por ${quem} (pela plataforma) — ${r.criados} cards no board. 📅${parcial}`
      : `✅ *${resumo}* — card criado por ${quem} (pela plataforma).`, sug);
  }
  console.log(`[CS/decide] ${d.codigo} confirmada por ${quem} → ${r.criados}/${r.total} card(s)`);
  return NextResponse.json({
    ok: true, decision: "confirmada", cardId: r.cardId, cards: r.criados,
    ...(r.falhas.length ? { falhas: r.falhas } : {}),
  });
}
