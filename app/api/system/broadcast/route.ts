// app/api/system/broadcast/route.ts — recado pontual nos grupos dos clientes.
//
// Nasceu porque cada pedido de "manda um recado pros clientes" virava uma rota nova
// (broadcast-agosto). Aqui o texto e o público vêm por parâmetro, com as mesmas travas de sempre.
//
//   ?dryRun=1        → mostra quem receberia e o texto, não envia
//   ?audiencia=      → trafego (quem CONTRATOU anúncios) | social (quem não contratou) | todos
//                      [padrão: todos]. Pelo contrato, não pela conta vinculada (21/10/2026).
//                      Valor desconhecido é recusado — erro de digitação não vira "todos".
//   ?excluir=        → nomes a tirar da lista, separados por vírgula (casa por trecho do nome).
//                      Ex: excluir=Bruno Tintas Iguaba — conferir a lista antes de disparar é a
//                      regra da casa.
//   ?chave=          → identificador do disparo (idempotência). Ex: "fim-de-mes-2026-07"
//   body { texto }   → a mensagem
//
// Travas (21/10/2026):
//   • a chave vale PRA SEMPRE, não por dia: a mesma chave rodada amanhã só completa quem ficou de fora;
//   • dedup por GRUPO (cadastros que dividem grupo recebem uma vez só, também entre rodadas);
//   • uma rodada por chave de cada vez (reservarRodada): duas chamadas juntas não mandam em dobro;
//   • envio incerto (o WhatsApp não confirmou a tempo) conta como recebido e vai pro time conferir.
// Registra em client_group_message_log (date_key = "broadcast:<chave>") e em cs_outbound.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { selectActiveClientsWithGroup, clientDisplayName } from "@/lib/traffic/weekly-report";
import { csSendGroupText } from "@/lib/cs/notify";
import { sendGroupText } from "@/lib/whatsapp/evolution";
import { erroParaLog, podeTrocarDeNumero, textoEnviosIncertos } from "@/lib/whatsapp/desfecho-envio";
import { agruparPorGrupo, juntarNomes } from "@/lib/whatsapp/grupo-compartilhado";
import { chaveDoRegistro, filtrarAudiencia, gruposJaAtendidos, lerAudiencia, AUDIENCIAS } from "@/lib/system/broadcast";
import { reservarRodada, fecharRodada } from "@/lib/system/trava-rodada";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hojeBRT = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/**
 * Sai pelo agente; se ele não estiver no grupo, cai pro gestor em vez de o cliente ficar sem.
 * Só cai pro gestor quando é CERTO que não saiu (21/10/2026): timeout do agente pode ter entregado,
 * e mandar de novo pelo gestor punha o recado duas vezes no grupo.
 */
async function enviar(jid: string, texto: string, clientId: string, origem: string) {
  const r = await csSendGroupText(jid, texto, undefined, { origem, destino: "cliente", clientId });
  if (!podeTrocarDeNumero(r)) return r;
  return sendGroupText(jid, texto, `${origem}-fallback-gestor`);
}

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const audiencia = lerAudiencia(url.searchParams.get("audiencia"));
  const excluir = (url.searchParams.get("excluir") || "")
    .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const chave = (url.searchParams.get("chave") || "").trim();
  const body = await req.json().catch(() => ({}));
  const texto = ((body?.texto as string) || "").trim();

  if (!audiencia) {
    return NextResponse.json({ error: `audiencia inválida — use ${AUDIENCIAS.join(", ")}.` }, { status: 400 });
  }
  if (!texto || texto.length < 20) {
    return NextResponse.json({ error: "Texto vazio ou curto demais." }, { status: 400 });
  }
  if (!chave) {
    // Sem chave não há como impedir envio duplicado — e disparo repetido pro cliente é pior
    // que disparo nenhum.
    return NextResponse.json({ error: "Informe ?chave= (identificador do disparo, p/ não repetir)." }, { status: 400 });
  }

  const chaveLog = chaveDoRegistro(chave);
  const clientes = await selectActiveClientsWithGroup();
  const comGrupo = clientes.filter((c) => c.whatsapp_group_jid);
  const porAudiencia = filtrarAudiencia(comGrupo, audiencia);

  // Tira quem foi excluído na mão. Quem dispara confere a lista e nomeia as exceções.
  const alvo = excluir.length
    ? porAudiencia.filter((c) => !excluir.some((e) => clientDisplayName(c).toLowerCase().includes(e)))
    : porAudiencia;
  const excluidos = porAudiencia.length - alvo.length;

  // Duas fichas podem apontar pro MESMO grupo (Bazar Ribeiro Maricá e Saquarema dividem um só). A
  // prévia conta GRUPOS, que é o que alguém lê pra autorizar o disparo.
  const grupos = agruparPorGrupo(alvo);
  if (dryRun) {
    const compartilhados = grupos.filter((g) => g.clientes.length > 1);
    return NextResponse.json({
      ok: true, status: "dry_run", audiencia, chave,
      receberiam: grupos.length,        // grupos que recebem a mensagem — o número que importa
      fichas: alvo.length,              // cadastros na audiência, pode ser maior
      excluidos,
      grupos_compartilhados: compartilhados.map((g) => g.clientes.map(clientDisplayName).join(" + ")),
      clientes: alvo.map(clientDisplayName), texto,
    });
  }

  // UMA RODADA POR CHAVE DE CADA VEZ. Duas chamadas juntas liam "ninguém recebeu" ao mesmo tempo e
  // as duas mandavam. Terminada a rodada, a próxima com a mesma chave pode rodar (completa quem falhou).
  const rotinaTrava = chaveLog;
  const diaTrava = hojeBRT();
  const reserva = await reservarRodada(rotinaTrava, diaTrava, { permitirNovaRodada: true });
  if (!reserva.conseguiu) {
    return NextResponse.json({ ok: false, status: "em_andamento", motivo: reserva.motivo, chave }, { status: 409 });
  }

  let enviados = 0, falhas = 0, jaTinham = 0;
  const erros: string[] = [];
  const incertos: { cliente: string; erro?: string }[] = [];
  const semRegistro: string[] = [];
  try {
    // Quem já recebeu ESTE recado, em qualquer dia — por grupo.
    const { data: ja, error: eJa } = await supabaseAdmin
      .from("client_group_message_log").select("client_id, status, error")
      .eq("date_key", chaveLog).in("status", ["sent", "failed"]);
    if (eJa) {
      // Sem saber quem já recebeu, não manda: repetir recado pro cliente é pior que esperar.
      await fecharRodada(rotinaTrava, diaTrava, false, `não leu o registro: ${eJa.message}`);
      return NextResponse.json({ ok: false, error: `Não consegui conferir quem já recebeu este recado (${eJa.message}) — nada foi enviado.` }, { status: 500 });
    }
    const jidPorCliente = new Map(comGrupo.map((c) => [c.id, c.whatsapp_group_jid as string]));
    const jaAtendidos = gruposJaAtendidos(
      (ja ?? []) as { client_id: string; status: string; error: string | null }[], jidPorCliente);

    for (let i = 0; i < grupos.length; i++) {
      const g = grupos[i];
      const nome = juntarNomes(g.clientes.map(clientDisplayName));
      if (jaAtendidos.has(g.jid)) { jaTinham++; continue; }

      const [principal, ...mesmoGrupo] = g.clientes;
      const r = await enviar(g.jid, texto, principal.id, `broadcast:${chave}`);
      if (r.ok) enviados++;
      else if (r.incerto) incertos.push({ cliente: nome, erro: r.error });
      else { falhas++; erros.push(`${nome}: ${r.error}`); }

      const linhas = [
        { client_id: principal.id, date_key: chaveLog, kind: "support", status: r.ok ? "sent" : "failed", error: r.ok ? null : erroParaLog(r) },
        ...(r.ok ? mesmoGrupo.map((c) => ({
          client_id: c.id, date_key: chaveLog, kind: "support", status: "skipped",
          error: "grupo já recebeu (cliente compartilha grupo)",
        })) : []),
      ];
      // O registro é o que impede a repetição: se ele falhar depois de um envio, o time precisa saber.
      const { error: eLog } = await supabaseAdmin.from("client_group_message_log").insert(linhas);
      if (eLog) {
        console.error(`[broadcast] ${nome}: registro falhou:`, eLog.message);
        if (r.ok || r.incerto) semRegistro.push(nome);
      }
      if (i < grupos.length - 1) await sleep(2500);
    }

    // O time precisa saber o que foi dito ao cliente — senão é pego de surpresa na resposta.
    const jidInterno = process.env.CS_INTERNAL_GROUP_JID;
    const tentou = enviados + falhas + incertos.length > 0;
    if (jidInterno && tentou) {
      const partes: string[] = [
        `📣 *Mandei um recado pros clientes* (${audiencia === "trafego" ? "só tráfego pago" : audiencia})\n\n` +
        `_"${texto.slice(0, 220)}${texto.length > 220 ? "…" : ""}"_\n\n` +
        `Foi pra *${enviados}* grupos.` + (jaTinham ? ` ${jaTinham} já tinham recebido este recado e ficaram de fora.` : "") +
        (falhas
          ? `\n\n⚠️ *${falhas}* não receberam:\n${erros.slice(0, 8).map((e) => `• ${e}`).join("\n")}\n_Rodar de novo com a mesma chave manda só pra eles._`
          : incertos.length ? "" : "\n\n✅ Todos receberam."),
      ];
      if (incertos.length) partes.push(textoEnviosIncertos("o recado", incertos, "mande o recado na mão no grupo"));
      if (semRegistro.length) {
        partes.push(`⚠️ *Saiu, mas não consegui registrar* — ${semRegistro.map((n) => `*${n}*`).join(", ")}.\n`
          + `_Se rodar de novo com a mesma chave, ${semRegistro.length === 1 ? "esse grupo recebe" : "esses grupos recebem"} duas vezes._`);
      }
      await csSendGroupText(jidInterno, partes.join("\n\n"),
        undefined, { origem: "broadcast-aviso-interno", destino: "interno" });
    }

    await fecharRodada(rotinaTrava, diaTrava, falhas === 0,
      `enviados ${enviados} · falhas ${falhas} · incertos ${incertos.length} · já tinham ${jaTinham}`);
    return NextResponse.json({
      ok: enviados > 0 || (falhas === 0 && incertos.length === 0),
      enviados, falhas, jaTinham, incertos, semRegistro, erros: erros.slice(0, 15),
    });
  } catch (err) {
    // Fecha a reserva mesmo com exceção — senão a chave fica trancada até o destrave de 90 min.
    const msg = err instanceof Error ? err.message : String(err);
    await fecharRodada(rotinaTrava, diaTrava, false, msg);
    return NextResponse.json({ ok: false, error: msg, enviados, falhas, incertos }, { status: 500 });
  }
}
