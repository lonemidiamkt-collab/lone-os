export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { configD4Sign, hmacConfere, lerEventoWebhook } from "@/lib/contracts/d4sign";
import { processarDocumento, uuidValido } from "@/lib/contracts/assinatura";
import { isCronRequest } from "@/lib/api/cron-guard";
import { getServerUser } from "@/lib/supabase/auth-server";

// POST /api/integracoes/d4sign — o webhook 2.0 do cofre dos contratos na D4Sign. Quando o documento fecha
// todas as assinaturas, o grupo de cadastro recebe UMA mensagem: "✅ *Cliente X* assinou o contrato em dd/mm."
// (lib/contracts/assinatura.ts). Cadastro do webhook: POST /api/system/contratos-d4sign?webhook=cadastrar.
//
// Rota pública (middleware), protegida pela ASSINATURA da D4Sign: cabeçalho Content-Hmac = "sha256=" +
// HMAC-SHA256 do UUID do documento com D4SIGN_HMAC_SECRET. E o evento nunca é acreditado: o documento é
// relido na D4Sign com a chave da conta antes de qualquer gravação ou aviso.
//
// Respostas (a D4Sign repete o que não for 2xx por até 27 h):
//   200 — processado (inclusive evento repetido, documento de outro cofre, ainda pendente)
//   400 — corpo sem UUID de documento · 401 — assinatura não confere
//   503 — não deu agora e vale repetir: D4Sign/banco não leu, envio do WhatsApp falhou, integração desligada
//
//   ?dry=1 (cron ou admin logado) → o que aconteceria: lê a D4Sign e o banco, devolve a mensagem, não grava
//   nem manda nada. Corpo igual ao da D4Sign (uuid=…), sem precisar do Content-Hmac.

export async function GET() {
  return NextResponse.json({ ok: true, servico: "webhook D4Sign (contrato assinado)", ligado: !!configD4Sign() });
}

export async function POST(req: NextRequest) {
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  if (dry && !isCronRequest(req) && !(await getServerUser(req))?.isAdmin) {
    return NextResponse.json({ error: "Ensaio só para o cron ou para admin" }, { status: 401 });
  }

  const cfg = configD4Sign();
  if (!cfg) {
    console.error("[d4sign/webhook] chegou evento com a integração desligada (D4SIGN_API_TOKEN/D4SIGN_CRYPT_KEY)");
    return NextResponse.json({ ok: false, erro: "D4Sign não configurada no Lone OS" }, { status: 503 });
  }

  const evento = await lerEventoWebhook(req);
  if (!evento || !uuidValido(evento.uuid)) {
    return NextResponse.json({ ok: false, erro: "evento sem UUID de documento" }, { status: 400 });
  }
  if (cfg.hmac && !dry && !hmacConfere(evento.uuid, req.headers.get("content-hmac"), cfg.hmac)) {
    console.error(`[d4sign/webhook] assinatura não confere (documento ${evento.uuid})`);
    return NextResponse.json({ ok: false, erro: "assinatura do webhook não confere" }, { status: 401 });
  }

  const r = await processarDocumento(evento.uuid, { origem: "webhook", dry, quandoEvento: evento.quando, cfg });
  if (!r.ok) console.error(`[d4sign/webhook] ${evento.uuid} (tipo ${evento.tipo ?? "?"}): ${r.motivo}`);
  else if (r.acao === "avisado") console.log(`[d4sign/webhook] ${r.nome}: aviso no grupo de cadastro`);
  return NextResponse.json({ dry, tipo: evento.tipo, ...r }, { status: !r.ok && r.tentarDeNovo ? 503 : 200 });
}
