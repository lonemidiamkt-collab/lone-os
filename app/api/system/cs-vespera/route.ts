export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { passouDaEntrega } from "@/lib/conteudo/etapas";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, ymd, addDays } from "@/lib/cs/vigilancia";
import { temSocial } from "@/lib/clients/servico";
import { estaPausado } from "@/lib/clients/pausa";
import { classificarVespera, diasDePostAnteriores } from "@/lib/cs/vespera-classificar";

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

  // ?dia=AAAA-MM-DD (só com ?preview): ensaia a véspera de um dia específico, sem enviar — é como
  // se confere a regra contra um dia que já passou.
  const diaEnsaio = previewOnly ? req.nextUrl.searchParams.get("dia") : null;
  const now = diaEnsaio && /^\d{4}-\d{2}-\d{2}$/.test(diaEnsaio) ? addDays(new Date(`${diaEnsaio}T12:00:00`), -1) : spNow();
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

  // Clientes ATIVOS que CONTRATARAM social (o contrato decide, não o nome gravado), fora de pausa.
  const { data: clientsData, error: cErr } = await supabaseAdmin
    .from("clients")
    .select("id, name, assigned_social, assigned_designer, active, perfil_conteudo, service_type, paused_at, paused_until, ig_business_account_id, created_at")
    .or("active.is.null,active.eq.true")
    .is("churned_at", null);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  const clientes = (clientsData ?? []).filter((c) =>
    temSocial({ service_type: c.service_type as string | null })
    && !estaPausado(c as { paused_at: string | null; paused_until: string | null }, now)
    && !(c.name as string)?.startsWith("🧪"),
  );
  const fazVideo = (c: (typeof clientes)[number]) => c.perfil_conteudo === "video" || c.perfil_conteudo === "completo";

  // O que está pedido pra amanhã: cards com a data E demandas de arte com o prazo. "Entregue" só
  // quando TODOS os de amanhã estão — 1 entregue não pode esconder um 2º post sem arte.
  const [{ data: cardsData }, { data: demandasData }] = await Promise.all([
    supabaseAdmin.from("content_cards").select("client_id, designer_delivered_at, status")
      .eq("due_date", amanhaKey).is("archived_at", null),
    supabaseAdmin.from("design_requests").select("client_id, status").eq("deadline", amanhaKey),
  ]);
  const pedidoPorCliente = new Map<string, { entregue: boolean }>();
  const marcar = (cid: string, entregue: boolean) => {
    const prev = pedidoPorCliente.get(cid);
    pedidoPorCliente.set(cid, { entregue: (prev?.entregue ?? true) && entregue });
  };
  for (const k of cardsData ?? []) marcar(k.client_id as string, !!k.designer_delivered_at || passouDaEntrega(k.status as string));
  for (const d of demandasData ?? []) marcar(d.client_id as string, String(d.status) === "done");

  // O QUE ACONTECEU DE VERDADE: posts do Instagram dos últimos ~5 semanas, por dia (SP).
  const desde = ymd(addDays(now, -35));
  const ids = clientes.map((c) => c.id as string);
  const { data: postsData } = ids.length
    ? await supabaseAdmin.from("client_ig_posts").select("client_id, posted_at").in("client_id", ids).gte("posted_at", `${desde}T00:00:00-03:00`).limit(5000)
    : { data: [] as { client_id: string; posted_at: string }[] };
  const diasComPost = new Map<string, Set<string>>();
  for (const p of postsData ?? []) {
    const dia = ymd(spNow(new Date(p.posted_at as string)));
    const set = diasComPost.get(p.client_id as string) ?? new Set<string>();
    set.add(dia);
    diasComPost.set(p.client_id as string, set);
  }

  const hojeKey = ymd(now);
  const artePendente: { nome: string; social: string }[] = [];
  const emRisco: { nome: string; social: string; postou: number; de: number }[] = [];
  const semInstagram: { nome: string; social: string }[] = [];
  const emDia: string[] = [];
  let prontos = 0;
  const esperados = clientes.filter((c) => (firme ? true : fazVideo(c)));
  for (const c of esperados) {
    const nome = (c.name as string) || "Cliente";
    const social = (c.assigned_social as string)?.trim() || "sem social";
    const pedido = pedidoPorCliente.get(c.id as string);
    const posts = diasComPost.get(c.id as string) ?? new Set<string>();
    const r = classificarVespera({
      temPedidoAmanha: !!pedido,
      pedidoEntregue: !!pedido?.entregue,
      instagramConferivel: !!c.ig_business_account_id || posts.size > 0,
      // Só conta dia de post a partir de uma semana depois do cadastro (a semana de setup). A Casas
      // Rio Bahia, com 10 dias de casa, aparecia "postou 1 de 6" — 4 dos 6 dias eram de antes dela.
      diasEsperados: diasDePostAnteriores(hojeKey, fazVideo(c) ? [1, 3, 5] : [1, 5], 6)
        .filter((d) => d >= ymd(addDays(new Date(c.created_at as string), 7))),
      diasComPost: posts,
    });
    if (r.situacao === "pronto") prontos++;
    else if (r.situacao === "em_dia") emDia.push(nome);
    else if (r.situacao === "arte_pendente") artePendente.push({ nome, social });
    else if (r.situacao === "em_risco") emRisco.push({ nome, social, postou: r.postou, de: r.de });
    else semInstagram.push({ nome, social });
  }
  emRisco.sort((a, b) => a.postou - b.postou || a.nome.localeCompare(b.nome, "pt-BR"));

  // Roteiro de vídeo (só quando amanhã é quarta).
  const videoClientes = videoDay ? esperados.filter(fazVideo).map((c) => (c.name as string) || "Cliente") : [];

  // ── Monta a mensagem ──
  // Só sai quando existe algo a FAZER hoje: arte pendente, cliente em risco ou roteiro de quarta.
  // "Em dia" e "pronto" entram no placar, não viram cobrança.
  let msg = "";
  const temPendencia = artePendente.length > 0 || emRisco.length > 0 || videoClientes.length > 0;
  const emDiaTotal = prontos + emDia.length;
  if (temPendencia) {
    const linhas: string[] = [`🗓️ *Véspera de ${diaLabel}*`];
    if (artePendente.length > 0) {
      linhas.push("", "🎨 *Card de amanhã sem arte entregue:*");
      artePendente.forEach((x) => linhas.push(`• ${x.nome} — _${x.social}_`));
    }
    if (emRisco.length > 0) {
      linhas.push("", "⚠️ *Sem card e faltando post nos últimos dias:*");
      emRisco.forEach((x) => linhas.push(`• ${x.nome} — postou ${x.postou} de ${x.de} — _${x.social}_`));
    }
    if (videoClientes.length > 0) {
      linhas.push("", "🎬 *Amanhã é quarta (vídeo) — o roteiro já está pronto?*");
      linhas.push(videoClientes.map((n) => `• ${n}`).join("\n"));
    }
    linhas.push("", `✅ Em dia: *${emDiaTotal}/${esperados.length}*`);
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
    const itens = artePendente.length + emRisco.length + videoClientes.length;
    formatoUsado = escolherFormato({ itens, texto: msg });

    if (formatoUsado === "pdf") {
      try {
        const { htmlToPdf } = await import("@/lib/traffic/renderPdf");
        const { loadLoneLogo } = await import("@/lib/cs/roteiro-pdf");
        const { csSendGroupDocument } = await import("@/lib/cs/notify");
        const { vesperaPdfHtml, legendaVespera } = await import("@/lib/reports/vesperaPdf");
        const dados = {
          diaLabel, artePendente, emRisco, semInstagram, emDia, video: videoClientes,
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

  console.log(`[cs-vespera] formato=${formatoUsado} amanhã=${amanhaKey} wd=${wdAmanha} esperados=${esperados.length} prontos=${prontos} emDia=${emDia.length} artePendente=${artePendente.length} emRisco=${emRisco.length} semIg=${semInstagram.length} postada=${postada}`);
  return NextResponse.json({
    ok: true, live: VESPERA_LIVE, amanha: diaLabel, firme, video_day: videoDay,
    esperados: esperados.length, prontos, em_dia: emDia.length, arte_pendente: artePendente.length,
    em_risco: emRisco.length, sem_instagram: semInstagram.length,
    lista_risco: emRisco.map((x) => `${x.nome} (${x.postou}/${x.de})`), lista_arte: artePendente.map((x) => x.nome),
    video_clientes: videoClientes, postada, skip: !msg, preview: msg,
  });
}
