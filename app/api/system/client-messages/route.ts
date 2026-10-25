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
import { podeFalarDeAnuncio } from "@/lib/clients/servico";
import { conferirEAvisar } from "@/lib/cs/entregas";
import { csSendGroupText } from "@/lib/cs/notify";
import { montarMensagemCliente } from "@/lib/cs/mensagem-cliente";
import { sendGroupText, sendMediaDocument } from "@/lib/whatsapp/evolution";
import { bloqueiaReenvio, erroParaLog, podeTrocarDeNumero } from "@/lib/whatsapp/desfecho-envio";
import { montarPlacar, segmentoDeVoz } from "@/lib/traffic/placar-semanal";

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
 *
 * SÓ CAI PRO GESTOR QUANDO É CERTO QUE NÃO SAIU (21/10/2026). Timeout do agente não quer dizer que
 * a mensagem não chegou: mandar de novo pelo gestor punha o mesmo texto duas vezes no grupo. Envio
 * incerto volta como incerto e a conferência avisa o time.
 */
async function enviarSuporte(jid: string, texto: string, clientId: string): Promise<{ ok: boolean; error?: string; incerto?: boolean }> {
  const r = await csSendGroupText(jid, texto, undefined, { origem: "suporte", destino: "cliente", clientId });
  if (!podeTrocarDeNumero(r)) return r;
  const viaGestor = await sendGroupText(jid, texto, "suporte-fallback-gestor");
  return viaGestor.ok
    ? viaGestor
    : { ok: false, incerto: viaGestor.incerto, error: `agente: ${r.error} | gestor: ${viaGestor.error}` };
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

/**
 * PLACAR DA SEGUNDA (24/10/2026): a legenda do relatório vira o placar da semana no jeito de falar
 * do nicho (lib/traffic/placar-semanal.ts). Os mesmos três estágios da mensagem da IA:
 *   desligado → a legenda de sempre;  "revisao" → o cliente recebe a de sempre e o placar de cada um
 *   vai para o grupo do TRÁFEGO ler;  "on" → o placar vai para o cliente.
 * Chave: agency_settings.placar_semanal.
 */
async function modoPlacar(): Promise<ModoIa> {
  try {
    const { data } = await supabaseAdmin
      .from("agency_settings").select("value").eq("key", "placar_semanal").maybeSingle();
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

/** Já foi enviada essa mensagem hoje p/ esse cliente? (idempotência). Envio INCERTO conta como
 *  enviado: pode ter chegado, e reenviar às cegas é o que manda em dobro (21/10/2026). */
async function alreadySent(clientId: string, dateKey: string, kind: "report" | "support"): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("client_group_message_log")
    .select("status, error").eq("client_id", clientId).eq("date_key", dateKey).eq("kind", kind).in("status", ["sent", "failed"]);
  return (data ?? []).some((l) => bloqueiaReenvio(l as { status: string; error: string | null }));
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
    .select("status, error").in("client_id", clientIdsInGroup).eq("date_key", dateKey).eq("kind", "support").in("status", ["sent", "failed"]);
  return (data ?? []).some((l) => bloqueiaReenvio(l as { status: string; error: string | null }));
}

/** Grava o desfecho. Registro que falha fica no console — sem ele, a próxima rodada não sabe que
 *  este cliente já recebeu. */
async function logMsg(clientId: string, dateKey: string, kind: "report" | "support", status: string, error?: string | null) {
  const { error: e } = await supabaseAdmin.from("client_group_message_log").insert({ client_id: clientId, date_key: dateKey, kind, status, error: error ?? null });
  if (e) console.error(`[client-messages] não registrou ${kind}/${status} de ${clientId}:`, e.message);
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
    // Placar da segunda: o modo, o que ficou para o time ler (revisão) e o que o gestor precisa
    // explicar hoje (semana zerada, anúncio parado, queda forte — regra 4 do playbook).
    const placarModo = withReport && !resend ? await modoPlacar() : "off";
    const placarRevisar: { cliente: string; texto: string }[] = [];
    const placarAlertas: { cliente: string; motivo: string }[] = [];
    const hojeSP = todayKeyBRT();

    let supportSent = 0, supportFail = 0, reportSent = 0, reportFail = 0;
    const errors: string[] = [];

    for (let i = 0; i < withGroup.length; i++) {
      const c: ReportClientRow = withGroup[i];
      const name = clientDisplayName(c);
      const jid = c.whatsapp_group_jid!;

      // Relatório de mídia paga só para quem contratou mídia paga. A conta vinculada continua
      // sendo necessária (é de onde o número vem), mas não é mais o que AUTORIZA.
      if (withReport && podeFalarDeAnuncio(c) && c.meta_ad_account_id) {
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
              let legenda = resend ? RESEND_REPORT_MESSAGE : mondayReportMessage();
              if (placarModo !== "off" && pdf.anuncios) {
                const placar = montarPlacar({
                  relatorio: pdf.anuncios, clienteId: c.id, hoje: hojeSP,
                  segmento: segmentoDeVoz({ nome: name, nicho: c.nicho, cnae_principal: c.cnae_principal }),
                });
                if (placar.alerta && placar.motivo) placarAlertas.push({ cliente: name, motivo: placar.motivo });
                if (placar.texto) {
                  if (placarModo === "on") legenda = placar.texto;
                  else placarRevisar.push({ cliente: name, texto: placar.texto });
                }
              }
              const res = await sendMediaDocument(jid, pdf.buffer.toString("base64"), fileName, legenda);
              if (res.ok) { reportSent++; await logMsg(c.id, dateKey, "report", "sent"); }
              else { reportFail++; errors.push(`${name} (relatório): ${res.error}`); await logMsg(c.id, dateKey, "report", "failed", erroParaLog(res)); }
            }
          }
        }
      } else if (withReport) {
        // Segunda, cliente SÓ-SOCIAL (sem Meta): mensagem de início de semana.
        const groupClientIds = jidToClientIds.get(jid) ?? [c.id];
        if (force || !(await groupTextAlreadySent(groupClientIds, dateKey))) {
          const res = await enviarSuporte(jid, mondaySocialMessage(), c.id);
          if (res.ok) { supportSent++; await logMsg(c.id, dateKey, "support", "sent"); }
          else { supportFail++; errors.push(`${name} (início de semana): ${res.error}`); await logMsg(c.id, dateKey, "support", "failed", erroParaLog(res)); }
        } else { await logMsg(c.id, dateKey, "support", "skipped", "grupo já recebeu o texto hoje (cliente compartilha grupo)"); }
      } else {
        // Quarta/Sexta: texto do dia. Cliente com Meta → mensagem de tráfego;
        // só-social → mensagem social (foco em arte). Dedup por grupo evita o
        // texto duplicado quando dois clientes compartilham o mesmo grupo.
        // As últimas mensagens que ESTE grupo recebeu, para não repetir a frase. Sem isso o
        // sorteio podia devolver a mesma duas semanas seguidas — e é a repetição, mais que o
        // texto, que faz parecer robô.
        const { data: ultimas } = await supabaseAdmin.from("cs_outbound")
          .select("texto").eq("group_jid", c.whatsapp_group_jid as string)
          .eq("destino", "cliente").eq("enviado", true)
          .order("created_at", { ascending: false }).limit(6);
        const recentes = (ultimas ?? []).map((u) => (u.texto as string) || "");
        // O QUE FOI VENDIDO decide, não o que está vinculado. Antes era
        // `c.meta_ad_account_id ? trafego : social` — e o Dumar, que é assessoria_social e tem
        // conta de anúncio vinculada, recebeu "nosso lado anúncios" e "de olho nas campanhas"
        // no grupo dele. Ver lib/clients/servico.ts.
        const neutro = podeFalarDeAnuncio(c) ? supportMessageFor(kind, recentes) : socialMessageFor(kind, recentes);
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
          else { supportFail++; errors.push(`${name} (suporte): ${res.error}`); await logMsg(c.id, dateKey, "support", "failed", erroParaLog(res)); }
        } else { await logMsg(c.id, dateKey, "support", "skipped", "grupo já recebeu o texto hoje (cliente compartilha grupo)"); }
      }

      if (i < withGroup.length - 1) await sleep(2500);
    }

    const totalSent = supportSent + reportSent;
    if (totalSent === 0 && !onlyClientId) {
      await notifyAdminFailure(`Mensagens aos clientes (${kind}) falharam`, errors.join("\n") || "0 enviadas");
    }

    // CLIENTE SEM GRUPO NÃO PODE FALHAR EM SILÊNCIO (Roberto, 24/08: "Veneza Estofados não recebeu
    // o relatório"). A lista era calculada e nunca chegava a ninguém, porque a própria consulta já
    // descartava quem não tinha grupo — então o relatório dizia "40 enviados, 0 falhas" enquanto
    // 4 clientes com conta de anúncio ativa não recebiam nada. Agora o time fica sabendo.
    if (withoutGroup.length > 0 && !onlyClientId && !dryRun) {
      try {
        const jidInterno = process.env.CS_INTERNAL_GROUP_JID || "";
        if (jidInterno) {
          const { csSendGroupText } = await import("@/lib/cs/notify");
          await csSendGroupText(jidInterno, [
            `⚠️ *${withoutGroup.length} ${withoutGroup.length === 1 ? "cliente ficou" : "clientes ficaram"} sem a mensagem de hoje* — falta o grupo de WhatsApp no cadastro:`,
            withoutGroup.map((n) => `• ${n}`).join("\n"),
            "",
            "É só cadastrar o grupo em /clients que eles entram na próxima rodada.",
          ].join("\n"), undefined, { origem: "clientes-sem-grupo", destino: "interno" });
        }
      } catch (err) {
        console.error("[client-messages] falhou o aviso de sem-grupo:", String(err));
      }
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

    // PLACAR: o que o gestor precisa explicar hoje e, no modo revisão, os textos para o time ler.
    // Vai para o grupo do TRÁFEGO (é o gestor que manda a causa e o que já fez — regra 4).
    if (placarModo !== "off" && !onlyClientId && (placarAlertas.length || placarRevisar.length)) {
      const jidTrafego = process.env.CS_TRAFFIC_GROUP_JID || process.env.CS_INTERNAL_GROUP_JID;
      if (jidTrafego) {
        if (placarAlertas.length) {
          await csSendGroupText(jidTrafego, [
            `📉 *Placar de hoje — explicar ao cliente ainda hoje* (${placarAlertas.length})`,
            ...placarAlertas.map((a) => `• *${a.cliente}* — ${a.motivo}`),
            "",
            "_Esses foram com a legenda de sempre. Mandem no grupo deles o número, a causa e o que já foi feito._",
          ].join("\n"), undefined, { origem: "placar-alertas", destino: "interno" });
        }
        for (let k = 0; k < placarRevisar.length; k += 8) {
          const lote = placarRevisar.slice(k, k + 8);
          await csSendGroupText(jidTrafego, [
            `📝 *Placar da semana — revisão* ${k === 0 ? "" : `(continuação)`}`,
            "_Isto NÃO foi para o cliente: ele recebeu a legenda de sempre._",
            "",
            ...lote.flatMap((r) => [`*${r.cliente}*`, r.texto, ""]),
            k + 8 >= placarRevisar.length ? "Se estiver bom, é só avisar que eu ligo para os clientes." : "",
          ].join("\n").trim(), undefined, { origem: "placar-revisao", destino: "interno" });
        }
      }
    }

    // Confere o que REALMENTE chegou e avisa no grupo interno. O e-mail acima só dispara quando
    // NADA sai — falha parcial (CIIL e Dumar em 20/07) passava batido, e ninguém lê e-mail.
    let conferencia = null;
    if (!onlyClientId) {
      const elegiveis = withGroup.map((c) => ({ id: c.id, nome: clientDisplayName(c) }));
      // Na segunda saem os dois tipos: relatório pra quem tem tráfego, texto pro resto.
      const comRelatorio = withReport ? withGroup.filter((c) => podeFalarDeAnuncio(c) && c.meta_ad_account_id) : [];
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
