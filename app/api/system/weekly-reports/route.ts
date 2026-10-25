// app/api/system/weekly-reports/route.ts
//
// Relatório do cliente em PDF (lib/traffic/weekly-report.ts → lib/reports/relatorioCliente*.ts),
// renderizado server-side via browserless. É por aqui que sai o MENSAL (scripts/relatorio-mensal.sh,
// dia 1º, com ?since=&until=&destino=cliente); o semanal de segunda sai por client-messages?kind=monday,
// com o mesmo PDF.
//
//   POST                      → gera o PDF de cada cliente ativo-com-Meta e envia ao grupo.
//   POST ?dryRun=1            → apenas lista/conta os clientes elegíveis (não gera/envia).
//   POST ?clientId=<id>       → gera SÓ esse cliente e envia MESMO que ele já tenha recebido hoje (é o
//                               reenvio de propósito). Com dryRun, salva no Storage e devolve a URL (preview).
//   Rodar de novo (sem clientId) manda SÓ pra quem ficou de fora: quem já recebeu — ou pode ter
//   recebido (envio incerto) — é pulado. `?force=1` NÃO desliga mais isso (21/10/2026): ele fazia
//   todo mundo receber de novo. Pra reenviar a um cliente, use ?clientId=.
//
// PRÉVIA SEM ENVIAR (GET ou POST, exige o CRON_SECRET). Não envia, não grava log, não sobe no Storage:
//   ?baixar=1&cliente=<id>    → devolve o PDF (application/pdf).
//   ?dry=1&cliente=<id>       → devolve o HTML do relatório (abre no navegador).
//   + nada                    → semanal: os 7 dias que terminam ontem (o mesmo da segunda).
//   + &since=AAAA-MM-DD&until=AAAA-MM-DD → mensal/intervalo exato (ex.: 2026-08-01 a 2026-08-31).
//   + &period=month           → últimos 30 dias.
//   Ex.: curl -H "Authorization: Bearer $CRON_SECRET" \
//          "https://painel.lonemidia.com/api/system/weekly-reports?baixar=1&cliente=<id>" -o relatorio.pdf

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
import { bloqueiaReenvio, erroParaLog, textoEnviosIncertos } from "@/lib/whatsapp/desfecho-envio";
import {
  buildClientPdf, selectActiveMetaClients, periodLabelDays, slug,
  montarHtmlRelatorioCliente, selectReportClient, clientDisplayName, selectActiveClientsWithGroup,
  type ReportClientRow,
} from "@/lib/traffic/weekly-report";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { lerRelatorioAnuncios } from "@/lib/reports/relatorioClienteDados";
import { janelaDosUltimosDias } from "@/lib/reports/relatorioCliente";
import { hojeSP } from "@/lib/clients/pausa";
import { podeFalarDeAnuncio } from "@/lib/clients/servico";
import { montarPlacar, segmentoDeVoz } from "@/lib/traffic/placar-semanal";

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

// ── Prévia (não envia nada) ─────────────────────────────────

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

async function previa(url: URL): Promise<NextResponse> {
  const baixar = url.searchParams.get("baixar") === "1";
  const cliente = url.searchParams.get("cliente") || url.searchParams.get("clientId") || "";
  if (!cliente) {
    return NextResponse.json({ error: "Prévia precisa de ?cliente=<id>. Use ?baixar=1 (PDF) ou ?dry=1 (HTML); opcional &since=&until= (AAAA-MM-DD) ou &period=month." }, { status: 400 });
  }
  const since = url.searchParams.get("since") || "";
  const until = url.searchParams.get("until") || "";
  const intervalo = ISO_DIA.test(since) && ISO_DIA.test(until) && since <= until;
  if ((since || until) && !intervalo) {
    return NextResponse.json({ error: "since/until precisam ser YYYY-MM-DD com since <= until." }, { status: 400 });
  }
  const periodDays = url.searchParams.get("period") === "month" ? 30 : 7;

  const c = await selectReportClient(cliente);
  if (!c) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  const token = await getMetaToken();
  if (!token) return NextResponse.json({ ok: false, error: "Token Meta ausente/expirado" }, { status: 503 });

  const h = await montarHtmlRelatorioCliente(token, c, periodDays, intervalo ? since : undefined, intervalo ? until : undefined);
  if (!h.ok || !h.html) {
    return NextResponse.json({ ok: false, client: clientDisplayName(c), error: h.error }, { status: 422 });
  }
  if (!baixar) {
    return new NextResponse(h.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const pdf = await htmlToPdf(h.html);
  if (!pdf.ok || !pdf.buffer) {
    return NextResponse.json({ ok: false, client: clientDisplayName(c), error: `PDF: ${pdf.error ?? "falhou"}` }, { status: 502 });
  }
  const nome = `relatorio-${slug(clientDisplayName(c))}-${intervalo ? `${since}_${until}` : todayKeyBRT()}.pdf`;
  return new NextResponse(new Uint8Array(pdf.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}

// ── Prévia do PLACAR da segunda (24/10/2026) — não envia, não grava ───────────────────────
//   ?placar=1&cliente=<id>   → o texto que iria na legenda desse cliente
//   ?placar=1&todos=1        → o de todos que recebem relatório na segunda (contrato de tráfego + conta + grupo)
//   &hoje=AAAA-MM-DD         → simula o dia do envio (a dica gira por semana)
//   &dados=1                 → junto, os números que montaram cada texto
// Os números são os do PDF: mesma leitura (lerRelatorioAnuncios) e mesma janela de 7 dias até ontem.
async function previaPlacar(url: URL): Promise<NextResponse> {
  const token = await getMetaToken();
  if (!token) return NextResponse.json({ ok: false, error: "Token Meta ausente/expirado" }, { status: 503 });
  const hoje = ISO_DIA.test(url.searchParams.get("hoje") ?? "") ? url.searchParams.get("hoje")! : hojeSP();
  const cliente = url.searchParams.get("cliente") || url.searchParams.get("clientId") || "";
  let alvos: ReportClientRow[];
  if (cliente) {
    const c = await selectReportClient(cliente);
    if (!c) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    alvos = [c];
  } else if (url.searchParams.get("todos") === "1") {
    alvos = (await selectActiveClientsWithGroup()).filter((c) => c.whatsapp_group_jid && c.meta_ad_account_id && podeFalarDeAnuncio(c));
  } else {
    return NextResponse.json({ error: "Use ?placar=1&cliente=<id> ou ?placar=1&todos=1." }, { status: 400 });
  }
  const janela = janelaDosUltimosDias(7, hoje);
  const conta = (id: string) => (id.startsWith("act_") ? id : `act_${id}`);
  const saida: Record<string, unknown>[] = [];
  for (let i = 0; i < alvos.length; i += 3) {
    const lote = await Promise.all(alvos.slice(i, i + 3).map(async (c) => {
      const nome = clientDisplayName(c);
      const segmento = segmentoDeVoz({ nome, nicho: c.nicho, cnae_principal: c.cnae_principal });
      if (!c.meta_ad_account_id || !podeFalarDeAnuncio(c)) return { cliente: nome, segmento, texto: null, motivo: "sem contrato de tráfego ou sem conta" };
      try {
        const r = await lerRelatorioAnuncios(token, conta(c.meta_ad_account_id), janela, nome);
        if (!r) return { cliente: nome, segmento, texto: null, motivo: "a conta não veiculou nesta semana nem na anterior" };
        const p = montarPlacar({ relatorio: r, clienteId: c.id, segmento, hoje });
        // &dados=1: os números que montaram o texto, para ajustar a redação sem novo deploy.
        const dados = url.searchParams.get("dados") === "1" ? {
          clienteId: c.id, tipo: r.tipo, total: r.total, kpis: r.kpis, janela: r.janela, semVeiculacao: r.semVeiculacao,
          criativosIndisponiveis: r.criativosIndisponiveis,
          criativos: r.criativos.map(({ miniatura: _m, ...resto }) => resto),
        } : undefined;
        return { cliente: nome, segmento, texto: p.texto, alerta: p.alerta, motivo: p.motivo, dica: p.dica, dados };
      } catch (e) {
        return { cliente: nome, segmento, texto: null, motivo: `Meta: ${(e instanceof Error ? e.message : String(e)).slice(0, 160)}` };
      }
    }));
    saida.push(...lote);
  }
  return NextResponse.json({ ok: true, hoje, janela: `${janela.inicio} a ${janela.fim}`, total: saida.length, placares: saida });
}

const ehPrevia = (url: URL) => url.searchParams.get("baixar") === "1" || url.searchParams.get("dry") === "1" || url.searchParams.get("placar") === "1";

/** GET só existe pra prévia: nunca envia. */
export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const url = new URL(req.url);
  if (!ehPrevia(url)) {
    return NextResponse.json({ error: "GET só faz prévia: ?baixar=1&cliente=<id> (PDF) ou ?dry=1&cliente=<id> (HTML)." }, { status: 400 });
  }
  try {
    return url.searchParams.get("placar") === "1" ? await previaPlacar(url) : await previa(url);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// ── POST ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const url = new URL(req.url);
  // Prévia pedida por POST: responde aqui e sai — antes de qualquer seleção, trava ou envio.
  if (ehPrevia(url)) {
    try {
      return url.searchParams.get("placar") === "1" ? await previaPlacar(url) : await previa(url);
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }
  const dryRun = url.searchParams.get("dryRun") === "1";
  // `force` não pula mais o dedup por cliente (21/10/2026) — só é lido pra avisar quem ainda manda.
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
  // E por DESTINO (21/10/2026): o digest interno rodado antes marcava o cliente como "já recebeu"
  // e a rodada pro cliente pulava todo mundo.
  const escopoChave = intervalo ? `-${since}_${until}` : periodDays === 30 ? "-mensal" : "";
  const destinoChave = paraCliente ? "" : "-interno";
  const dateKey = todayKeyBRT() + escopoChave + destinoChave;
  const rotinaTrava = `weekly-reports${escopoChave || "-semanal"}${destinoChave}`;
  let reservou = false;
  const { reservarRodada, fecharRodada } = await import("@/lib/system/trava-rodada");

  try {
    const settings = await getAlertSettings();
    const token = await getMetaToken();
    if (!token) {
      return NextResponse.json({ ok: false, status: "failed", error: "Token Meta ausente/expirado" }, { status: 200 });
    }

    // Clientes ativos com Meta vinculada
    // SEMANAL É SÓ PRA QUEM TEM TRÁFEGO. Cliente de `assessoria_social` tem relatório MENSAL no
    // contrato, não semanal — o CIIL vinha recebendo toda segunda por ter Instagram vinculado.
    // No mensal (periodDays 30) e no intervalo fechado, o social entra normalmente.
    const semanal = !intervalo && periodDays <= 7;
    const clients = await selectActiveMetaClients(onlyClientId, semanal);

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

    // SEM "JÁ ENVIEI HOJE" GLOBAL (21/10/2026). A linha "sent" do dia fazia a segunda rodada sair
    // "skipped" com ok:true — e o aviso interno mandava justamente "rodar de novo" pra quem ficou de
    // fora. Ninguém recebia. Quem decide agora é o dedup POR CLIENTE, logo abaixo.
    //
    // A trava só impede DUAS RODADAS AO MESMO TEMPO (as duas leriam "ainda não recebeu" juntas);
    // terminada uma, a próxima pode rodar. O reenvio de 1 cliente (?clientId=) não trava.
    if (!onlyClientId) {
      const reserva = await reservarRodada(rotinaTrava, todayKeyBRT(), { permitirNovaRodada: true });
      if (!reserva.conseguiu) {
        return NextResponse.json({ ok: true, status: "skip", motivo: reserva.motivo });
      }
      reservou = true;
    }

    const period = periodLabelDays(periodDays);
    let sent = 0, failed = 0, jaTinham = 0;
    const errors: string[] = [];
    // Pode ter chegado (o WhatsApp não confirmou a tempo): não repete, avisa o time.
    const incertos: { cliente: string; erro?: string }[] = [];
    // Recebeu, mas o registro não gravou: a próxima rodada mandaria de novo. O time precisa saber.
    const semRegistro: string[] = [];
    // Quem falhou por erro PASSAGEIRO (a Meta demorou, caiu, recusou rajada) ganha uma segunda
    // tentativa no fim da rodada. Em 01/10 o relatório de setembro da Armazém do Ferro não saiu por
    // um timeout da Meta e ficou de fora — o aviso pedia pra "conferir", ninguém reenviou.
    const passageiro = (msg: string) => /timeout|aborted|ECONNRESET|ETIMEDOUT|socket hang up|fetch failed|\b5\d\d\b|rate limit|too many/i.test(msg);
    const paraTentarDeNovo: { c: (typeof clients)[number]; erro: string }[] = [];
    let tentativa = 1;

    const rodar = async (lista: (typeof clients)[number][]) => {
    for (let i = 0; i < lista.length; i++) {
      const c = lista[i];
      const clientName = c.nome_fantasia || c.name;
      const clientKey = `${dateKey}:${c.id}`;
      // Dedup POR CLIENTE (nao so por execucao): num retry, quem JA recebeu nao recebe o PDF de novo.
      // Vale também com force=1 (21/10/2026) e conta o envio INCERTO como recebido. Só o
      // ?clientId= explícito passa por cima — é o reenvio de propósito, pra um cliente só.
      if (!onlyClientId) {
        const { data: linhas, error: eLe } = await supabaseAdmin.from("weekly_report_log")
          .select("status, error").eq("week_key", clientKey).in("status", ["sent", "failed"]);
        if (eLe) {
          // Sem saber se já recebeu, não manda: duplicar pro cliente é pior que esperar a próxima rodada.
          failed++; errors.push(`${clientName}: não consegui conferir se já tinha recebido (${eLe.message}) — não enviei`);
          continue;
        }
        if ((linhas ?? []).some((l) => bloqueiaReenvio(l as { status: string; error: string | null }))) { jaTinham++; continue; }
      }
      try {
        const pdf = await buildClientPdf(token, c, periodDays, dateFrom, dateTo);
        if (!pdf.ok || !pdf.buffer) {
          const erro = `${clientName}: ${pdf.error}`;
          if (tentativa === 1 && passageiro(String(pdf.error))) { paraTentarDeNovo.push({ c, erro }); continue; }
          failed++; errors.push(erro); continue;
        }

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
        if (res.ok || res.incerto) {
          // O registro é o que impede o reenvio — o erro dele não pode sumir (antes: .then(() => {}, () => {})).
          if (res.ok) sent++; else incertos.push({ cliente: clientName, erro: res.error });
          const { error: eLog } = await supabaseAdmin.from("weekly_report_log").insert(res.ok
            ? { week_key: clientKey, status: "sent", message: clientName }
            : { week_key: clientKey, status: "failed", message: clientName, error: erroParaLog(res) });
          if (eLog) {
            console.error(`[weekly-reports] ${clientName}: envio sem registro:`, eLog.message);
            semRegistro.push(clientName);
          }
        } else { failed++; errors.push(`${clientName}: envio ${res.error}`); }
      } catch (e) {
        const erro = `${clientName}: ${e instanceof Error ? e.message : String(e)}`;
        if (tentativa === 1 && passageiro(erro)) { paraTentarDeNovo.push({ c, erro }); continue; }
        failed++; errors.push(erro);
      }
      if (i < lista.length - 1) await sleep(2000);
    }
    };

    await rodar(clients);
    if (paraTentarDeNovo.length) {
      console.log(`[weekly-reports] ${paraTentarDeNovo.length} falha(s) passageira(s) — nova tentativa em 60 s: ${paraTentarDeNovo.map((x) => x.erro).join(" | ")}`);
      await sleep(60_000);
      tentativa = 2;
      await rodar(paraTentarDeNovo.map((x) => x.c));
    }

    // Rodada que só achou gente que já tinha recebido não é falha: é o reenvio funcionando.
    const status = sent > 0 ? "sent" : (failed > 0 || incertos.length > 0) ? "failed" : "skipped";
    if (!onlyClientId) {
      // Linha-resumo da rodada: é histórico (ninguém mais decide por ela), mas o erro dela aparece.
      const { error: eResumo } = await supabaseAdmin.from("weekly_report_log").insert({
        week_key: dateKey, status,
        message: `enviados ${sent}/${clients.length}${jaTinham ? ` · ${jaTinham} já tinham recebido` : ""}${incertos.length ? ` · ${incertos.length} incerto(s)` : ""}`,
        error: errors.length > 0 ? errors.slice(0, 10).join(" | ") : null,
      });
      if (eResumo) console.error("[weekly-reports] não gravou o resumo da rodada:", eResumo.message);
    }
    if (sent === 0 && (failed > 0 || incertos.length > 0)) {
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
          // Falha passageira já foi tentada de novo; o que chega aqui precisa de gente.
          `\n\n_${paraTentarDeNovo.length ? "Já tentei de novo depois de 1 minuto e não foi. " : ""}Pra reenviar só pra quem ficou de fora, é rodar de novo: quem já recebeu não recebe duas vezes._`);
      }
    }

    // Os incertos e os sem registro NÃO entram no "rodar de novo": num caso a rodada pula (pode ter
    // chegado), no outro mandaria em dobro. Os dois pedem gente olhando o grupo.
    if (!onlyClientId && (incertos.length || semRegistro.length)) {
      const jid = process.env.CS_INTERNAL_GROUP_JID;
      if (jid) {
        const partes: string[] = [];
        if (incertos.length) {
          partes.push(textoEnviosIncertos(`o relatório ${escopoLabel}`, incertos,
            "peça o reenvio só para ele (weekly-reports com ?clientId=)"));
        }
        if (semRegistro.length) {
          partes.push(`⚠️ *Relatório saiu, mas não consegui registrar* — ${semRegistro.map((n) => `*${n}*`).join(", ")}.\n`
            + `_Se rodar de novo agora, ${semRegistro.length === 1 ? "ele recebe" : "eles recebem"} duas vezes. Confira o registro antes._`);
        }
        await csSendGroupText(jid, partes.join("\n\n"), undefined, { origem: "weekly-reports-incerto", destino: "interno" });
      }
    }

    if (reservou) {
      await fecharRodada(rotinaTrava, todayKeyBRT(), status !== "failed",
        `enviados ${sent} · falhas ${failed} · incertos ${incertos.length} · já tinham ${jaTinham}`);
    }

    return NextResponse.json({
      ok: sent > 0 || status === "skipped", status, total: clients.length, sent, failed,
      jaTinham, incertos, semRegistro, errors: errors.slice(0, 10),
      ...(force ? { aviso: "force=1 não reenvia mais a quem já recebeu. Para reenviar a um cliente, use ?clientId=." } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[weekly-reports] erro:", msg);
    // Fecha a reserva mesmo com exceção — senão a rotina fica trancada até o destrave de 90 min.
    if (reservou) await fecharRodada(rotinaTrava, todayKeyBRT(), false, msg);
    await notifyAdminFailure("Relatório semanal — exceção", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
