// app/api/system/cs-conferir-postagem/route.ts — o resumo de postagem no grupo de Artes.
//
// Roda seg/qua/sex no fim da tarde: confere no Instagram DE VERDADE quem postou e resume no grupo.
// "todos postaram" numa linha, ou os que faltaram com nome e dono.
//
// POR QUE NO FIM DA TARDE e não de manhã: postagem acontece ao longo do dia. Conferir às 9h
// acusaria quase todo mundo e o time aprenderia a ignorar — que é o oposto do que isto serve.
//
// ?dryRun=1 → devolve o texto sem mandar.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { conferirPostagem, textoResumo } from "@/lib/cs/postou-hoje";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, ymd } from "@/lib/cs/vigilancia";

export async function POST(req: NextRequest) {
  const negado = requireCron(req);
  if (negado) return negado;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const social = url.searchParams.get("social") ?? undefined;
  // ?dia=YYYY-MM-DD — conferir um dia passado. Útil pra testar e pra refazer depois de uma falha.
  const dia = url.searchParams.get("dia") ?? undefined;

  const r = await conferirPostagem(social, dia);
  if ("erro" in r) return NextResponse.json({ ok: false, erro: r.erro }, { status: 502 });

  const texto = textoResumo(r);
  if (dryRun) {
    return NextResponse.json({
      ok: true, dryRun: true, texto,
      postaram: r.postaram.length, faltaram: r.faltaram.length,
      semInstagram: r.semInstagram.length, comErro: r.comErro.length,
    });
  }

  const jid = process.env.CS_INTERNAL_GROUP_JID || "";
  if (!jid) return NextResponse.json({ ok: false, erro: "grupo de Artes não configurado" }, { status: 500 });

  // UMA RODADA POR DIA. Sem isto, um disparo manual junto do cron manda o mesmo resumo duas vezes
  // — foi o que aconteceu com o relatório de segunda.
  const { reservarRodada, fecharRodada } = await import("@/lib/system/trava-rodada");
  const diaTrava = dia || ymd(spNow());
  const reserva = await reservarRodada("cs-conferir-postagem", diaTrava);
  if (!reserva.conseguiu) {
    return NextResponse.json({ ok: true, status: "skip", motivo: reserva.motivo });
  }

  // Declara os FATOS: se o bom-dia já citou os mesmos clientes parados hoje, o porta-voz cala.
  const fatos = r.faltaram.map((f) => `sem-post:${f.cliente.toLowerCase().replace(/\s+/g, "-")}:${diaTrava}`);
  const env = await csSendGroupText(jid, texto, undefined, {
    origem: "cs-conferir-postagem", destino: "interno", fatos,
  });

  await fecharRodada("cs-conferir-postagem", diaTrava, env.ok,
    `${r.postaram.length} postaram, ${r.faltaram.length} não`);

  return NextResponse.json({
    ok: env.ok, postaram: r.postaram.length, faltaram: r.faltaram.length,
    semInstagram: r.semInstagram.length, comErro: r.comErro.length,
    ...(env.ok ? {} : { erro: env.error }),
  });
}
