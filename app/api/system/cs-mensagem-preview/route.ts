// app/api/system/cs-mensagem-preview/route.ts — MODO REVISÃO da mensagem ao cliente.
//
// Gera as mensagens que o agente MANDARIA (a partir dos sinais reais de cada cliente) e devolve
// aqui, sem enviar nada. É o passo que o Roberto pediu: ele lê as mensagens de verdade antes de
// qualquer cliente receber. Só depois disso a trava `cs_msg_ia_enabled` é ligada.
//
//   ?dia=quarta|sexta  (default: quarta)
//   ?n=8               quantos clientes (default 8, teto 25 pra não torrar cota de IA)
//   ?clientId=X        um cliente específico
//
// Não envia NADA e não grava NADA. Só lê.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { selectActiveClientsWithGroup, clientDisplayName } from "@/lib/traffic/weekly-report";
import { montarMensagemCliente, coletarSinais, descreverSinais } from "@/lib/cs/mensagem-cliente";
import { supportMessageFor, socialMessageFor } from "@/lib/traffic/support-message";

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;

  const url = new URL(req.url);
  const dia = url.searchParams.get("dia") === "sexta" ? "sexta" : "quarta";
  const onlyClientId = url.searchParams.get("clientId");
  const n = Math.min(parseInt(url.searchParams.get("n") || "8", 10) || 8, 25);

  const clients = (await selectActiveClientsWithGroup(onlyClientId)).filter((c) => c.whatsapp_group_jid);
  const alvo = onlyClientId ? clients : clients.slice(0, n);

  const resultados = [];
  for (const c of alvo) {
    const nome = clientDisplayName(c);
    // O texto neutro é o mesmo de hoje — serve de fallback E de comparação lado a lado.
    const neutro = c.meta_ad_account_id ? supportMessageFor(dia === "sexta" ? "fri" : "wed") : socialMessageFor(dia === "sexta" ? "fri" : "wed");
    const sinais = await coletarSinais(c.id);
    const m = await montarMensagemCliente(c.id, neutro, dia);
    resultados.push({
      cliente: nome,
      sinais: descreverSinais(sinais),
      origem: m.origem,
      motivo_neutro: m.motivoNeutro ?? null,
      mensagem: m.texto,
      texto_de_hoje: neutro,
    });
  }

  const comIa = resultados.filter((r) => r.origem === "ia").length;
  return NextResponse.json({
    ok: true, dia, avaliados: resultados.length,
    resumo: `${comIa} com assunto próprio · ${resultados.length - comIa} caíram no texto neutro`,
    resultados,
  });
}
