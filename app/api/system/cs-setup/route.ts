// app/api/system/cs-setup/route.ts — cobrança do SETUP DOS 7 DIAS + marcos de contrato.
// Playbook: docs/PLAYBOOK_SOCIAL.md §13 e §14. A lógica mora em lib/cs/setup-cobranca.ts
// (a manhã unificada, cs-manha, monta a mesma seção).
//
//   ?preview=1   → calcula e devolve, NÃO posta, NÃO cria tarefa e NÃO queima o aviso de marco
//   ?promover=1  → aplica a graduação de onboarding nos clientes que já cumpriram a regra
//
// Cron sugerido: dias úteis de manhã (`0 12 * * 1-5` = 9h BRT).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { executarCobrancaSetup } from "@/lib/cs/setup-cobranca";

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const previewOnly = req.nextUrl.searchParams.get("preview") !== null;
  const promover = req.nextUrl.searchParams.get("promover") === "1";
  // `?sem_post=1` aplica as mudanças SEM postar no grupo. Existe porque promover e falar eram a
  // mesma coisa: arrumar dado fora do horário do cron não devia custar uma notificação a ninguém.
  const semPost = req.nextUrl.searchParams.get("sem_post") === "1";

  const r = await executarCobrancaSetup({ aplicar: !previewOnly, promover, marcarMarcos: !previewOnly });
  if (r.semOnboarding) return NextResponse.json({ ok: true, status: "sem cliente em onboarding" });

  const texto = r.texto;
  const jid = process.env.CS_INTERNAL_GROUP_JID;
  let postada = false;
  let formatoUsado: "texto" | "pdf" = "texto";
  if (texto && jid && !previewOnly && !semPost) {
    // Este aviso tinha média de 1.343 caracteres — 10 dos 11 últimos envios foram cortados pelo
    // WhatsApp com "Ler mais". `enviarAviso` decide texto ou PDF pelo volume. Ver lib/cs/enviar-aviso.ts.
    const { enviarAviso } = await import("@/lib/cs/enviar-aviso");
    const envio = await enviarAviso(jid, texto, {
      titulo: "Setup de cliente novo",
      arquivo: "Setup de cliente novo",
      resumo: r.resumo,
    }, {
      origem: "setup-7dias", destino: "interno",
      fatos: r.fatos,
    });
    postada = envio.ok;
    formatoUsado = envio.formato;
  }

  return NextResponse.json({
    ok: true, postada, formato: formatoUsado,
    em_setup: r.emSetup,
    ja_graduaram: r.graduaram,
    promovidos: promover ? r.promovidos : "(passe ?promover=1 pra aplicar)",
    tarefas_criadas: r.criadas,
    // O que o sistema fechou sozinho, com a prova — um "feito" automático que ninguém consegue
    // conferir vira desconfiança.
    tarefas_fechadas_por_prova: r.autoFechadas,
    atrasos_com_causa: r.atrasos,
    marcos: r.marcos,
    preview: texto || "(setup em dia e nenhum marco hoje)",
  });
}
