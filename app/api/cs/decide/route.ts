export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { criarCardDemanda, criarCardsPauta } from "@/lib/cs/card";
import { parsePautaItens } from "@/lib/cs/pauta";
import { csSendGroupText } from "@/lib/cs/notify";
import { papelDoUsuario } from "@/lib/api/require-role";

// GET /api/cs/decide?codigos=a1b2,c3d4 — o "Decidir" do feed do Agente (Leva 7C, N25) abre a
// sugestão antes de decidir: o que o cliente escreveu, o que o agente entendeu e o briefing que vai
// para o card. Só as PENDENTES (código só é único entre elas). Designer e comercial não leem a conversa.
export async function GET(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const papel = await papelDoUsuario(user);
  if (!papel || papel === "designer" || papel === "comercial") {
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
//   body: { id, acao: "confirmar" | "descartar", ajuste?: string }
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const idBody = body?.id as string | undefined;
  const codigo = (body?.codigo as string | undefined)?.trim();
  const acao = body?.acao as string | undefined;
  const ajuste = (body?.ajuste as string | undefined)?.trim();
  if ((!idBody && !codigo) || (acao !== "confirmar" && acao !== "descartar")) {
    return NextResponse.json({ error: "id (ou codigo) e acao (confirmar|descartar) obrigatórios" }, { status: 400 });
  }

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
