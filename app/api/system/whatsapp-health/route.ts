// app/api/system/whatsapp-health/route.ts — confere se o WhatsApp está de pé ANTES dos disparos.
//
// Nasceu de 27/07/2026: 38 relatórios de segunda falharam porque a conexão do número do gestor
// estava fechada enquanto a API respondia "open". Ninguém soube até o Roberto perguntar às 8h18.
//
// Roda 7h50 em dias úteis (`50 10 * * 1-5` UTC), dez minutos antes do relatório das 8h — tempo de
// alguém reconectar antes de o cliente ficar sem. Tenta religar sozinho primeiro; só avisa se não
// conseguir (alerta que toca à toa é alerta que ninguém escuta).
//
//   ?preview=1 → diagnostica e devolve, sem avisar ninguém

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { numerosDaOperacao, diagnosticar, textoAlerta } from "@/lib/whatsapp/saude";

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const previewOnly = req.nextUrl.searchParams.get("preview") !== null;

  const numeros = numerosDaOperacao();
  if (!numeros.length) {
    return NextResponse.json({ ok: false, error: "Evolution não configurada no ambiente." }, { status: 200 });
  }

  const diags = [];
  for (const n of numeros) diags.push(await diagnosticar(n));

  const texto = textoAlerta(diags);
  const jid = process.env.CS_INTERNAL_GROUP_JID;

  let avisado = false;
  if (texto && jid && !previewOnly) {
    // O aviso sai pelo número que AINDA estiver de pé — se o do agente caiu, quem fala é o do
    // gestor, e vice-versa. csSendGroupText usa o do agente; se ele estiver morto, não adianta.
    const agenteVivo = diags.find((d) => d.instancia === process.env.EVOLUTION_INSTANCE_NEW)?.vivo;
    if (agenteVivo) {
      const r = await csSendGroupText(jid, texto, undefined, { origem: "whatsapp-health", destino: "interno" });
      avisado = r.ok;
    } else {
      const { sendGroupText } = await import("@/lib/whatsapp/evolution");
      const r = await sendGroupText(jid, texto);
      avisado = r.ok;
    }
  }

  const caidos = diags.filter((d) => !d.vivo);
  const religados = diags.filter((d) => d.reconectado);

  return NextResponse.json({
    ok: caidos.length === 0,
    numeros: diags,
    religados_sozinho: religados.map((d) => d.rotulo),
    caidos: caidos.map((d) => d.rotulo),
    avisado,
    preview: texto || "(os dois números respondendo)",
  });
}
