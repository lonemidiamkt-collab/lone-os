export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { criarCardDemanda, criarCardsPauta } from "@/lib/cs/card";
import { parsePautaItens } from "@/lib/cs/pauta";
import { csSendGroupText } from "@/lib/cs/notify";

// POST /api/cs/decide — a equipe decide uma sugestão do Agente CS PELA PLATAFORMA (painel Agente
// Lone), espelhando o "ok/não" do WhatsApp: cria o ContentCard (ou descarta), marca a demanda e
// avisa o grupo interno pra manter os dois lados em sincronia. Suggest-only continua: só age no ok.
//   body: { id, acao: "confirmar" | "descartar", ajuste?: string }
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  const acao = body?.acao as string | undefined;
  const ajuste = (body?.ajuste as string | undefined)?.trim();
  if (!id || (acao !== "confirmar" && acao !== "descartar")) {
    return NextResponse.json({ error: "id e acao (confirmar|descartar) obrigatórios" }, { status: 400 });
  }

  const { data: d } = await supabaseAdmin.from("cs_demandas").select("*").eq("id", id).maybeSingle();
  if (!d) return NextResponse.json({ error: "demanda não encontrada" }, { status: 404 });
  // Idempotente: se já foi decidida (no zap ou por outra pessoa), não refaz nem duplica card.
  if (d.status !== "pendente") return NextResponse.json({ ok: true, jaDecidida: d.status as string });

  const quem = user.email.split("@")[0]; // nome curto p/ auditoria/decided_by
  const resumo = (d.resumo as string) || (d.message_text as string) || "demanda";
  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
  const sug = (d.msg_id_sugestao as string) || undefined; // threading: responde a sugestão no grupo

  if (acao === "descartar") {
    await supabaseAdmin.from("cs_demandas")
      .update({ status: "descartada", decided_at: new Date().toISOString(), decided_by: quem })
      .eq("id", id);
    if (internalJid) await csSendGroupText(internalJid, `🗑️ *${resumo}* descartada por ${quem} (pela plataforma).`, sug);
    console.log(`[CS/decide] ${d.codigo} descartada por ${quem}`);
    return NextResponse.json({ ok: true, decision: "descartada" });
  }

  // confirmar → cria o card (ajuste opcional entra no briefing antes).
  const clientId = (d.client_id as string) || process.env.CS_TEST_CLIENT_ID || null;
  if (!clientId) return NextResponse.json({ error: "demanda sem cliente pra criar o card" }, { status: 400 });
  let briefing = (d.briefing as string) || (d.message_text as string) || "";
  if (ajuste) briefing = `${briefing}\n\n---\n✏️ ${quem}: ${ajuste}`.trim();

  // PAUTA SEMANAL confirmada pelo painel → um card por item (com a data).
  if (d.tipo === "pauta_semanal") {
    const itens = parsePautaItens((d.message_text as string) || "") ?? [];
    if (!itens.length) return NextResponse.json({ error: "pauta sem itens recuperáveis" }, { status: 400 });
    const ids = await criarCardsPauta({
      clientId, clienteNome: (d.cliente_nome as string) || "Cliente",
      responsavel: d.responsavel as string | null, itens, notaExtra: ajuste || null,
    });
    await supabaseAdmin.from("cs_demandas").update({
      status: "confirmada", content_card_id: ids[0] ?? null, briefing,
      decided_at: new Date().toISOString(), decided_by: quem,
    }).eq("id", id);
    if (internalJid) await csSendGroupText(internalJid, `✅ Pauta da *${resumo.replace("Pauta da semana ", "semana ")}* de *${d.cliente_nome}* aprovada por ${quem} (pela plataforma) — ${ids.length} cards no board. 📅`, sug);
    console.log(`[CS/decide] pauta ${d.codigo} confirmada por ${quem} → ${ids.length} cards`);
    return NextResponse.json({ ok: ids.length > 0, decision: "confirmada", cards: ids.length });
  }

  const cardId = await criarCardDemanda({
    clientId, clienteNome: (d.cliente_nome as string) || "Cliente", responsavel: d.responsavel as string | null,
    titulo: resumo, urgencia: d.urgencia as string, briefing, tipo: d.tipo as string,
  });
  await supabaseAdmin.from("cs_demandas").update({
    status: "confirmada", content_card_id: cardId, briefing,
    decided_at: new Date().toISOString(), decided_by: quem,
  }).eq("id", id);
  if (internalJid) {
    await csSendGroupText(internalJid, cardId
      ? `✅ *${resumo}* — card criado por ${quem} (pela plataforma).`
      : `⚠️ ${quem} confirmou *${resumo}* na plataforma, mas o card falhou — dá uma olhada.`, sug);
  }
  console.log(`[CS/decide] ${d.codigo} confirmada por ${quem} → card ${cardId}`);
  return NextResponse.json({ ok: cardId != null, decision: "confirmada", cardId });
}
