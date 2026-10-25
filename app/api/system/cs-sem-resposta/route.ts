export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { vencidas, marcarExpirada, desfechoDoAvisoSemResposta, SLA_MINUTOS } from "@/lib/cs/requests";
import { csSendGroupText } from "@/lib/cs/notify";
import { resultadoDosEnvios, SEM_GRUPO_INTERNO, type FalhaEnvio } from "@/lib/automacoes/envios";

// POST /api/system/cs-sem-resposta — "o cliente perguntou e ninguém assumiu".
//
// FASE 2 da arquitetura de resposta (Roberto, 24-25/08). Deliberadamente NÃO fala com o cliente:
// só avisa o time. Metade do valor da ideia inteira está aqui, com risco zero — e o histórico do
// projeto mostra que recurso que fala com cliente deve passar por revisão humana antes.
//
// Medido antes de construir: 201 perguntas no expediente em 30 dias, mediana de resposta de 3
// minutos, 30% passando de 30 min. Isso dá ~2 alertas por dia — número que o time consegue ler.
// Se virar enxurrada, o SLA sobe; alerta que toca demais é o primeiro a ser ignorado.

const ROTULO: Record<string, string> = {
  anuncio: "anúncios", arte: "arte", prazo: "prazo", financeiro: "financeiro", outro: "",
};

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;

  // Leitura que falha não é "nenhuma pergunta vencida" (auditoria 10.1).
  let abertas: Awaited<ReturnType<typeof vencidas>>;
  try { abertas = await vencidas(); }
  catch (e) { return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
  if (!abertas.length) return NextResponse.json({ ok: true, vencidas: 0 });

  const jid = process.env.CS_INTERNAL_GROUP_JID || "";
  if (!jid && !dry) return NextResponse.json({ ...resultadoDosEnvios([{ alvo: "grupo interno", erro: SEM_GRUPO_INTERNO }]), vencidas: abertas.length }, { status: 500 });

  // UMA mensagem com todas, não uma por pendência: três alertas seguidos no grupo viram ruído e
  // ninguém lê o terceiro.
  const linhas = abertas.slice(0, 8).map((r) => {
    const assunto = ROTULO[r.topico] ? ` · sobre ${ROTULO[r.topico]}` : "";
    const quem = r.autor ? `${r.autor} d` : "";
    return `• *${quem ? `${quem}a ${r.cliente}` : r.cliente}* — há ${r.minutos} min${assunto}\n  _"${r.texto.slice(0, 110)}"_`;
  });

  const texto = [
    abertas.length === 1
      ? `⏰ *Uma pergunta de cliente sem resposta há mais de ${SLA_MINUTOS} min:*`
      : `⏰ *${abertas.length} perguntas de cliente sem resposta há mais de ${SLA_MINUTOS} min:*`,
    "",
    linhas.join("\n"),
    abertas.length > 8 ? `\n_e mais ${abertas.length - 8}._` : "",
    "",
    "Se já respondeu por fora, ignora — eu fecho sozinho quando alguém falar no grupo.",
  ].filter(Boolean).join("\n");

  const falhas: FalhaEnvio[] = [];
  let marcadas = 0;
  if (!dry) {
    const envio = await csSendGroupText(jid, texto, undefined, { origem: "cliente-sem-resposta", destino: "interno" });
    // Marca só quando o aviso saiu (ou pode ter saído): envio recusado volta na próxima rodada.
    const d = desfechoDoAvisoSemResposta(envio);
    if (d.falha) falhas.push({ alvo: "grupo interno", erro: d.falha });
    if (d.marcar) {
      const naoMarcadas: string[] = [];
      for (const r of abertas) {
        const erro = await marcarExpirada(r.id);
        if (erro) naoMarcadas.push(r.cliente); else marcadas++;
      }
      if (naoMarcadas.length) {
        falhas.push({ alvo: "registro", erro: `não marquei ${naoMarcadas.length} pergunta(s) como avisada(s) (${naoMarcadas.slice(0, 3).join(", ")}) — podem ser avisadas de novo` });
      }
    }
  }

  return NextResponse.json({
    ...resultadoDosEnvios(falhas), dry, vencidas: abertas.length, marcadas,
    detalhe: abertas.map((r) => ({ cliente: r.cliente, minutos: r.minutos, topico: r.topico })),
    ...(dry ? { previa: texto } : {}),
  });
}
