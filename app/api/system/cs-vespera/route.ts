export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, ymd, addDays } from "@/lib/cs/vigilancia";

// POST /api/system/cs-vespera — VÉSPERA de postagem. Roda na tarde do dia ANTERIOR a um dia de
// post (seg/qua/sex) — ou seja dom/ter/qui — e cobra o time a ADIANTAR: a arte de amanhã já está
// pronta? Se amanhã é quarta (vídeo), o roteiro já foi feito? O cs-postagem só avisa na manhã do
// dia (tarde demais pra produzir); esta é a antecipação que faltava.
// Cron sugerido: dom/ter/qui 16h BRT = 19h UTC → `0 19 * * 0,2,4`.
const VESPERA_LIVE = true; // false = calcula e devolve o preview, mas NÃO posta.

const WEEKDAYS_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const previewOnly = req.nextUrl.searchParams.get("preview") !== null;

  const now = spNow();
  const amanha = addDays(now, 1);
  const wdAmanha = amanha.getDay(); // 0=dom … 6=sáb
  const ehDiaDePost = wdAmanha === 1 || wdAmanha === 3 || wdAmanha === 5; // seg/qua/sex
  if (!ehDiaDePost) {
    return NextResponse.json({ ok: true, skip: "amanhã não é dia de post", amanha: ymd(amanha) });
  }
  const firme = wdAmanha === 1 || wdAmanha === 5; // seg/sex = todos; quarta = só quem faz vídeo
  const videoDay = wdAmanha === 3;
  const amanhaKey = ymd(amanha);
  const diaLabel = `${WEEKDAYS_PT[wdAmanha]} ${String(amanha.getDate()).padStart(2, "0")}/${String(amanha.getMonth() + 1).padStart(2, "0")}`;

  // Clientes ATIVOS com social + perfil de conteúdo.
  const { data: clientsData, error: cErr } = await supabaseAdmin
    .from("clients")
    .select("id, name, assigned_social, active, perfil_conteudo")
    .or("active.is.null,active.eq.true");
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  const clientes = (clientsData ?? []).filter(
    (c) => (c.assigned_social as string)?.trim() && !(c.name as string)?.startsWith("🧪"),
  );
  const fazVideo = (c: (typeof clientes)[number]) => c.perfil_conteudo === "video" || c.perfil_conteudo === "completo";

  // Cards com due_date = amanhã → estado da arte (entregue pelo designer?).
  const { data: cardsData } = await supabaseAdmin
    .from("content_cards")
    .select("client_id, designer_delivered_at, status")
    .eq("due_date", amanhaKey)
    .is("archived_at", null);
  // allDelivered: o cliente só conta como "pronto" se TODOS os cards de amanhã estiverem entregues.
  // (Antes, 1 card entregue marcava o cliente inteiro como pronto e escondia um 2º post não pronto.)
  const cardByClient = new Map<string, { allDelivered: boolean }>();
  for (const k of cardsData ?? []) {
    const cid = k.client_id as string;
    // "approved" não existe como status — os reais são approval/client_approval (arte já entregue,
    // em aprovação) além de scheduled/published.
    const delivered = !!k.designer_delivered_at || ["published", "scheduled", "approval", "client_approval"].includes(k.status as string);
    const prev = cardByClient.get(cid);
    cardByClient.set(cid, { allDelivered: (prev?.allDelivered ?? true) && delivered });
  }

  // Quem é esperado postar amanhã e ainda não está pronto.
  const semCard: { nome: string; social: string }[] = [];
  const semArte: { nome: string; social: string }[] = [];
  let prontos = 0;
  const esperados = clientes.filter((c) => (firme ? true : fazVideo(c)));
  for (const c of esperados) {
    const nome = (c.name as string) || "Cliente";
    const social = (c.assigned_social as string) || "—";
    const card = cardByClient.get(c.id as string);
    if (!card) semCard.push({ nome, social });
    else if (!card.allDelivered) semArte.push({ nome, social });
    else prontos++;
  }

  // Roteiro de vídeo (só quando amanhã é quarta).
  const videoClientes = videoDay ? esperados.filter(fazVideo).map((c) => (c.name as string) || "Cliente") : [];

  // ── Monta a mensagem ──
  let msg = "";
  const temPendencia = semCard.length > 0 || semArte.length > 0 || videoClientes.length > 0;
  if (temPendencia) {
    const linhas: string[] = [`🗓️ *Véspera de ${diaLabel} — bora adiantar!*`, "Amanhã tem post. Pra não virar corrida amanhã cedo:"];
    if (semCard.length > 0) {
      linhas.push("", "⚠️ *Sem pauta/card pra amanhã:*");
      semCard.forEach((x) => linhas.push(`• ${x.nome} — _${x.social}_`));
    }
    if (semArte.length > 0) {
      linhas.push("", "🎨 *Card criado, mas arte ainda não entregue:*");
      semArte.forEach((x) => linhas.push(`• ${x.nome} — _${x.social}_`));
    }
    if (videoClientes.length > 0) {
      linhas.push("", "🎬 *Amanhã é quarta (vídeo) — o roteiro já está pronto?*");
      linhas.push(videoClientes.map((n) => `• ${n}`).join("\n"));
    }
    linhas.push("", `✅ Já prontos: *${prontos}/${esperados.length}*`);
    msg = linhas.join("\n");
  }

  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;
  let postada = false;
  let formatoUsado: "texto" | "pdf" = "texto";
  if (msg && VESPERA_LIVE && internalJid && !previewOnly) {
    // TEXTO OU PDF SEGUE O VOLUME (lib/cs/formato-aviso.ts). Em 11/09 esta mensagem saiu com 11
    // clientes e o WhatsApp cortou com "Ler mais" — o fim da lista, onde estão os casos mais
    // antigos, não foi lido por ninguém. Véspera com três clientes continua indo como texto.
    const { escolherFormato } = await import("@/lib/cs/formato-aviso");
    const itens = semCard.length + semArte.length + videoClientes.length;
    formatoUsado = escolherFormato({ itens, texto: msg });

    if (formatoUsado === "pdf") {
      try {
        const { htmlToPdf } = await import("@/lib/traffic/renderPdf");
        const { loadLoneLogo } = await import("@/lib/cs/roteiro-pdf");
        const { csSendGroupDocument } = await import("@/lib/cs/notify");
        const { vesperaPdfHtml, legendaVespera } = await import("@/lib/reports/vesperaPdf");
        const dados = {
          diaLabel, semCard, semArte, video: videoClientes,
          prontos, esperados: esperados.length,
        };
        const logo = await loadLoneLogo().catch(() => "");
        const pdf = await htmlToPdf(vesperaPdfHtml(dados, logo, new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })));
        if (!pdf.ok || !pdf.buffer) throw new Error(pdf.error ?? "render falhou");
        const arquivo = `Vespera ${diaLabel.replace(/[^\p{L}\p{N} ]/gu, "").trim()}.pdf`;
        const env = await csSendGroupDocument(internalJid, pdf.buffer.toString("base64"), arquivo,
          legendaVespera(dados), "application/pdf");
        if (!env.ok) throw new Error(env.error ?? "envio falhou");
        postada = true;
      } catch (e) {
        // Véspera que some porque o render caiu é pior que véspera comprida: cai pro texto.
        console.error("[cs-vespera] PDF falhou, mandando como texto:", String(e));
        formatoUsado = "texto";
        const r = await csSendGroupText(internalJid, msg, undefined, { origem: "cs-vespera", destino: "interno" });
        postada = r.ok;
      }
    } else {
      const r = await csSendGroupText(internalJid, msg, undefined, { origem: "cs-vespera", destino: "interno" });
      postada = r.ok;
      if (!r.ok) console.error("[cs-vespera] post falhou:", r.error);
    }
  }

  console.log(`[cs-vespera] formato=${formatoUsado} amanhã=${amanhaKey} wd=${wdAmanha} esperados=${esperados.length} semCard=${semCard.length} semArte=${semArte.length} prontos=${prontos} postada=${postada}`);
  return NextResponse.json({
    ok: true, live: VESPERA_LIVE, amanha: diaLabel, firme, video_day: videoDay,
    esperados: esperados.length, prontos, sem_card: semCard.length, sem_arte: semArte.length,
    video_clientes: videoClientes, postada, skip: !msg, preview: msg,
  });
}
