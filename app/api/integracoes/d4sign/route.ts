export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { conferirHmac, lerEventoWebhook } from "@/lib/contracts/d4sign";
import { carregarConfigD4Sign, registrarConferenciaDoAviso } from "@/lib/contracts/d4sign-config";
import { lidoHaPouco, processarDocumento, uuidValido } from "@/lib/contracts/assinatura";
import { isCronRequest } from "@/lib/api/cron-guard";
import { getServerUser } from "@/lib/supabase/auth-server";

// POST /api/integracoes/d4sign — o webhook 2.0 do cofre dos contratos na D4Sign. A cada assinatura (tipo 4) o
// Lone OS relê quem assinou e quem falta e o grupo de cadastro recebe "✍️ Cliente X: assinado por A · falta B";
// quando todos assinam (tipo 1), "✅ *Cliente X* assinou o contrato em dd/mm." — cada um UMA vez
// (lib/contracts/assinatura.ts). Cadastro do webhook: botão "Ligar o aviso da D4Sign" em Configurações › Jurídico.
//
// Rota pública (middleware). O evento NUNCA é acreditado: o documento é relido na D4Sign com a chave da conta
// antes de qualquer gravação ou aviso — é a leitura que diz quem assinou, não o evento.
//
// O código Content-Hmac ("sha256=" + 64 hex, do UUID com a Secret Key MAC) é conferido, mas não é mais porta
// fechada. Em 27/10/2026 o código não bateu com o segredo colado no painel e as 24 tentativas da D4Sign (o
// Matheus assinando Boali e Dominos) foram recusadas com 401 — e perdidas, porque a D4Sign desistiu em 3 h.
// Agora, código que não bate → relê mesmo assim, com teto de 4 releituras por hora (lib/contracts/d4sign-cota.ts:
// evento falso não gasta a cota de quem está esperando), sem confiar na data do evento, e o painel avisa que o
// segredo precisa ser colado de novo. Sem segredo nenhum configurado, a porta continua fechada (503).
//
// Respostas (a D4Sign repete o que não for 2xx — na prática, a cada 15 min por umas 3 h):
//   200 — processado (inclusive evento repetido, documento de outro cofre, ainda pendente, relido há pouco)
//   400 — corpo sem UUID de documento
//   503 — não deu agora e vale repetir: D4Sign/banco não leu, cota da hora, WhatsApp falhou, integração desligada
//
//   ?dry=1 (cron ou admin logado) → o que aconteceria: lê a D4Sign e o banco, devolve a mensagem, não grava
//   nem manda nada. Corpo igual ao da D4Sign (uuid=…), sem precisar do Content-Hmac.

export async function GET() {
  return NextResponse.json({ ok: true, servico: "webhook D4Sign (contrato assinado)", ligado: !!(await carregarConfigD4Sign()) });
}

export async function POST(req: NextRequest) {
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  if (dry && !isCronRequest(req) && !(await getServerUser(req))?.isAdmin) {
    return NextResponse.json({ error: "Ensaio só para o cron ou para admin" }, { status: 401 });
  }

  const cfg = await carregarConfigD4Sign();
  if (!cfg) {
    console.error("[d4sign/webhook] chegou evento com a integração desligada (sem o token da D4Sign no painel nem no servidor)");
    return NextResponse.json({ ok: false, erro: "D4Sign não configurada no Lone OS" }, { status: 503 });
  }

  const evento = await lerEventoWebhook(req);
  if (!evento || !uuidValido(evento.uuid)) {
    return NextResponse.json({ ok: false, erro: "evento sem UUID de documento" }, { status: 400 });
  }
  // Sem o segredo do webhook não há como saber que o evento veio da D4Sign — e cada evento gasta uma das 10
  // chamadas da hora para reler o documento. Então a porta fica fechada até o segredo existir.
  if (!dry && !cfg.hmac) {
    console.error("[d4sign/webhook] evento recusado: falta o segredo do webhook (Secret Key MAC)");
    return NextResponse.json({ ok: false, erro: "falta o segredo do webhook (Secret Key MAC) no Lone OS" }, { status: 503 });
  }
  let conferido = true;
  if (!dry) {
    const conf = conferirHmac(evento.uuid, req.headers.get("content-hmac"), cfg.hmac!);
    await registrarConferenciaDoAviso(conf);
    if (!conf.ok) {
      conferido = false;
      console.error(`[d4sign/webhook] código do aviso não confere com o segredo do painel (documento ${evento.uuid}, chegou ${conf.recebido}) — relendo na D4Sign mesmo assim`);
      // A D4Sign manda um evento por assinatura e repete os que falham: o mesmo documento relido há menos de 1 min
      // não gasta outra chamada.
      if (await lidoHaPouco(evento.uuid)) {
        return NextResponse.json({ ok: true, tipo: evento.tipo, acao: "relido_ha_pouco", conferido });
      }
    } else if (conf.variante !== "hmac") {
      console.warn(`[d4sign/webhook] código do aviso bateu pela variante ${conf.variante} (não pelo HMAC padrão)`);
    }
  }

  const r = await processarDocumento(evento.uuid, {
    origem: "webhook", dry, cfg,
    // Sem o código conferido, a data do evento não vale (a leitura traz a de cada signatário) e a releitura tem teto.
    quandoEvento: conferido ? evento.quando : null,
    ...(conferido ? {} : { origemChamada: "aviso" as const }),
  });
  if (!r.ok) console.error(`[d4sign/webhook] ${evento.uuid} (tipo ${evento.tipo ?? "?"}): ${r.motivo}`);
  else if (r.acao === "avisado") console.log(`[d4sign/webhook] ${r.nome}: aviso no grupo de cadastro`);
  return NextResponse.json({ dry, tipo: evento.tipo, conferido, ...r }, { status: !r.ok && r.tentarDeNovo ? 503 : 200 });
}
