export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireCronOrUser } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isOpenAIConfigured } from "@/lib/ai/openai";
import { fetchClientCsRules } from "@/lib/supabase/queries";
import { loadBriefingCombinado } from "@/lib/cs/load-briefing";
import { revisarArte } from "@/lib/cs/revisao-arte";
import { csSendGroupText } from "@/lib/cs/notify";
import { agruparProblemas, comentarioDaRevisao, avisoSemConferencia, avisoRevisaoNaoRodou, type ArteNaoVista } from "@/lib/cs/revisao-agrupar";
import { carregarArtesParaIa } from "@/lib/conteudo/artes-para-ia-server";
import { notaDeCobertura } from "@/lib/conteudo/artes-para-ia";
import { comExecucao, anotar } from "@/lib/obs/correlacao";

// POST /api/cs/revisar-entrega { cardId } — REVISÃO AUTOMÁTICA na ENTREGA do designer. Confere as
// artes contra o briefing (preço/texto/localização/regras). Se achar problema, avisa no grupo de
// Artes + comenta no card + notifica. Suggest-only: NÃO bloqueia a entrega, só alerta. Fire-and-forget.
//
// 24/10/2026 (auditoria de erro recuperável, 2.9):
//  · só as artes da ENTREGA ATUAL (a mesma escolha do "Enviar pro cliente") — antes revisava todos
//    os anexos, inclusive a referência do social, como se fosse a arte;
//  · o teto de MAX_ARTES continua (custo), mas o comentário diz "conferi X de N" e quais ficaram de fora;
//  · quando a revisão NÃO roda (IA desligada, leitura falhou, só referência, arte em link, erro no
//    meio), o card ganha o aviso "não rodou" e a execução fica em agent_runs — antes voltava calada.
const MAX_ARTES = 6; // teto de artes revisadas por card (bound de custo da visão)
const AUTOR = "🤖 Revisão IA";

async function comentar(cardId: string, texto: string): Promise<void> {
  const { error } = await supabaseAdmin.from("card_comments").insert({ card_id: cardId, author: AUTOR, role: "system", text: texto });
  if (error) console.error("[revisar-entrega] não gravei o comentário no card:", cardId, error.message);
}

/** A revisão não rodou: deixa o rastro no card (e na execução) e devolve o motivo. */
async function naoRodou(cardId: string, motivo: string, status = 200) {
  anotar(`não rodou: ${motivo}`);
  console.error("[revisar-entrega] não rodou:", cardId, motivo);
  await comentar(cardId, avisoRevisaoNaoRodou(motivo));
  return NextResponse.json({ ok: false, naoRodou: true, motivo }, { status });
}

export async function POST(req: NextRequest) {
  // Usuário logado (a entrega no quadro) ou rotina do sistema (refazer revisões que falharam).
  const negado = await requireCronOrUser(req);
  if (negado) return negado;

  const { cardId } = (await req.json().catch(() => ({}))) as { cardId?: string };
  if (!cardId) return NextResponse.json({ error: "cardId obrigatório" }, { status: 400 });

  return comExecucao({ origem: "cs:revisar-entrega", extra: { cardId } }, async () => {
    try {
      return await revisar(cardId);
    } catch (e) {
      // Erro no meio (banco, rede, PDF): o card diz que a revisão não terminou.
      return naoRodou(cardId, `erro inesperado: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300), 500);
    }
  });
}

async function revisar(cardId: string) {
  if (!isOpenAIConfigured()) return naoRodou(cardId, "a IA não está configurada no servidor");

  const { data: card, error: eCard } = await supabaseAdmin
    .from("content_cards").select("id, title, briefing, image_url, client_id, client_name").eq("id", cardId).maybeSingle();
  if (eCard) return naoRodou(cardId, `não consegui ler o card (${eCard.message})`, 500);
  if (!card) return NextResponse.json({ error: "card não encontrado" }, { status: 404 });

  // Artes a revisar: as da ENTREGA ATUAL, na ordem — referência do social não é arte.
  const lidas = await carregarArtesParaIa(cardId, card.image_url as string | null, MAX_ARTES);
  if (!lidas.ok) return naoRodou(cardId, lidas.erro, 500);
  const escolha = lidas.artes;
  const urls = escolha.artes.map((a) => a.url);
  if (urls.length === 0) {
    return naoRodou(cardId, escolha.erro ?? "não há arte de entrega com imagem para conferir");
  }

  const { data: cli } = await supabaseAdmin
    .from("clients").select("name, nome_fantasia, fixed_briefing, campaign_briefing, assigned_designer, assigned_social").eq("id", card.client_id as string).maybeSingle();
  const clienteNome = (cli?.nome_fantasia as string) || (cli?.name as string) || (card.client_name as string) || "Cliente";
  const briefing = await loadBriefingCombinado(card.client_id as string, (cli?.fixed_briefing as string) || (cli?.campaign_briefing as string));
  const regras = (await fetchClientCsRules(card.client_id as string)).filter((r) => r.escopo !== "roteiro").map((r) => `${r.texto} (${r.escopo})`);
  const temaEsperado = `${card.title as string}${card.briefing ? ` — ${(card.briefing as string).slice(0, 300)}` : ""}`;

  // Revisa cada arte SABENDO A POSIÇÃO no carrossel (sem isso, toda arte era comparada com o
  // "Slide 1 — Capa"). O mesmo problema em várias artes vira uma linha só.
  const porArte: string[][] = [];
  const naoVistas: ArteNaoVista[] = [];
  for (let i = 0; i < urls.length; i++) {
    const r = await revisarArte({ imageUrl: urls[i], clienteNome, briefing, regras, temaEsperado, posicao: { n: i + 1, total: urls.length } });
    // Falha NÃO é "sem problema" (ver comentarioDaRevisao): a arte fica marcada como não conferida.
    if (!r.ok || !r.data) { naoVistas.push({ n: i + 1, motivo: r.error ?? "erro desconhecido" }); porArte.push([]); continue; }
    porArte.push(r.data.ok ? [] : r.data.problemas);
  }
  const problemas = agruparProblemas(porArte);
  const cobertura = notaDeCobertura(escolha, urls.length - naoVistas.length);
  const comentario = comentarioDaRevisao(problemas, naoVistas, urls.length, cobertura);

  const designer = (cli?.assigned_designer as string) || "";
  const social = (cli?.assigned_social as string) || "";

  if (comentario === null) {
    // Nenhuma arte vista: o card diz isso, em vez do selo de aprovado.
    await comentar(cardId, avisoSemConferencia(naoVistas));
    anotar(`nenhuma arte conferida: ${naoVistas[0]?.motivo ?? "?"}`);
    console.error("[revisar-entrega] nenhuma arte conferida:", cardId, naoVistas[0]?.motivo);
    return NextResponse.json({ ok: false, problemas: [], artes: urls.length, total: escolha.total, nao_conferidas: naoVistas });
  }

  if (problemas.length === 0) {
    // Tudo certo (ou só parte vista, o que o comentário diz) — registro discreto no card, sem poluir o grupo.
    await comentar(cardId, comentario);
    return NextResponse.json({ ok: true, problemas: [], artes: urls.length, total: escolha.total, nao_conferidas: naoVistas });
  }

  // Achou problema → comenta no card, notifica e avisa no grupo de Artes. O card leva a lista INTEIRA
  // (antes cortava em 8 e a mensagem dizia "achei 16").
  const lista = problemas.map((p) => `• ${p}`).join("\n");
  await comentar(cardId, comentario);
  await supabaseAdmin.from("notifications").insert({
    type: "content", title: "⚠️ Revisão da arte (IA)",
    body: `"${card.title as string}" (${clienteNome}) — a IA achou ${problemas.length} ponto(s) a conferir antes de ir ao cliente.`,
    client_id: card.client_id as string,
  }).then(() => {}, () => {});

  const jid = process.env.CS_INTERNAL_GROUP_JID; // grupo de Artes
  if (jid) {
    const quem = [designer && `designer *${designer}*`, social && `social *${social}*`].filter(Boolean).join(" · ");
    const msg = `🔍 *Revisão automática — ${clienteNome}*\nA arte de *${card.title as string}* foi entregue e eu conferi contra o briefing. Achei ${problemas.length} ponto(s) pra revisar${quem ? ` — ${quem}` : ""}:\n\n${lista}\n\n${escolha.foraDoLimite ? `_Conferi ${urls.length} de ${escolha.total} artes — as outras, confira à mão._\n` : ""}_Dá uma olhada antes de mandar pro cliente (posso estar enganada — confere na fonte)._`;
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

  return NextResponse.json({ ok: true, problemas, artes: urls.length, total: escolha.total });
}
