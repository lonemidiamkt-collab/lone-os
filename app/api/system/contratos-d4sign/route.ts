// app/api/system/contratos-d4sign/route.ts — a consulta periódica do cofre dos contratos na D4Sign.
//
// O caminho principal é o webhook (/api/integracoes/d4sign). Esta consulta pega o que ele não trouxe
// (Lone OS fora do ar por mais de 27 h, webhook ainda não cadastrado) e conhece os documentos que esperam
// assinatura — é daí que sai o "Ainda não assinaram" da manhã (contratos-d4sign-pendentes). A conta da D4Sign
// responde a 10 chamadas por HORA: cada rodada lê o cofre e no máximo mais 3; o resto fica para a seguinte.
//
//   ?dry=1 ............... o que aconteceria: lê a D4Sign e o banco, devolve as mensagens, não grava nem manda
//   ?webhook=ver ......... a URL de webhook cadastrada hoje no cofre (só leitura)
//   ?webhook=cadastrar ... cadastra o webhook 2.0 do cofre apontando para este painel (com ?dry=1 só mostra)
//
// Integração desligada (sem token ou sem cofre, no painel ou no servidor) devolve ok com `desligado`.
// Cron: `15 11-23/3 * * *` (8h15, 11h15, 14h15, 17h15 e 20h15 BRT).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { cadastrarWebhookDoCofre, verWebhookDoCofre } from "@/lib/contracts/d4sign";
import { carregarConfigD4Sign, urlDoWebhookD4Sign } from "@/lib/contracts/d4sign-config";
import { consultarCofre } from "@/lib/contracts/assinatura";

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const webhook = req.nextUrl.searchParams.get("webhook");

  if (webhook) {
    const cfg = await carregarConfigD4Sign();
    if (!cfg?.cofre) return NextResponse.json({ ok: false, erro: "Faltam o token e o cofre da D4Sign (Configurações › Jurídico, ou D4SIGN_* no servidor)" }, { status: 400 });
    if (webhook === "ver") {
      const r = await verWebhookDoCofre(cfg, cfg.cofre);
      return NextResponse.json(r.ok ? { ok: true, webhook: r.dados } : { ok: false, erro: r.erro }, { status: r.ok ? 200 : 502 });
    }
    if (webhook === "cadastrar") {
      const url = urlDoWebhookD4Sign();
      if (dry) return NextResponse.json({ ok: true, dry, cadastraria: { type: "cofre", uuid: cfg.cofre, url } });
      const r = await cadastrarWebhookDoCofre(cfg, cfg.cofre, url);
      if (!r.ok) console.error("[contratos-d4sign] cadastro do webhook falhou:", r.erro);
      return NextResponse.json(r.ok ? { ok: true, url, resposta: r.dados } : { ok: false, erro: r.erro }, { status: r.ok ? 200 : 502 });
    }
    return NextResponse.json({ ok: false, erro: "webhook= aceita ver ou cadastrar" }, { status: 400 });
  }

  const r = await consultarCofre({ dry });
  const avisados = r.resultados.filter((x) => ["avisado", "avisaria", "parcial", "parcial_avisaria"].includes(x.acao));
  console.log(`[contratos-d4sign] cofre=${r.noCofre} lidos=${r.lidos} sobraram=${r.sobraram} avisos=${avisados.length} dry=${dry} erros=${r.erros.length}${r.desligado ? ` desligado=${r.desligado}` : ""}${r.adiado ? " adiado=cota" : ""}`);
  return NextResponse.json({
    ...r,
    mensagens: avisados.map((x) => x.mensagem),
    resultados: r.resultados.map((x) => ({
      uuid: x.uuid, acao: x.acao, status: x.status, nome: x.nome, vinculo: x.vinculo, assinadoEm: x.assinadoEm,
      resumo: x.resumo, motivo: x.motivo, ...(x.avisos ? { avisos: x.avisos } : {}),
    })),
  });
}
