// app/api/system/broadcast/route.ts — recado pontual nos grupos dos clientes.
//
// Nasceu porque cada pedido de "manda um recado pros clientes" virava uma rota nova
// (broadcast-agosto). Aqui o texto e o público vêm por parâmetro, com as mesmas travas de sempre.
//
//   ?dryRun=1        → mostra quem receberia e o texto, não envia
//   ?audiencia=      → trafego (só quem tem conta de anúncio) | social | todos   [padrão: todos]
//   ?excluir=        → nomes a tirar da lista, separados por vírgula (casa por trecho do nome).
//                      Ex: excluir=Dumar,Bruno Tintas Iguaba — porque "tem conta de anúncio" não é
//                      o mesmo que "faz tráfego com a gente", e conferir a lista antes de disparar
//                      é a regra da casa.
//   ?chave=          → identificador do disparo (idempotência). Ex: "fim-de-mes-2026-07"
//   body { texto }   → a mensagem
//
// Trava dupla: idempotência por `chave` (não manda duas vezes) e dedup por grupo (clientes que
// dividem grupo recebem uma vez só). Registra em client_group_message_log e em cs_outbound.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { selectActiveClientsWithGroup, clientDisplayName } from "@/lib/traffic/weekly-report";
import { csSendGroupText } from "@/lib/cs/notify";
import { sendGroupText } from "@/lib/whatsapp/evolution";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hojeBRT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Sai pelo agente; se ele não estiver no grupo, cai pro gestor em vez de o cliente ficar sem. */
async function enviar(jid: string, texto: string, clientId: string, origem: string) {
  const r = await csSendGroupText(jid, texto, undefined, { origem, destino: "cliente", clientId });
  if (r.ok) return r;
  return sendGroupText(jid, texto, `${origem}-fallback-gestor`);
}

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const audiencia = url.searchParams.get("audiencia") || "todos";
  const excluir = (url.searchParams.get("excluir") || "")
    .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const chave = (url.searchParams.get("chave") || "").trim();
  const body = await req.json().catch(() => ({}));
  const texto = ((body?.texto as string) || "").trim();

  if (!texto || texto.length < 20) {
    return NextResponse.json({ error: "Texto vazio ou curto demais." }, { status: 400 });
  }
  if (!chave) {
    // Sem chave não há como impedir envio duplicado — e disparo repetido pro cliente é pior
    // que disparo nenhum.
    return NextResponse.json({ error: "Informe ?chave= (identificador do disparo, p/ não repetir)." }, { status: 400 });
  }

  const dateKey = `${hojeBRT()}-${chave}`;
  const clientes = await selectActiveClientsWithGroup();
  const comGrupo = clientes.filter((c) => c.whatsapp_group_jid);

  const porAudiencia = audiencia === "trafego" ? comGrupo.filter((c) => c.meta_ad_account_id)
    : audiencia === "social" ? comGrupo.filter((c) => !c.meta_ad_account_id)
    : comGrupo;

  // Tira quem foi excluído na mão. O filtro de audiência é grosso por natureza — "tem conta de
  // anúncio" pega cliente de social que tem conta parada, e cliente pausado há semanas. Quem
  // dispara confere a lista e nomeia as exceções.
  const alvo = excluir.length
    ? porAudiencia.filter((c) => !excluir.some((e) => clientDisplayName(c).toLowerCase().includes(e)))
    : porAudiencia;
  const excluidos = porAudiencia.length - alvo.length;

  // Duas fichas podem apontar pro MESMO grupo (Bazar Ribeiro Maricá e Saquarema dividem um só). O
  // envio real já cobre isso mais abaixo, com `gruposFalados` — mas a prévia contava FICHAS, e é a
  // prévia que alguém lê pra autorizar o disparo. Anunciar 42 e entregar 41 faz o relatório final
  // parecer uma falha que não houve; pior, esconde que duas contas dividem um grupo.
  if (dryRun) {
    const porJid = new Map<string, string[]>();
    for (const c of alvo) {
      const jid = c.whatsapp_group_jid!;
      porJid.set(jid, [...(porJid.get(jid) ?? []), clientDisplayName(c)]);
    }
    const compartilhados = [...porJid.values()].filter((nomes) => nomes.length > 1);
    return NextResponse.json({
      ok: true, status: "dry_run", audiencia, chave,
      receberiam: porJid.size,          // grupos que recebem a mensagem — o número que importa
      fichas: alvo.length,              // cadastros na audiência, pode ser maior
      grupos_compartilhados: compartilhados.map((nomes) => nomes.join(" + ")),
      clientes: alvo.map(clientDisplayName), texto,
    });
  }

  // Quem já recebeu ESTE disparo.
  const { data: ja } = await supabaseAdmin
    .from("client_group_message_log").select("client_id").eq("date_key", dateKey).eq("status", "sent");
  const jaRecebeu = new Set((ja ?? []).map((r) => r.client_id as string));

  let enviados = 0, falhas = 0;
  const gruposFalados = new Set<string>();
  const erros: string[] = [];

  for (let i = 0; i < alvo.length; i++) {
    const c = alvo[i];
    const jid = c.whatsapp_group_jid!;
    if (jaRecebeu.has(c.id)) continue;
    if (gruposFalados.has(jid)) {
      await supabaseAdmin.from("client_group_message_log").insert({
        client_id: c.id, date_key: dateKey, kind: "support", status: "skipped",
        error: "grupo já recebeu (cliente compartilha grupo)",
      });
      continue;
    }
    const r = await enviar(jid, texto, c.id, `broadcast:${chave}`);
    if (r.ok) {
      enviados++; gruposFalados.add(jid);
      await supabaseAdmin.from("client_group_message_log").insert({ client_id: c.id, date_key: dateKey, kind: "support", status: "sent" });
    } else {
      falhas++; erros.push(`${clientDisplayName(c)}: ${r.error}`);
      await supabaseAdmin.from("client_group_message_log").insert({ client_id: c.id, date_key: dateKey, kind: "support", status: "failed", error: r.error ?? null });
    }
    if (i < alvo.length - 1) await sleep(2500);
  }

  // O time precisa saber o que foi dito ao cliente — senão é pego de surpresa na resposta.
  const jidInterno = process.env.CS_INTERNAL_GROUP_JID;
  if (jidInterno) {
    const resumo = falhas ? `⚠️ *${falhas}* não receberam:\n${erros.slice(0, 8).map((e) => `• ${e}`).join("\n")}` : "✅ Todos receberam.";
    await csSendGroupText(jidInterno,
      `📣 *Mandei um recado pros clientes* (${audiencia === "trafego" ? "só tráfego pago" : audiencia})\n\n` +
      `_"${texto.slice(0, 220)}${texto.length > 220 ? "…" : ""}"_\n\n` +
      `Foi pra *${enviados}* grupos. ${resumo}`,
      undefined, { origem: "broadcast-aviso-interno", destino: "interno" });
  }

  return NextResponse.json({ ok: enviados > 0, enviados, falhas, erros: erros.slice(0, 15) });
}
