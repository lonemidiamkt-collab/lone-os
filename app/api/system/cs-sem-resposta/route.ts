export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { vencidas, marcarExpirada, SLA_MINUTOS } from "@/lib/cs/requests";
import { csSendGroupText } from "@/lib/cs/notify";

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

  const abertas = await vencidas();
  if (!abertas.length) return NextResponse.json({ ok: true, vencidas: 0 });

  const jid = process.env.CS_INTERNAL_GROUP_JID || "";
  if (!jid) return NextResponse.json({ ok: false, erro: "grupo interno não configurado" }, { status: 500 });

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

  if (!dry) {
    await csSendGroupText(jid, texto, undefined, { origem: "cliente-sem-resposta", destino: "interno" });
    // Marca depois de avisar: o alerta sai UMA vez por pendência, mesmo que ninguém responda.
    for (const r of abertas) await marcarExpirada(r.id);
  }

  return NextResponse.json({
    ok: true, dry, vencidas: abertas.length,
    detalhe: abertas.map((r) => ({ cliente: r.cliente, minutos: r.minutos, topico: r.topico })),
    ...(dry ? { previa: texto } : {}),
  });
}
