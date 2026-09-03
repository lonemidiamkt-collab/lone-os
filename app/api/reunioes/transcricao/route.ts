export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { analisarTranscricao, contarPalavras, textoRegistrada } from "@/lib/cs/reuniao-transcricao";
import { reuniaoPdfHtml } from "@/lib/reports/reuniaoPdf";

// POST /api/reunioes/transcricao — o time manda a transcrição, o sistema guarda e entende.
//
// Roberto (04/09): "ele tem que pegar essa transcrição, mandar alocar dentro do nosso sistema e
// ficar guardado — e às vezes aprimorar o briefing, ou deixar ali como pontos de atenção."
//
// O que acontece a cada envio:
//   1. Grava a transcrição CRUA (é ela que serve para repescar depois).
//   2. A IA extrai decisões, ações, pendências, pontos de atenção e sugestões de briefing.
//   3. Gera o PDF e guarda no bucket privado `meeting-records`.
//   4. Atualiza a jornada do cliente e avisa o time.
//
// As sugestões de briefing NÃO viram regra sozinhas: ficam na análise esperando um "ok" humano.
// Regra errada no briefing contamina toda peça futura, e o custo de perguntar é uma mensagem.

interface Corpo {
  clientId?: string;
  /** Reunião existente. Sem isso, cria uma avulsa na data informada. */
  reuniaoId?: string;
  transcricao?: string;
  /** ISO. Sem isso, agora. */
  quando?: string;
  origem?: "texto" | "audio" | "notas";
}

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const b = (await req.json().catch(() => null)) as Corpo | null;
  const transcricao = (b?.transcricao ?? "").trim();
  if (!transcricao) return NextResponse.json({ error: "transcricao é obrigatória" }, { status: 400 });
  // Menos de 40 palavras não é reunião — é recado. Analisar isso gasta uma chamada de IA para
  // devolver campos vazios, e enche o histórico de registros que não ajudam ninguém.
  if (contarPalavras(transcricao) < 40) {
    return NextResponse.json({ error: "transcrição muito curta (mínimo 40 palavras)" }, { status: 400 });
  }

  // ── Acha ou cria a reunião ──────────────────────────────────────────────
  let reuniaoId = b?.reuniaoId ?? null;
  let clientId = b?.clientId ?? null;

  if (reuniaoId) {
    const { data } = await supabaseAdmin.from("meetings").select("client_id").eq("id", reuniaoId).maybeSingle();
    if (!data) return NextResponse.json({ error: "reunião não encontrada" }, { status: 404 });
    clientId = data.client_id as string;
  }
  if (!clientId) return NextResponse.json({ error: "clientId ou reuniaoId é obrigatório" }, { status: 400 });

  const { data: cli } = await supabaseAdmin
    .from("clients").select("name, nome_fantasia, nicho, assigned_social")
    .eq("id", clientId).maybeSingle();
  if (!cli) return NextResponse.json({ error: "cliente não encontrado" }, { status: 404 });
  const nomeCli = (cli.nome_fantasia as string) || (cli.name as string) || "Cliente";
  const quando = b?.quando ?? new Date().toISOString();

  if (!reuniaoId) {
    // Reunião avulsa: nem toda conversa com cliente é a do ciclo mensal, e obrigar a criar antes
    // faria o time desistir de registrar — que é o oposto do objetivo.
    const { data, error } = await supabaseAdmin.from("meetings").insert({
      client_id: clientId,
      title: `Reunião — ${nomeCli}`,
      meeting_type: "avulsa",
      start_at: quando,
      end_at: new Date(new Date(quando).getTime() + 3600_000).toISOString(),
      estado: "realizada",
      responsavel: (cli.assigned_social as string) || null,
      status: "completed",
      created_by: user.email,
      realizada_em: quando,
    }).select("id").single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "falha ao criar" }, { status: 500 });
    reuniaoId = data.id as string;
  }

  // ── Analisa ─────────────────────────────────────────────────────────────
  const r = await analisarTranscricao(nomeCli, (cli.nicho as string) || undefined, transcricao);
  if (!r.ok || !r.data) {
    // Grava a transcrição MESMO ASSIM. Perder o que foi dito porque a IA falhou seria trocar o
    // registro (que é o essencial) pela análise (que é o acessório) — e a análise pode ser
    // refeita depois; a transcrição, não.
    await supabaseAdmin.from("meetings").update({
      transcricao, transcricao_origem: b?.origem ?? "texto",
      transcricao_em: new Date().toISOString(), transcricao_por: user.email,
      transcricao_palavras: contarPalavras(transcricao),
      estado: "realizada", realizada_em: quando,
    }).eq("id", reuniaoId);
    return NextResponse.json({
      ok: true, reuniaoId, analisada: false,
      aviso: `transcrição guardada, mas a análise falhou: ${r.error ?? "erro"}. Dá pra reprocessar depois.`,
    });
  }
  const a = r.data;

  // ── PDF no bucket privado ───────────────────────────────────────────────
  let pdfPath: string | null = null;
  try {
    const { htmlToPdf } = await import("@/lib/traffic/renderPdf");
    const { loadLoneLogo } = await import("@/lib/cs/roteiro-pdf");
    const logo = await loadLoneLogo().catch(() => "");
    const pdf = await htmlToPdf(reuniaoPdfHtml({
      cliente: nomeCli, quando, responsavel: (cli.assigned_social as string) || null,
      resumo: a.resumo, decisoes: a.decisoes, proximasAcoes: a.proximas_acoes,
      pendenciasCliente: a.pendencias_cliente, pontosAtencao: a.pontos_atencao,
      sugestoesBriefing: a.sugestoes_briefing, clima: a.clima, transcricao,
    }, logo));
    if (pdf.ok && pdf.buffer) {
      // Caminho por cliente e data: dá para achar no bucket sem consultar o banco.
      const caminho = `${clientId}/${quando.slice(0, 10)}-${reuniaoId.slice(0, 8)}.pdf`;
      const { error: upErr } = await supabaseAdmin.storage.from("meeting-records")
        .upload(caminho, pdf.buffer, { contentType: "application/pdf", upsert: true });
      if (!upErr) pdfPath = caminho;
      else console.error("[reuniao/transcricao] upload:", upErr.message);
    }
  } catch (e) {
    // PDF é conveniência; o registro no banco é o que importa. Falhar aqui não pode perder a análise.
    console.error("[reuniao/transcricao] pdf:", e);
  }

  await supabaseAdmin.from("meetings").update({
    transcricao,
    transcricao_origem: b?.origem ?? "texto",
    transcricao_em: new Date().toISOString(),
    transcricao_por: user.email,
    transcricao_palavras: contarPalavras(transcricao),
    analise: a,
    pontos_atencao: a.pontos_atencao,
    resumo: a.resumo,
    pdf_path: pdfPath,
    estado: "realizada",
    realizada_em: quando,
  }).eq("id", reuniaoId);

  // ── Fecha o loop na jornada do cliente ──────────────────────────────────
  await supabaseAdmin.from("client_journey").upsert({
    client_id: clientId,
    ultima_reuniao: quando.slice(0, 10),
    ...(a.proxima_reuniao ? { proxima_reuniao: a.proxima_reuniao } : {}),
  }, { onConflict: "client_id" }).then(() => {}, (e) => console.error("[reuniao] jornada:", e));

  // ── Avisa o time ────────────────────────────────────────────────────────
  const jid = process.env.CS_INTERNAL_GROUP_JID;
  if (jid) {
    const { csSendGroupText } = await import("@/lib/cs/notify");
    const { mencionar } = await import("@/lib/cs/mencao");
    const m = cli.assigned_social
      ? await mencionar(cli.assigned_social as string).catch(() => ({ trecho: "", jids: [] as string[] }))
      : { trecho: "", jids: [] as string[] };
    await csSendGroupText(jid, textoRegistrada(nomeCli, a, m.trecho), undefined,
      { origem: "cs-reuniao-transcricao", destino: "interno", clientId }, m.jids).catch(() => {});
  }

  return NextResponse.json({
    ok: true, reuniaoId, analisada: true, pdf: !!pdfPath,
    resumo: a.resumo, clima: a.clima,
    pontos_atencao: a.pontos_atencao,
    sugestoes_briefing: a.sugestoes_briefing,
    palavras: contarPalavras(transcricao),
  });
}
