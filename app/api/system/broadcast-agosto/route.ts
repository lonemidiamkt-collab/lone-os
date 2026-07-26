// app/api/system/broadcast-agosto/route.ts
//
// DISPARO ÚNICO — segunda 27/07/2026. Pergunta aos grupos dos clientes o que eles vão
// preparar para AGOSTO, puxando o Dia dos Pais (domingo 09/08) como gancho.
//
// Por que existe separado do calendário do dia 20: aquele já foi (20/07, 43 clientes) e
// perguntou da promoção do mês de forma genérica. Este é o follow-up com a data que puxa
// venda em agosto, no começo da semana, com tempo de produzir arte antes do dia 09.
//
// SÓ RODA UMA VEZ. Trava tripla:
//   1. data — só dispara em 27/07/2026 (fora disso responde "skipped")
//   2. idempotência — date_key `2026-07-27-agosto` no client_group_message_log
//   3. dedup por grupo — clientes que dividem grupo (Bazar Ribeiro) recebem uma vez só
//
//   ?dryRun=1   → lista quem receberia e mostra o texto (não envia)
//   ?clientId=X → envia só pra esse cliente (teste pontual, ignora a trava de data)
//   ?force=1    → ignora a trava de data e a idempotência
//
// Depois que rodar, a linha do crontab pode sair — a trava de data já impede repetição.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { selectActiveClientsWithGroup, clientDisplayName } from "@/lib/traffic/weekly-report";
import { sendGroupText } from "@/lib/whatsapp/evolution";
import { csSendGroupText } from "@/lib/cs/notify";

const DIA_DO_DISPARO = "2026-07-27";
/** Sufixo no date_key: o `kind` do log tem CHECK no banco (report|support|calendar) e um valor
 *  novo falharia calado. O mesmo truque do relatório mensal ("-mensal"). */
const DATE_KEY = `${DIA_DO_DISPARO}-agosto`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const todayKeyBRT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

// Uma pergunta só, aberta, sem prometer prazo nem inventar número. SEM o nome da loja: o nome
// cadastrado é o do sistema ("Farmacia - Arte em Manipulação", "BAZAR RIBEIRO" em caixa alta) e
// soaria exatamente como o disparo em massa que a gente está tentando não parecer. O grupo já
// diz quem é.
function mensagem(): string {
  return (
    `Oi, pessoal! 👋 Bom começo de semana!\n\n` +
    `Agosto tá chegando e tem uma data que movimenta MUITO o comércio: o *Dia dos Pais*, ` +
    `no dia *9 de agosto* (domingo). 👔\n\n` +
    `Vocês já pensaram em alguma *promoção, combo ou ação especial* pra essa data? ` +
    `Ou alguma outra novidade pra agosto?\n\n` +
    `Se der pra passar essa semana, a gente já começa a desenvolver as artes com calma e ` +
    `chega na data com tudo pronto — em vez de correr na última hora. 🎨\n\n` +
    `Manda aqui que a gente cuida! 🚀`
  );
}

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const force = url.searchParams.get("force") === "1";
  const onlyClientId = url.searchParams.get("clientId");

  try {
    const hoje = todayKeyBRT();
    if (!force && !onlyClientId && hoje !== DIA_DO_DISPARO) {
      return NextResponse.json({ ok: true, status: "skipped", message: `disparo único é ${DIA_DO_DISPARO}; hoje é ${hoje}` });
    }

    const clients = await selectActiveClientsWithGroup(onlyClientId);
    const withGroup = clients.filter((c) => c.whatsapp_group_jid);
    const semGrupo = clients.filter((c) => !c.whatsapp_group_jid).map(clientDisplayName);
    if (!withGroup.length) {
      return NextResponse.json({ ok: true, status: "skipped", message: "nenhum cliente com grupo confirmado", semGrupo });
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true, status: "dry_run", dispararia_em: DIA_DO_DISPARO,
        elegiveis: withGroup.length, semGrupo,
        exemplo: mensagem(),
        clientes: withGroup.map(clientDisplayName),
      });
    }

    // Quem já recebeu (idempotência) — uma consulta só, em vez de uma por cliente.
    const jaEnviado = new Set<string>();
    if (!force) {
      const { data } = await supabaseAdmin
        .from("client_group_message_log").select("client_id")
        .eq("date_key", DATE_KEY).eq("status", "sent");
      for (const r of data ?? []) jaEnviado.add(r.client_id as string);
    }

    let enviados = 0, falhas = 0;
    const gruposJaFalados = new Set<string>(); // dois clientes no mesmo grupo = uma mensagem só
    const erros: string[] = [];

    for (let i = 0; i < withGroup.length; i++) {
      const c = withGroup[i];
      const nome = clientDisplayName(c);
      const jid = c.whatsapp_group_jid!;
      if (jaEnviado.has(c.id)) continue;

      if (gruposJaFalados.has(jid)) {
        await supabaseAdmin.from("client_group_message_log").insert({
          client_id: c.id, date_key: DATE_KEY, kind: "support", status: "skipped",
          error: "grupo já recebeu a pergunta de agosto (cliente compartilha grupo)",
        });
        continue;
      }

      const res = await sendGroupText(jid, mensagem());
      if (res.ok) {
        enviados++;
        gruposJaFalados.add(jid);
        await supabaseAdmin.from("client_group_message_log").insert({ client_id: c.id, date_key: DATE_KEY, kind: "support", status: "sent" });
      } else {
        falhas++;
        erros.push(`${nome}: ${res.error}`);
        await supabaseAdmin.from("client_group_message_log").insert({ client_id: c.id, date_key: DATE_KEY, kind: "support", status: "failed", error: res.error ?? null });
      }
      if (i < withGroup.length - 1) await sleep(2500);
    }

    // Avisa o time no grupo interno: o que foi perguntado e a quem — pra ninguém ser pego de
    // surpresa quando o cliente responder, e pra falha não passar batido.
    const internalJid = process.env.CS_INTERNAL_GROUP_JID;
    if (internalJid && !onlyClientId) {
      const resumo = falhas
        ? `⚠️ *${falhas}* não receberam:\n${erros.slice(0, 8).map((e) => `• ${e}`).join("\n")}`
        : "✅ Todos receberam.";
      await csSendGroupText(internalJid,
        `📣 *Perguntei aos clientes sobre agosto* — Dia dos Pais (dom 09/08)\n\n` +
        `Mandei em *${enviados}* grupos: "já pensaram em promoção/combo pro Dia dos Pais ou alguma novidade pra agosto?"\n\n` +
        `${resumo}\n\n` +
        `_Quem responder, já dá pra abrir o card e adiantar a arte — a data é dia 9._`);
    }

    return NextResponse.json({ ok: enviados > 0, status: enviados > 0 ? "sent" : "failed", enviados, falhas, semGrupo, erros: erros.slice(0, 15) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[broadcast-agosto] erro:", msg);
    return NextResponse.json({ ok: false, status: "error", error: msg }, { status: 200 });
  }
}
