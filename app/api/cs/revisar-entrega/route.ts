export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { fetchClientCsRules } from "@/lib/supabase/queries";
import { loadBriefingCombinado } from "@/lib/cs/load-briefing";
import { revisarArte } from "@/lib/cs/revisao-arte";
import { csSendGroupText } from "@/lib/cs/notify";
import { agruparProblemas } from "@/lib/cs/revisao-agrupar";

// POST /api/cs/revisar-entrega { cardId } — REVISÃO AUTOMÁTICA na ENTREGA do designer. Confere as
// artes contra o briefing (preço/texto/localização/regras). Se achar problema, avisa no grupo de
// Artes + comenta no card + notifica. Suggest-only: NÃO bloqueia a entrega, só alerta. Fire-and-forget.
const isImageUrl = (u: string) => /^https?:\/\//.test(u) && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u);
const MAX_ARTES = 6; // teto de artes revisadas por card (bound de custo da visão)

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!isOpenAIConfigured()) return NextResponse.json({ ok: false, skip: "IA não configurada" });

  const { cardId } = (await req.json().catch(() => ({}))) as { cardId?: string };
  if (!cardId) return NextResponse.json({ error: "cardId obrigatório" }, { status: 400 });

  const { data: card } = await supabaseAdmin
    .from("content_cards").select("id, title, briefing, image_url, client_id, client_name").eq("id", cardId).maybeSingle();
  if (!card) return NextResponse.json({ error: "card não encontrado" }, { status: 404 });

  // Artes a revisar: anexos (carrossel) na ordem; fallback pra capa.
  const { data: atts } = await supabaseAdmin
    .from("card_attachments").select("url, position").eq("card_id", cardId).order("position", { ascending: true });
  let urls = (atts ?? []).map((a) => a.url as string).filter(isImageUrl);
  if (urls.length === 0 && isImageUrl((card.image_url as string) || "")) urls = [card.image_url as string];
  urls = urls.slice(0, MAX_ARTES);
  if (urls.length === 0) return NextResponse.json({ ok: true, skip: "sem imagem direta pra revisar (pode estar como link do Drive)" });

  const { data: cli } = await supabaseAdmin
    .from("clients").select("name, nome_fantasia, fixed_briefing, campaign_briefing, assigned_designer, assigned_social").eq("id", card.client_id as string).maybeSingle();
  const clienteNome = (cli?.nome_fantasia as string) || (cli?.name as string) || (card.client_name as string) || "Cliente";
  const briefing = await loadBriefingCombinado(card.client_id as string, (cli?.fixed_briefing as string) || (cli?.campaign_briefing as string));
  const regras = (await fetchClientCsRules(card.client_id as string)).filter((r) => r.escopo !== "roteiro").map((r) => `${r.texto} (${r.escopo})`);
  const temaEsperado = `${card.title as string}${card.briefing ? ` — ${(card.briefing as string).slice(0, 300)}` : ""}`;

  // Revisa cada arte SABENDO A POSIÇÃO no carrossel (sem isso, toda arte era comparada com o
  // "Slide 1 — Capa"). O mesmo problema em várias artes vira uma linha só.
  const porArte: string[][] = [];
  for (let i = 0; i < urls.length; i++) {
    const r = await revisarArte({ imageUrl: urls[i], clienteNome, briefing, regras, temaEsperado, posicao: { n: i + 1, total: urls.length } });
    porArte.push(r.ok && r.data && !r.data.ok ? r.data.problemas : []);
  }
  const problemas = agruparProblemas(porArte);

  const designer = (cli?.assigned_designer as string) || "";
  const social = (cli?.assigned_social as string) || "";

  if (problemas.length === 0) {
    // Tudo certo — registro discreto no card (sem poluir o grupo).
    await supabaseAdmin.from("card_comments").insert({
      card_id: cardId, author: "🤖 Revisão IA", role: "system", text: "✅ Revisão automática: arte conferida contra o briefing, nenhum erro aparente.",
    }).then(() => {}, () => {});
    return NextResponse.json({ ok: true, problemas: [], artes: urls.length });
  }

  // Achou problema → comenta no card, notifica e avisa no grupo de Artes. O card leva a lista INTEIRA
  // (antes cortava em 8 e a mensagem dizia "achei 16").
  const lista = problemas.map((p) => `• ${p}`).join("\n");
  await supabaseAdmin.from("card_comments").insert({
    card_id: cardId, author: "🤖 Revisão IA", role: "system", text: `⚠️ Revisão automática encontrou pontos a conferir:\n${lista}`,
  }).then(() => {}, () => {});
  await supabaseAdmin.from("notifications").insert({
    type: "content", title: "⚠️ Revisão da arte (IA)",
    body: `"${card.title as string}" (${clienteNome}) — a IA achou ${problemas.length} ponto(s) a conferir antes de ir ao cliente.`,
    client_id: card.client_id as string,
  }).then(() => {}, () => {});

  const jid = process.env.CS_INTERNAL_GROUP_JID; // grupo de Artes
  if (jid) {
    const quem = [designer && `designer *${designer}*`, social && `social *${social}*`].filter(Boolean).join(" · ");
    const msg = `🔍 *Revisão automática — ${clienteNome}*\nA arte de *${card.title as string}* foi entregue e eu conferi contra o briefing. Achei ${problemas.length} ponto(s) pra revisar${quem ? ` — ${quem}` : ""}:\n\n${lista}\n\n_Dá uma olhada antes de mandar pro cliente (posso estar enganada — confere na fonte)._`;
    const meta = { origem: "revisao-arte", destino: "interno" as const, clientId: card.client_id as string };
    // TEXTO OU PDF SEGUE O VOLUME (lib/cs/formato-aviso.ts), como os outros avisos.
    const { escolherFormato } = await import("@/lib/cs/formato-aviso");
    let enviado = false;
    if (escolherFormato({ itens: problemas.length, texto: msg }) === "pdf") {
      try {
        const { htmlToPdf } = await import("@/lib/traffic/renderPdf");
        const { loadLoneLogo } = await import("@/lib/cs/roteiro-pdf");
        const { csSendGroupDocument } = await import("@/lib/cs/notify");
        const { revisaoArtePdfHtml, legendaRevisaoArte } = await import("@/lib/reports/revisaoArtePdf");
        const dados = { cliente: clienteNome, peca: card.title as string, designer, social, artes: urls.length, problemas };
        const logo = await loadLoneLogo().catch(() => "");
        const pdf = await htmlToPdf(revisaoArtePdfHtml(dados, logo, new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })));
        if (!pdf.ok || !pdf.buffer) throw new Error(pdf.error ?? "render falhou");
        const nomeArq = `Revisao ${clienteNome} ${(card.title as string)}`.replace(/[^\p{L}\p{N} -]/gu, "").replace(/\s+/g, " ").trim().slice(0, 80);
        const r = await csSendGroupDocument(jid, pdf.buffer.toString("base64"), `${nomeArq}.pdf`, legendaRevisaoArte(dados), "application/pdf");
        enviado = r.ok;
        if (!r.ok) throw new Error(r.error ?? "envio falhou");
      } catch (e) {
        console.error("[revisar-entrega] PDF falhou, mandando como texto:", String(e));
      }
    }
    if (!enviado) await csSendGroupText(jid, msg, undefined, meta).catch(() => {});
  }

  return NextResponse.json({ ok: true, problemas, artes: urls.length });
}
