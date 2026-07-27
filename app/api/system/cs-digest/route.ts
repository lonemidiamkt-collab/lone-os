// app/api/system/cs-digest/route.ts — os DOIS BLOCOS que substituem a enxurrada.
//
//   ?bloco=manha   → o que fazer hoje          (sugestão: 0 11 * * 1-5 = 8h BRT)
//   ?bloco=tarde   → o que ficou + amanhã      (sugestão: 0 20 * * 1-5 = 17h BRT)
//   ?preview=1     → calcula e devolve o texto, NÃO posta
//
// Trava `cs_digest_enabled` (default FALSE): enquanto estiver desligada, esta rota só existe pra
// preview e os crons antigos seguem intactos. Ligar só depois que o Roberto ler o preview — se
// eu desligasse os 12 crons antes disso, o time ficaria sem aviso nenhum caso o digest falhe.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";
import { montarSnapshotCS } from "@/lib/cs/snapshot";
import { montarDigest, type Bloco, type ItemAcao } from "@/lib/cs/digest";
import { spNow, ymd, isBusinessDay } from "@/lib/cs/vigilancia";
import { proximasDatas, formatDataCurta } from "@/lib/cs/datas";

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

async function digestLigado(): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin.from("agency_settings").select("value").eq("key", "cs_digest_enabled").maybeSingle();
    return (data?.value ?? "false") === "true";
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;

  const bloco: Bloco = req.nextUrl.searchParams.get("bloco") === "tarde" ? "tarde" : "manha";
  const previewOnly = req.nextUrl.searchParams.get("preview") !== null;

  const agora = spNow();
  if (!previewOnly && !(await isBusinessDay(agora))) {
    return NextResponse.json({ ok: true, skip: "fora de dia útil", dia: ymd(agora) });
  }

  const snap = await montarSnapshotCS();
  const itens: ItemAcao[] = [];

  // ── O que vira AÇÃO. Peso = urgência real, não categoria. ──────────────────

  // Atraso com arte já pronta é o mais caro: o trabalho foi feito e está parado na mão do social.
  for (const a of snap.prontasPraPostar) {
    itens.push({
      responsavel: a.responsavel, cliente: a.cliente, peso: 100 + a.dias,
      texto: `arte pronta há ${a.dias}d, falta postar — _${a.titulo}_`,
    });
  }
  // Atraso onde a arte ainda não saiu: cobra a produção.
  for (const a of snap.atrasados.filter((x) => !x.designerEntregou)) {
    itens.push({
      responsavel: a.responsavel, cliente: a.cliente, peso: 90 + a.dias,
      texto: `prazo vencido há ${a.dias}d e a arte não saiu — _${a.titulo}_`,
    });
  }
  // Sugestão do agente esperando ok/não — a fila de 58 nasceu de ninguém decidir.
  for (const p of snap.pendentes) {
    itens.push({
      responsavel: p.responsavel ?? null, cliente: p.cliente, peso: 60 + p.dias,
      texto: `esperando seu ok/não há ${p.dias}d — _${p.resumo}_ (\`${p.codigo}\`)`,
    });
  }
  // Cliente que falava e sumiu.
  for (const e of snap.esfriando) {
    itens.push({ responsavel: null, cliente: e.cliente, peso: 40 + e.dias, texto: `sem falar há ${e.dias}d — vale um oi` });
  }
  // Semana sem nenhum post planejado — cai no social da conta, não numa lista solta de 35 nomes.
  for (const s of snap.semPostsSemana) {
    itens.push({ responsavel: s.social ?? null, cliente: s.nome, peso: 30, texto: `sem post planejado ${snap.semPostsLabel}` });
  }

  // formatDataCurta já devolve "*Nome* — dom 09/08" pronto.
  const datas = proximasDatas(agora, 10).slice(0, 2).map(formatDataCurta);

  // Bloco da tarde: o que preparar pra amanhã (os cards de amanhã que ainda não têm arte).
  const amanha: string[] = [];
  if (bloco === "tarde") {
    for (const a of snap.atrasados.filter((x) => x.dias === 0)) amanha.push(`${a.cliente} — _${a.titulo}_`);
  }

  const dia = `${DIAS_SEMANA[agora.getDay()]}, ${ymd(agora).slice(8, 10)}/${ymd(agora).slice(5, 7)}`;
  const texto = montarDigest(bloco, dia, {
    itens,
    contexto: {
      emProducao: snap.emProducao, aguardandoAprovacao: snap.aguardandoAprovacao,
      encalhados: snap.encalhados, novosHoje: snap.novosHoje,
    },
    datas,
    amanha,
  });

  const ligado = await digestLigado();
  const jid = process.env.CS_INTERNAL_GROUP_JID;
  let postada = false;
  if (texto && ligado && jid && !previewOnly) {
    const r = await csSendGroupText(jid, texto, undefined, { origem: `digest-${bloco}`, destino: "interno" });
    postada = r.ok;
  }

  return NextResponse.json({
    ok: true, bloco, ligado, postada, itens: itens.length,
    pessoas: [...new Set(itens.map((i) => i.responsavel ?? "sem dono"))],
    preview: texto || "(dia limpo — nada a dizer)",
  });
}
