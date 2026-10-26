// app/api/system/contratos-d4sign/route.ts — a consulta de hora em hora do cofre dos contratos na D4Sign.
//
// O caminho principal é o webhook (/api/integracoes/d4sign). Esta consulta pega o que ele não trouxe
// (Lone OS fora do ar por mais de 27 h, webhook ainda não cadastrado) e guarda há quantos dias cada
// documento espera assinatura — é daí que sai a linha "Contrato sem assinatura" do resumo da manhã.
// A lógica é a mesma do webhook (lib/contracts/assinatura.ts): uma mensagem por documento, no grupo de
// cadastro, e assinatura antiga (a primeira leitura acha o histórico do cofre) entra em silêncio.
//
//   ?dry=1 ............... o que aconteceria: lê a D4Sign e o banco, devolve as mensagens, não grava nem manda
//   ?webhook=ver ......... a URL de webhook cadastrada hoje no cofre (só leitura)
//   ?webhook=cadastrar ... cadastra o webhook 2.0 do cofre apontando para este painel (com ?dry=1 só mostra)
//
// Integração desligada (sem D4SIGN_API_TOKEN/D4SIGN_CRYPT_KEY/D4SIGN_SAFE_UUID) devolve ok com `desligado`.
// Cron: `15 11-23 * * *` (de hora em hora, 8h15 às 20h15 BRT).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { cadastrarWebhookDoCofre, configD4Sign, verWebhookDoCofre } from "@/lib/contracts/d4sign";
import { consultarCofre } from "@/lib/contracts/assinatura";

const urlDoWebhook = () => `${(process.env.NEXT_PUBLIC_APP_URL || "https://painel.lonemidia.com").replace(/\/+$/, "")}/api/integracoes/d4sign`;

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const webhook = req.nextUrl.searchParams.get("webhook");

  if (webhook) {
    const cfg = configD4Sign();
    if (!cfg?.cofre) return NextResponse.json({ ok: false, erro: "Faltam D4SIGN_API_TOKEN, D4SIGN_CRYPT_KEY e D4SIGN_SAFE_UUID no .env da VPS" }, { status: 400 });
    if (webhook === "ver") {
      const r = await verWebhookDoCofre(cfg, cfg.cofre);
      return NextResponse.json(r.ok ? { ok: true, webhook: r.dados } : { ok: false, erro: r.erro }, { status: r.ok ? 200 : 502 });
    }
    if (webhook === "cadastrar") {
      const url = urlDoWebhook();
      if (dry) return NextResponse.json({ ok: true, dry, cadastraria: { type: "cofre", uuid: cfg.cofre, url } });
      const r = await cadastrarWebhookDoCofre(cfg, cfg.cofre, url);
      if (!r.ok) console.error("[contratos-d4sign] cadastro do webhook falhou:", r.erro);
      return NextResponse.json(r.ok ? { ok: true, url, resposta: r.dados } : { ok: false, erro: r.erro }, { status: r.ok ? 200 : 502 });
    }
    return NextResponse.json({ ok: false, erro: "webhook= aceita ver ou cadastrar" }, { status: 400 });
  }

  const r = await consultarCofre({ dry });
  const avisados = r.resultados.filter((x) => x.acao === "avisado" || x.acao === "avisaria");
  console.log(`[contratos-d4sign] cofre=${r.noCofre} lidos=${r.lidos} sobraram=${r.sobraram} avisos=${avisados.length} dry=${dry} erros=${r.erros.length}${r.desligado ? ` desligado=${r.desligado}` : ""}`);
  return NextResponse.json({
    ...r,
    mensagens: avisados.map((x) => x.mensagem),
    resultados: r.resultados.map((x) => ({
      uuid: x.uuid, acao: x.acao, status: x.status, nome: x.nome, vinculo: x.vinculo, assinadoEm: x.assinadoEm,
      motivo: x.motivo, ...(x.avisos ? { avisos: x.avisos } : {}),
    })),
  });
}
