// app/api/system/weekly-reports/route.ts
//
// Relatório semanal (7 dias) por cliente em PDF, entregue toda segunda no grupo.
// Reusa o MESMO PDF "PDF Cliente" da página de Anúncios Meta (buildClientReportHtml),
// renderizado server-side via browserless. Crontab (VPS):
//   0 11 * * 1 /opt/loneos/scripts/cron-call.sh weekly-reports POST >> /var/log/loneos-weekly-reports.log 2>&1
//
//   POST                      → gera o PDF de cada cliente ativo-com-Meta e envia ao grupo.
//   POST ?dryRun=1            → apenas lista/conta os clientes elegíveis (não gera/envia).
//   POST ?clientId=<id>       → gera SÓ esse cliente. Com dryRun, salva no Storage e devolve a URL (preview).
//   POST ?force=1             → ignora a idempotência do dia.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/emailService";
import { requireCron } from "@/lib/api/cron-guard";
import { getMetaToken, getAlertSettings } from "@/lib/traffic/sync-core";
import { sendMediaDocument } from "@/lib/whatsapp/evolution";
import { csSendGroupText } from "@/lib/cs/notify";
import {
  buildClientPdf, selectActiveMetaClients, periodLabelDays, slug,
} from "@/lib/traffic/weekly-report";

const ADMIN_EMAIL = "lonemidiamkt@gmail.com";
const REPORTS_BUCKET = "reports";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function todayKeyBRT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

async function notifyAdminFailure(subject: string, detail: string) {
  try {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `[Lone OS] ${subject}`,
      html: `<p>${subject}</p><pre>${detail.replace(/[<>]/g, "")}</pre>`,
      templateName: "weekly_report_alert",
    });
  } catch (e) {
    console.error("[weekly-reports] fallback e-mail falhou:", e);
  }
}

// ── POST ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const force = url.searchParams.get("force") === "1";
  const onlyClientId = url.searchParams.get("clientId");
  // ?period=month → relatório de 30 dias (mensal); padrão = 7 dias (semanal).
  const periodDays = url.searchParams.get("period") === "month" ? 30 : 7;

  // INTERVALO EXATO (?since=&until=, YYYY-MM-DD). Serve pra "relatório de julho fechado" em vez de
  // "últimos 30 dias" — rodando dia 3, o preset pegaria 04/07 a 02/08, que não é julho.
  // Só os ANÚNCIOS aceitam intervalo; o bloco de Instagram continua no preset (a API não tem mês
  // fechado) e já escreve a própria janela no PDF.
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const since = url.searchParams.get("since") || "";
  const until = url.searchParams.get("until") || "";
  const intervalo = ISO.test(since) && ISO.test(until) && since <= until;
  if ((since || until) && !intervalo) {
    return NextResponse.json({ error: "since/until precisam ser YYYY-MM-DD com since <= until." }, { status: 400 });
  }
  const dateFrom = intervalo ? since : undefined;
  const dateTo = intervalo ? until : undefined;

  // PRA QUEM VAI — O CLIENTE, POR PADRÃO.
  //
  // Esta rota nasceu mandando tudo pro grupo interno de tráfego: um digest pro gestor conferir.
  // Esse padrão já causou o mesmo erro DUAS vezes — os relatórios de julho caíram no grupo do
  // Julio, e hoje (10/08) eu repeti, mandando 42 PDFs pro grupo de tráfego enquanto os clientes
  // ficavam sem. Quem dispara sempre quer entregar ao cliente; o digest interno é a exceção.
  //
  // O Roberto foi direto: "não faz sentido enviar no grupo tráfego e no grupo do cliente, é melhor
  // enviar apenas no cliente". Então o padrão inverteu. Quem quiser o digest interno pede
  // explicitamente com `?destino=interno` — e assim o esquecimento erra pro lado certo.
  const paraCliente = url.searchParams.get("destino") !== "interno";

  const escopoLabel = intervalo
    ? `${since.split("-").reverse().join("/")} a ${until.split("-").reverse().join("/")}`
    : periodDays === 30 ? "30 dias" : "7 dias";
  // Chave de idempotência separada por escopo — semanal e mensal não colidem no mesmo dia.
  // Sufixo com hífen (não ":") — dois-pontos quebra o nome do arquivo no Storage/URL.
  const dateKey = todayKeyBRT() + (intervalo ? `-${since}_${until}` : periodDays === 30 ? "-mensal" : "");

  try {
    const settings = await getAlertSettings();
    const token = await getMetaToken();
    if (!token) {
      return NextResponse.json({ ok: false, status: "failed", error: "Token Meta ausente/expirado" }, { status: 200 });
    }

    // Clientes ativos com Meta vinculada
    const clients = await selectActiveMetaClients(onlyClientId);

    if (clients.length === 0) {
      return NextResponse.json({ ok: true, status: "skipped", message: "Nenhum cliente ativo com Meta" });
    }

    // dryRun sem clientId: só lista/conta os elegíveis (não gera PDFs).
    if (dryRun && !onlyClientId) {
      return NextResponse.json({
        ok: true, status: "dry_run", eligible: clients.length,
        clients: clients.map((c) => c.nome_fantasia || c.name),
      });
    }

    // Preview de 1 cliente: gera o PDF e salva no Storage, devolve a URL (não envia no grupo).
    if (dryRun && onlyClientId) {
      const c = clients[0];
      const pdf = await buildClientPdf(token, c, periodDays, dateFrom, dateTo);
      if (!pdf.ok || !pdf.buffer) {
        return NextResponse.json({ ok: false, status: "failed", client: c.nome_fantasia || c.name, error: pdf.error }, { status: 200 });
      }
      const path = `preview/${slug(c.nome_fantasia || c.name)}-${dateKey}.pdf`;
      const up = await supabaseAdmin.storage.from(REPORTS_BUCKET).upload(path, pdf.buffer, {
        contentType: "application/pdf", upsert: true,
      });
      if (up.error) {
        return NextResponse.json({ ok: false, status: "failed", error: `Storage: ${up.error.message}` }, { status: 200 });
      }
      const pub = supabaseAdmin.storage.from(REPORTS_BUCKET).getPublicUrl(path);
      return NextResponse.json({ ok: true, status: "preview", client: c.nome_fantasia || c.name, bytes: pdf.buffer.length, url: pub.data.publicUrl });
    }

    // Envio real → precisa do grupo
    if (!settings.enabled) {
      return NextResponse.json({ ok: true, status: "disabled", message: "Alertas desativados" });
    }
    if (!settings.groupJid) {
      await notifyAdminFailure("Relatório semanal não enviado", "traffic_alert_group_jid vazio.");
      return NextResponse.json({ ok: false, status: "failed", error: "Grupo não configurado" }, { status: 200 });
    }

    // Idempotência por dia (salvo force/clientId)
    if (!force && !onlyClientId) {
      const { data: already } = await supabaseAdmin
        .from("weekly_report_log")
        .select("id").eq("week_key", dateKey).eq("status", "sent").limit(1);
      if (already && already.length > 0) {
        return NextResponse.json({ ok: true, status: "skipped", message: "Relatórios já enviados hoje" });
      }
    }

    const period = periodLabelDays(periodDays);
    let sent = 0, failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < clients.length; i++) {
      const c = clients[i];
      const clientName = c.nome_fantasia || c.name;
      const clientKey = `${dateKey}:${c.id}`;
      // Dedup POR CLIENTE (nao so por execucao): num retry, quem JA recebeu nao recebe o PDF de novo.
      if (!force && !onlyClientId) {
        const { data: jaEnviou } = await supabaseAdmin.from("weekly_report_log").select("id").eq("week_key", clientKey).eq("status", "sent").limit(1);
        if (jaEnviou && jaEnviou.length > 0) continue;
      }
      try {
        const pdf = await buildClientPdf(token, c, periodDays, dateFrom, dateTo);
        if (!pdf.ok || !pdf.buffer) { failed++; errors.push(`${clientName}: ${pdf.error}`); continue; }

        // A LEGENDA DIZIA DUAS JANELAS DIFERENTES: o título trazia o intervalo pedido e a linha
        // "Período" trazia o rótulo do preset — saiu "Relatório 01/07 a 31/07 / Período: 27/07 a
        // 02/08" no grupo. Com intervalo exato, a janela é UMA só e não se repete.
        const janela = intervalo ? escopoLabel : period;
        const caption = paraCliente
          // Pro CLIENTE: quem lê é o dono do negócio, não o gestor. Sem jargão de janela no topo,
          // com a porta aberta pra dúvida — o relatório é começo de conversa, não protocolo.
          ? `Olá, pessoal! 😊 Estou enviando o relatório do mês de vocês.\n\n`
            + `📊 *${clientName}* — ${janela}\n\n`
            + `Qualquer dúvida sobre os números, é só chamar a gente por aqui que explicamos com calma. `
            + `Bom mês pra vocês! 🚀`
          : `📊 *Relatório ${janela} — ${clientName}*`;
        const fileName = `relatorio-${slug(clientName)}-${dateKey}.pdf`;
        // Sem grupo do cliente, NÃO cai no grupo interno: mandar o relatório de um cliente pro
        // canal errado é pior que não mandar. Vira erro nomeado no resultado.
        const destinoJid = paraCliente ? (c.whatsapp_group_jid as string | null) : settings.groupJid;
        if (!destinoJid) { failed++; errors.push(`${clientName}: sem grupo de WhatsApp cadastrado`); continue; }
        const res = await sendMediaDocument(destinoJid, pdf.buffer.toString("base64"), fileName, caption);
        if (res.ok) { sent++; await supabaseAdmin.from("weekly_report_log").insert({ week_key: clientKey, status: "sent", message: clientName }).then(() => {}, () => {}); } else { failed++; errors.push(`${clientName}: envio ${res.error}`); }
      } catch (e) {
        failed++; errors.push(`${clientName}: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (i < clients.length - 1) await sleep(2000);
    }

    const status = sent > 0 ? "sent" : "failed";
    if (!onlyClientId) {
      await supabaseAdmin.from("weekly_report_log").insert({
        week_key: dateKey, status,
        message: `enviados ${sent}/${clients.length}`,
        error: errors.length > 0 ? errors.slice(0, 10).join(" | ") : null,
      });
    }
    if (sent === 0) {
      await notifyAdminFailure("Relatório semanal falhou", `0/${clients.length} enviados.\n${errors.join("\n")}`);
    }

    // Falha PARCIAL avisa no grupo interno. Antes só o e-mail de "0 enviados" existia: quando
    // CIIL e Dumar ficaram de fora em 20/07 (35 de 37 enviados), ninguém ficou sabendo.
    if (failed > 0 && !onlyClientId) {
      const jid = process.env.CS_INTERNAL_GROUP_JID;
      if (jid) {
        const lista = errors.slice(0, 8).map((e) => `• ${e}`).join("\n");
        await csSendGroupText(jid,
          `⚠️ *Relatório ${escopoLabel} não saiu pra ${failed} de ${clients.length} clientes* — ${dateKey}\n\n${lista}` +
          (errors.length > 8 ? `\n• …e mais ${errors.length - 8}` : "") +
          `\n\n_Vale conferir antes que o cliente sinta falta._`);
      }
    }

    return NextResponse.json({ ok: sent > 0, status, total: clients.length, sent, failed, errors: errors.slice(0, 10) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[weekly-reports] erro:", msg);
    await notifyAdminFailure("Relatório semanal — exceção", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
