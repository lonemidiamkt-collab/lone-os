export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/system/cs-nao-lidas[?dry=1] — RELÊ a mensagem de cliente que a IA não conseguiu ler.
//
// 21/10/2026 (auditoria de erro recuperável, 5.10). Quando a classificação falhava, o inbound
// respondia "ok" e a mensagem do cliente se perdia (o message_id já estava reclamado). Agora ela
// fica em cs_mensagens_nao_lidas e esta rotina, a cada 15 min:
//   1. passa as mais antigas de novo pelo MESMO inbound (cabeçalho x-cs-releitura): a sugestão nasce
//      normalmente no grupo interno, com a nota de leitura atrasada. Se a IA ainda falha, para na
//      primeira (as outras falhariam igual) e tenta na próxima rodada;
//   2. avisa o time, no expediente, quando um grupo de cliente tem mensagem sem leitura há 30 min;
//   3. depois de 48h sem conseguir, desiste e pede para o time ler à mão.
// Nada aqui fala com o cliente: a releitura pula o que mandaria mensagem a ele fora de hora.
// 25/10/2026 (11.1): o ÁUDIO que não foi transcrito também está na fila — a releitura manda o áudio
// original e o inbound transcreve de novo. A exceção ao "não fala com o cliente" é o áudio que respondia
// o onboarding: ouvido, a conversa segue (a próxima pergunta vai ao cliente), por isso só no expediente.
// ?dry=1 mostra o plano sem reler nem avisar.

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import {
  planejarReleitura, payloadDaReleitura, lerResultadoReleitura, gruposParaAvisar,
  textoAvisoNaoLidas, textoDesistencia, noHorarioDeAviso,
} from "@/lib/cs/nao-lidas";
import {
  lerFila, travarParaLer, marcarLida, marcarFalhaDeNovo, marcarExpiradas, marcarAvisadas,
} from "@/lib/cs/nao-lidas-server";

// O próprio servidor (mesmo padrão de app/api/cs/estilo-perfis → cs-estilo).
const INBOUND = "http://localhost:3000/api/cs/inbound";

export async function POST(req: NextRequest) {
  const negado = requireCron(req);
  if (negado) return negado;
  const dry = req.nextUrl.searchParams.get("dry") !== null;

  const { fila, erro } = await lerFila();
  if (erro) return NextResponse.json({ ok: false, erro: `não consegui ler a fila: ${erro}` }, { status: 500 });
  if (!fila.length) return NextResponse.json({ ok: true, fila: 0 });

  const agora = new Date();
  const naFila = fila.filter((m) => m.status !== "expirada");
  const expiradasSemAviso = fila.filter((m) => m.status === "expirada");
  const { tentar, expirar } = planejarReleitura(naFila, agora);

  if (dry) {
    const pendentes = naFila.filter((m) => !expirar.includes(m));
    const grupos = gruposParaAvisar(pendentes, agora);
    return NextResponse.json({
      ok: true, dry, fila: naFila.length,
      releria: tentar.map((m) => ({ cliente: m.cliente_nome, recebida: m.recebida_em, tentativas: m.tentativas })),
      desistiria: expirar.length,
      previaAviso: grupos.length ? textoAvisoNaoLidas(grupos, pendentes.find((m) => m.erro)?.erro ?? null, agora) : null,
    });
  }

  const segredo = process.env.CS_INBOUND_SECRET;
  if (!segredo) return NextResponse.json({ ok: false, erro: "CS_INBOUND_SECRET não configurado" }, { status: 500 });

  await marcarExpiradas(expirar.map((m) => m.message_id));

  const lidas = new Set<string>();
  const falhas: { cliente: string | null | undefined; motivo: string }[] = [];
  let ultimoErro: string | null = null;
  for (const m of tentar) {
    if (!(await travarParaLer(m))) continue;
    let status = 0;
    let corpo: unknown = null;
    try {
      const res = await fetch(INBOUND, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cs-secret": segredo, "x-cs-releitura": "1" },
        body: JSON.stringify(payloadDaReleitura(m)),
        signal: AbortSignal.timeout(120_000),
      });
      status = res.status;
      corpo = await res.json().catch(() => null);
    } catch (e) {
      corpo = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const r = lerResultadoReleitura(status, corpo);
    if (r.lida) {
      await marcarLida(m, { motivo: r.motivo, resposta: corpo as Record<string, unknown> | null });
      lidas.add(m.message_id);
      continue;
    }
    await marcarFalhaDeNovo(m, r.motivo);
    falhas.push({ cliente: m.cliente_nome, motivo: r.motivo });
    // Falha só desta mensagem (o áudio dela não baixa, 25/10/2026): segue para as outras.
    if (r.soEsta) continue;
    ultimoErro = r.motivo;
    // Disjuntor: a IA continua fora → as próximas falhariam igual. Tenta de novo na próxima rodada.
    break;
  }

  // ── Avisos ao time ────────────────────────────────────────────────────────
  const expiradasAgora = new Set(expirar.map((m) => m.message_id));
  const pendentes = naFila.filter((m) => !lidas.has(m.message_id) && !expiradasAgora.has(m.message_id));
  const grupos = gruposParaAvisar(pendentes, agora);
  const desistencias = noHorarioDeAviso(agora) ? [...expirar, ...expiradasSemAviso] : [];
  const jid = process.env.CS_INTERNAL_GROUP_JID || "";
  let gruposAvisados = 0;
  let avisoFalhou: string | null = null;
  if (grupos.length || desistencias.length) {
    if (!jid) avisoFalhou = "CS_INTERNAL_GROUP_JID não configurado";
  }
  if (jid && grupos.length) {
    const erroMostrar = ultimoErro ?? pendentes.find((m) => m.erro)?.erro ?? null;
    const r = await csSendGroupText(jid, textoAvisoNaoLidas(grupos, erroMostrar, agora), undefined,
      { origem: "cs-nao-lidas", destino: "interno" });
    if (r.ok) {
      await marcarAvisadas(grupos.flatMap((g) => g.mensagens.map((m) => m.message_id)));
      gruposAvisados = grupos.length;
    } else avisoFalhou = r.error ?? "aviso não saiu";
  }
  if (jid && desistencias.length) {
    const r = await csSendGroupText(jid, textoDesistencia(desistencias, agora), undefined,
      { origem: "cs-nao-lidas-desistiu", destino: "interno" });
    if (r.ok) await marcarAvisadas(desistencias.map((m) => m.message_id));
    else avisoFalhou = r.error ?? "aviso não saiu";
  }

  console.log(`[cs-nao-lidas] fila=${naFila.length} lidas=${lidas.size} falhas=${falhas.length} expiradas=${expirar.length} avisados=${gruposAvisados}`);
  return NextResponse.json({
    ok: !avisoFalhou, fila: naFila.length, lidas: lidas.size, falhas, expiradas: expirar.length,
    gruposAvisados, ...(avisoFalhou ? { erro: `aviso ao time não saiu: ${avisoFalhou}` } : {}),
  });
}
