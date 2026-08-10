// app/api/system/client-messages/route.ts
//
// Mensagens nos GRUPOS DOS CLIENTES (seg/qua/sex 08:00 BRT):
//   ?kind=monday → PDF de 7 dias com mensagem personalizada na legenda (sem suporte separado)
//   ?kind=wed    → mensagem de suporte de quarta (meio de semana)
//   ?kind=fri    → mensagem de suporte de sexta (fechamento da semana)
// Crontab (08:00 BRT = 11:00 UTC), via scripts/client-messages.sh:
//   0 11 * * 1 client-messages.sh monday
//   0 11 * * 3 client-messages.sh wed
//   0 11 * * 5 client-messages.sh fri
//
// Segurança: só envia para clientes COM whatsapp_group_jid confirmado; pula e
// reporta os sem grupo. Trava global traffic_client_msgs_enabled (default false).
//   ?dryRun=1   → lista quem receberia / quem está sem grupo (não envia)
//   ?clientId=X → testa 1 cliente (ignora a trava global, p/ validar 1 grupo)
//   ?force=1    → ignora a idempotência do dia

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/emailService";
import { requireCron } from "@/lib/api/cron-guard";
import { getMetaToken } from "@/lib/traffic/sync-core";
import {
  buildClientPdf, selectActiveClientsWithGroup, slug, clientDisplayName,
  type ReportClientRow,
} from "@/lib/traffic/weekly-report";
import { mondayReportMessage, mondaySocialMessage, RESEND_REPORT_MESSAGE, supportMessageFor, socialMessageFor, type ClientMsgKind } from "@/lib/traffic/support-message";
import { conferirEAvisar } from "@/lib/cs/entregas";
import { csSendGroupText } from "@/lib/cs/notify";
import { montarMensagemCliente } from "@/lib/cs/mensagem-cliente";
import { sendGroupText, sendMediaDocument } from "@/lib/whatsapp/evolution";

const ADMIN_EMAIL = "lonemidiamkt@gmail.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function todayKeyBRT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * O SUPORTE passa a sair pelo LONINHO (número do agente), não pelo do gestor.
 *
 * Decisão do Roberto (27/07): o suporte é conversa, e conversa é do agente — ele sabe o que está
 * acontecendo com o cliente (arte esperando aprovação, post que foi bem, promoção sem resposta) e
 * LÊ o grupo, então entende a resposta. O número do gestor dispara e não escuta.
 * O perfil do agente no WhatsApp já se chama "Lone Mídia": o cliente vê a agência, não um robô.
 *
 * O RELATÓRIO de segunda continua no número do gestor de propósito: é entrega de tom pessoal e
 * mantém redundância — hoje mesmo o número do gestor caiu e o agente seguiu trabalhando. Um número
 * só pra tudo faria uma queda silenciar a comunicação inteira com o cliente.
 *
 * Se o agente não estiver no grupo (faltam 2: Hentzy e Horto Naenc), CAI PRO GESTOR em vez de
 * deixar o cliente sem mensagem.
 */
async function enviarSuporte(jid: string, texto: string, clientId: string): Promise<{ ok: boolean; error?: string }> {
  const r = await csSendGroupText(jid, texto, undefined, { origem: "suporte", destino: "cliente", clientId });
  if (r.ok) return r;
  const viaGestor = await sendGroupText(jid, texto, "suporte-fallback-gestor");
  return viaGestor.ok
    ? viaGestor
    : { ok: false, error: `agente: ${r.error} | gestor: ${viaGestor.error}` };
}

/**
 * Mensagem de qua/sex escrita a partir dos sinais do cliente, em três estágios:
 *   "off"     → texto de sempre (default)
 *   "revisao" → o agente escreve, mas quem lê é o TIME (grupo interno). O cliente segue no neutro.
 *   "on"      → vai pro cliente
 * Erro de leitura cai em "off": nunca o contrário.
 */
type ModoIa = "off" | "revisao" | "on";
async function modoMensagemIa(): Promise<ModoIa> {
  try {
    const { data } = await supabaseAdmin
      .from("agency_settings").select("value").eq("key", "cs_msg_ia_enabled").maybeSingle();
    const v = (data?.value ?? "off").trim().toLowerCase();
    if (v === "true" || v === "on") return "on";
    if (v === "revisao" || v === "review") return "revisao";
    return "off";
  } catch { return "off"; }
}

async function clientMsgsEnabled(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("agency_settings").select("value").eq("key", "traffic_client_msgs_enabled").maybeSingle();
  return (data?.value ?? "false") === "true";
}

async function notifyAdminFailure(subject: string, detail: string) {
  try {
    await sendEmail({
      to: ADMIN_EMAIL, subject: `[Lone OS] ${subject}`,
      html: `<p>${subject}</p><pre>${detail.replace(/[<>]/g, "")}</pre>`,
      templateName: "client_messages_alert",
    });
  } catch (e) { console.error("[client-messages] fallback e-mail falhou:", e); }
}

/** Já foi enviada (sent) essa mensagem hoje p/ esse cliente? (idempotência) */
async function alreadySent(clientId: string, dateKey: string, kind: "report" | "support"): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("client_group_message_log")
    .select("id").eq("client_id", clientId).eq("date_key", dateKey).eq("kind", kind).eq("status", "sent").limit(1);
  return !!(data && data.length > 0);
}

/**
 * O TEXTO de suporte já foi enviado hoje p/ ESTE GRUPO? Idempotência por grupo
 * (não por cliente): clientes diferentes que compartilham o mesmo grupo (ex.: Bazar
 * Ribeiro Maricá + Saquarema) não devem duplicar o mesmo texto no grupo. Como o log
 * é por cliente, checamos todos os clientes mapeados ao grupo. (O relatório de segunda
 * segue por cliente — cada loja tem o seu PDF — então não passa por aqui.)
 */
async function groupTextAlreadySent(clientIdsInGroup: string[], dateKey: string): Promise<boolean> {
  if (clientIdsInGroup.length === 0) return false;
  const { data } = await supabaseAdmin
    .from("client_group_message_log")
    .select("id").in("client_id", clientIdsInGroup).eq("date_key", dateKey).eq("kind", "support").eq("status", "sent").limit(1);
  return !!(data && data.length > 0);
}

async function logMsg(clientId: string, dateKey: string, kind: "report" | "support", status: string, error?: string | null) {
  await supabaseAdmin.from("client_group_message_log").insert({ client_id: clientId, date_key: dateKey, kind, status, error: error ?? null });
}

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const kp = url.searchParams.get("kind");
  const kind: ClientMsgKind = kp === "wed" ? "wed" : kp === "fri" ? "fri" : "monday";
  const withReport = kind === "monday";
  const dryRun = url.searchParams.get("dryRun") === "1";
  const force = url.searchParams.get("force") === "1";
  const onlyClientId = url.searchParams.get("clientId");
  // resend=1: usa a legenda de "relatório corrigido" (reenvio pós-erro da Meta).
  const resend = url.searchParams.get("resend") === "1";
  const dateKey = todayKeyBRT();

  // UMA RODADA POR DIA. Dois crons de segunda disparavam junto e os dois mandavam o relatório —
  // 161 envios pra 40 grupos, e o dobro de chamadas na Meta (que estoura a cota e derruba a
  // rodada seguinte). `force=1` continua passando por cima, pra reenvio manual.
  const { reservarRodada, fecharRodada } = await import("@/lib/system/trava-rodada");
  const chaveTrava = `client-messages:${kind}`;
  if (!dryRun && !force) {
    const reserva = await reservarRodada(chaveTrava, dateKey);
    if (!reserva.conseguiu) {
      return NextResponse.json({ ok: true, status: "skip", motivo: reserva.motivo, kind, dateKey });
    }
  }

  try {
    // Trava global (a menos que seja teste de 1 cliente)
    if (!onlyClientId && !dryRun && !(await clientMsgsEnabled())) {
      return NextResponse.json({ ok: true, status: "disabled", message: "traffic_client_msgs_enabled=false" });
    }

    // Todos os clientes ativos com grupo. Na SEGUNDA: quem tem conta Meta recebe o
    // RELATÓRIO; quem é só-social (sem Meta) recebe a mensagem de início de semana.
    // Quarta/sexta: mensagem de suporte do dia pra todos.
    const clients = await selectActiveClientsWithGroup(onlyClientId);
    const withGroup = clients.filter((c) => c.whatsapp_group_jid);
    const withoutGroup = clients.filter((c) => !c.whatsapp_group_jid).map(clientDisplayName);

    // Mapa grupo→clientes: usado pra dedup do TEXTO por grupo (clientes que
    // compartilham o mesmo grupo, ex.: Bazar Maricá + Saquarema, não duplicam).
    const jidToClientIds = new Map<string, string[]>();
    for (const c of withGroup) {
      const arr = jidToClientIds.get(c.whatsapp_group_jid!) ?? [];
      arr.push(c.id);
      jidToClientIds.set(c.whatsapp_group_jid!, arr);
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true, status: "dry_run", kind,
        withGroup: withGroup.map((c) => clientDisplayName(c)),
        withoutGroup,
        counts: { eligible: withGroup.length, semGrupo: withoutGroup.length },
      });
    }

    if (withGroup.length === 0) {
      if (!dryRun && !force) await fecharRodada(chaveTrava, dateKey, true, "nenhum cliente com grupo");
      return NextResponse.json({ ok: true, status: "skipped", message: "Nenhum cliente com grupo confirmado", withoutGroup });
    }

    // Token Meta só é necessário pros relatórios (segunda, clientes com Meta).
    // Sem token, os relatórios falham por cliente — os social-puro seguem normal.
    const token = withReport ? await getMetaToken() : null;

    // Mensagens escritas pela IA aguardando a leitura do Roberto (modo revisão).
    const revisar: { cliente: string; texto: string; sinais: string[] }[] = [];

    let supportSent = 0, supportFail = 0, reportSent = 0, reportFail = 0;
    const errors: string[] = [];

    for (let i = 0; i < withGroup.length; i++) {
      const c: ReportClientRow = withGroup[i];
      const name = clientDisplayName(c);
      const jid = c.whatsapp_group_jid!;

      if (withReport && c.meta_ad_account_id) {
        // Segunda, cliente de tráfego: PDF de 7 dias com a mensagem como legenda.
        if (force || !(await alreadySent(c.id, dateKey, "report"))) {
          if (!token) {
            reportFail++; errors.push(`${name} (relatório): token Meta ausente`); await logMsg(c.id, dateKey, "report", "failed", "token ausente");
          } else {
            const pdf = await buildClientPdf(token, c);
            if (!pdf.ok || !pdf.buffer) {
              reportFail++; errors.push(`${name} (relatório): ${pdf.error}`); await logMsg(c.id, dateKey, "report", "failed", pdf.error);
            } else {
              const fileName = `relatorio-${slug(name)}-${dateKey}.pdf`;
              const res = await sendMediaDocument(jid, pdf.buffer.toString("base64"), fileName, resend ? RESEND_REPORT_MESSAGE : mondayReportMessage());
              if (res.ok) { reportSent++; await logMsg(c.id, dateKey, "report", "sent"); }
              else { reportFail++; errors.push(`${name} (relatório): ${res.error}`); await logMsg(c.id, dateKey, "report", "failed", res.error); }
            }
          }
        }
      } else if (withReport) {
        // Segunda, cliente SÓ-SOCIAL (sem Meta): mensagem de início de semana.
        const groupClientIds = jidToClientIds.get(jid) ?? [c.id];
        if (force || !(await groupTextAlreadySent(groupClientIds, dateKey))) {
          const res = await enviarSuporte(jid, mondaySocialMessage(), c.id);
          if (res.ok) { supportSent++; await logMsg(c.id, dateKey, "support", "sent"); }
          else { supportFail++; errors.push(`${name} (início de semana): ${res.error}`); await logMsg(c.id, dateKey, "support", "failed", res.error); }
        } else { await logMsg(c.id, dateKey, "support", "skipped", "grupo já recebeu o texto hoje (cliente compartilha grupo)"); }
      } else {
        // Quarta/Sexta: texto do dia. Cliente com Meta → mensagem de tráfego;
        // só-social → mensagem social (foco em arte). Dedup por grupo evita o
        // texto duplicado quando dois clientes compartilham o mesmo grupo.
        const neutro = c.meta_ad_account_id ? supportMessageFor(kind) : socialMessageFor(kind);
        // TRÊS ESTÁGIOS, nesta ordem — a mensagem só chega ao cliente depois de o Roberto ler:
        //   desligado  → texto de sempre (o sorteio de 5 frases)
        //   "revisao"  → o agente ESCREVE a contextual e manda pro GRUPO INTERNO; o cliente
        //                continua recebendo o texto neutro. É o passo de leitura.
        //   "true"     → a contextual vai pro cliente
        const modo = await modoMensagemIa();
        let text = neutro;
        if (modo !== "off") {
          const m = await montarMensagemCliente(c.id, neutro, kind === "fri" ? "sexta" : "quarta");
          if (modo === "on") text = m.texto;
          else if (m.origem === "ia") revisar.push({ cliente: name, texto: m.texto, sinais: m.sinaisUsados });
        }
        const groupClientIds = jidToClientIds.get(jid) ?? [c.id];
        if (force || !(await groupTextAlreadySent(groupClientIds, dateKey))) {
          const res = await enviarSuporte(jid, text, c.id);
          if (res.ok) { supportSent++; await logMsg(c.id, dateKey, "support", "sent"); }
          else { supportFail++; errors.push(`${name} (suporte): ${res.error}`); await logMsg(c.id, dateKey, "support", "failed", res.error); }
        } else { await logMsg(c.id, dateKey, "support", "skipped", "grupo já recebeu o texto hoje (cliente compartilha grupo)"); }
      }

      if (i < withGroup.length - 1) await sleep(2500);
    }

    const totalSent = supportSent + reportSent;
    if (totalSent === 0 && !onlyClientId) {
      await notifyAdminFailure(`Mensagens aos clientes (${kind}) falharam`, errors.join("\n") || "0 enviadas");
    }

    // MODO REVISÃO: o time lê no grupo interno o que o agente escreveria pra cada cliente.
    // Sai depois do envio real pra não atrasar a entrega — e num bloco só, não uma por cliente.
    if (revisar.length) {
      const jidInterno = process.env.CS_INTERNAL_GROUP_JID;
      if (jidInterno) {
        const l = [
          `📝 *Revisão — mensagem do agente ao cliente* (${kind === "fri" ? "sexta" : "quarta"})`,
          `_Isto NÃO foi enviado. O cliente recebeu o texto de sempre._`,
          "",
        ];
        for (const r of revisar.slice(0, 6)) {
          l.push(`*${r.cliente}*`, r.texto, "");
        }
        if (revisar.length > 6) l.push(`_…e mais ${revisar.length - 6} no painel._`, "");
        l.push("Se estiver bom, me avisa que eu libero pro cliente.");
        await csSendGroupText(jidInterno, l.join("\n"), undefined, { origem: "revisao-mensagem", destino: "interno" });
      }
    }

    // Confere o que REALMENTE chegou e avisa no grupo interno. O e-mail acima só dispara quando
    // NADA sai — falha parcial (CIIL e Dumar em 20/07) passava batido, e ninguém lê e-mail.
    let conferencia = null;
    if (!onlyClientId) {
      const elegiveis = withGroup.map((c) => ({ id: c.id, nome: clientDisplayName(c) }));
      // Na segunda saem os dois tipos: relatório pra quem tem tráfego, texto pro resto.
      const comRelatorio = withReport ? withGroup.filter((c) => c.meta_ad_account_id) : [];
      const [confSup, confRel] = await Promise.all([
        conferirEAvisar("support", dateKey, elegiveis.filter((e) => !comRelatorio.some((c) => c.id === e.id))),
        comRelatorio.length
          ? conferirEAvisar("report", dateKey, comRelatorio.map((c) => ({ id: c.id, nome: clientDisplayName(c) })))
          : Promise.resolve(null),
      ]);
      conferencia = { support: confSup, report: confRel };
    }

    if (!dryRun && !force) {
      await fecharRodada(chaveTrava, dateKey, totalSent > 0,
        `suporte ${supportSent}/${supportSent + supportFail} · relatório ${reportSent}/${reportSent + reportFail}`);
    }

    return NextResponse.json({
      ok: totalSent > 0, status: totalSent > 0 ? "sent" : "failed", kind,
      support: { sent: supportSent, failed: supportFail },
      report: { sent: reportSent, failed: reportFail },
      semGrupo: withoutGroup,
      conferencia,
      errors: errors.slice(0, 15),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[client-messages] erro:", msg);
    // Fecha a reserva mesmo com exceção — senão a rotina fica trancada até o destrave de 90 min.
    if (!dryRun && !force) await fecharRodada(chaveTrava, dateKey, false, msg);
    await notifyAdminFailure("Mensagens aos clientes — exceção", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
