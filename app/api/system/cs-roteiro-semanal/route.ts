export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupDocument } from "@/lib/cs/notify";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { spNow } from "@/lib/cs/vigilancia";
import { gerarRoteiros, type BriefingCliente } from "@/lib/cs/criativo";
import { roteiroPdfHtml } from "@/lib/cs/roteiro-pdf";

// POST /api/system/cs-roteiro-semanal — toda segunda: gera 1 roteiro por cliente de TESTE,
// renderiza um PDF branded (Lone) e envia no grupo da Equipe pro social gravar com o cliente até
// quarta. Suggest-only / backstage. Cron sugerido: segunda 9h BRT (`0 12 * * 1`).
// Query: ?dry=1 (gera mas NÃO envia) · ?limit=N (processa só os N primeiros — p/ teste).
//
// FASE DE TESTE: só os clientes abaixo. Depois dos testes, abrir pra mais (ou todos de vídeo).
const TEST_PATTERNS = [
  "dijana", "madeirao mov", "imperio dos pisos", "tindaro",
  "contele", "bazar ribeiro saquarema", "bazar ribeiro - maric",
];

const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "0") || 0;
  const now = spNow();
  const dataLabel = `Semana de ${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Logo Lone como data URI (busca o asset estático do próprio app).
  let logoDataUri = "";
  try {
    const r = await fetch("http://localhost:3000/logo.png", { signal: AbortSignal.timeout(8000) });
    if (r.ok) logoDataUri = `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch { /* sem logo → header só com texto */ }

  // Clientes de teste (match por nome normalizado).
  const { data: clientsData } = await supabaseAdmin
    .from("clients").select("id, name, nome_fantasia, nicho, industry, assigned_social")
    .or("active.is.null,active.eq.true");
  let alvos = (clientsData ?? []).filter((c) => {
    const n = norm((c.name as string) || "");
    return TEST_PATTERNS.some((p) => n.includes(p));
  });
  if (limit > 0) alvos = alvos.slice(0, limit);

  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
  const detalhe: Array<Record<string, unknown>> = [];
  let enviados = 0;

  for (const c of alvos) {
    const nome = (c.nome_fantasia as string) || (c.name as string) || "Cliente";
    const { data: b } = await supabaseAdmin
      .from("client_briefings")
      .select("resumo_estrategico, produtos, publico_alvo, posicionamento, dores, ganchos, ctas, tom_voz, produtos_destaque_atual, palavras_proibidas, concorrentes_evitar_mencionar")
      .eq("client_id", c.id as string).eq("is_current", true).maybeSingle();

    const briefing: BriefingCliente = {
      nome,
      nicho: (c.nicho as string) || (c.industry as string) || undefined,
      resumoEstrategico: (b?.resumo_estrategico as string) || undefined,
      produtos: (b?.produtos as string[]) || undefined,
      publicoAlvo: (b?.publico_alvo as string[]) || undefined,
      posicionamento: (b?.posicionamento as string) || undefined,
      dores: (b?.dores as string[]) || undefined,
      ganchos: (b?.ganchos as string[]) || undefined,
      ctas: (b?.ctas as string[]) || undefined,
      tomVoz: (b?.tom_voz as string) || undefined,
      produtosDestaque: (b?.produtos_destaque_atual as string[]) || undefined,
      palavrasProibidas: (b?.palavras_proibidas as string[]) || undefined,
      concorrentesEvitar: (b?.concorrentes_evitar_mencionar as string[]) || undefined,
    };

    const res = await gerarRoteiros({ briefing, estagioFunil: "meio" });
    if (!res.ok || !res.data || res.data.precisa_briefing || res.data.roteiros.length === 0) {
      detalhe.push({ cliente: nome, ok: false, motivo: res.data?.precisa_briefing ? "briefing fraco" : (res.error || "sem roteiro") });
      continue;
    }
    const roteiro = res.data.roteiros[0];
    const html = roteiroPdfHtml(nome, roteiro, logoDataUri, dataLabel);
    const pdf = await htmlToPdf(html);
    if (!pdf.ok || !pdf.buffer) {
      detalhe.push({ cliente: nome, ok: false, motivo: `PDF: ${pdf.error}` });
      continue;
    }

    if (dry || !internalJid) {
      detalhe.push({ cliente: nome, ok: true, pdf_kb: Math.round(pdf.buffer.length / 1024), scorecard: roteiro.scorecard, enviado: false });
      continue;
    }
    const fileName = `Roteiro ${nome} - ${dataLabel}.pdf`;
    const social = (c.assigned_social as string) || "equipe";
    const caption = `🎬 Roteiro da semana — *${nome}* (gravar até quarta). ${social}, dá uma olhada e alinha com o cliente!`;
    const sent = await csSendGroupDocument(internalJid, pdf.buffer.toString("base64"), fileName, caption);
    if (sent.ok) enviados++;
    detalhe.push({ cliente: nome, ok: sent.ok, scorecard: roteiro.scorecard, enviado: sent.ok, erro: sent.error });
  }

  console.log(`[cs-roteiro-semanal] alvos=${alvos.length} enviados=${enviados} dry=${dry}`);
  return NextResponse.json({ ok: true, dry, alvos: alvos.length, enviados, detalhe });
}
