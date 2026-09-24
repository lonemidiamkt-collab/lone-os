// app/api/system/cs-risco-semanal/route.ts — UM aviso semanal no grupo interno: os clientes em risco
// ou atenção (modelo único de saúde) e os que esfriaram, numa seção por dono, com o porquê de cada um.
// Substitui cs-esfriando + cs-risco da segunda (que continuam chamáveis). Regras em lib/cs/risco-semanal.ts.
//
// Fonte da nota: clients.current_health_* (escritor único /api/scores, 100 = saudável). Fonte do
// porquê: client_health_scores.breakdown.motivos da última data gravada (normalmente hoje).
// Pausado fica fora (lib/clients/pausa.ts) — não recebe nada, nem cobrança por ele.
//
//   ?dry=1 → devolve o texto exato (e a legenda, se for PDF) sem enviar.
//
// Cron: segunda `30 12 * * 1` (9h30 BRT), depois do cron-scores das 6h20 BRT.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { spNow, ymd } from "@/lib/cs/vigilancia";
import { estaPausado, hojeSP } from "@/lib/clients/pausa";
import { canonizarDono, SEM_DONO } from "@/lib/cs/cobranca-nominal";
import { nivelDaSaude, type NivelSaude } from "@/lib/scores/health";
import {
  agruparSemana, contar, textoRiscoSemanal, resumoRiscoSemanal, type ClienteSemana,
} from "@/lib/cs/risco-semanal";
import { avisoNominal } from "@/lib/cs/aviso-nominal";

const DIA_MS = 86_400_000;
const NIVEIS: NivelSaude[] = ["saudavel", "atencao", "risco", "sem_dado"];

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;

  const { data: clientes, error } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, status, assigned_social, assigned_traffic, current_health_score, current_health_level, last_client_msg_at, agente_ativo, active, churned_at, paused_at, paused_until")
    .neq("status", "churned").is("draft_status", null)
    .or("active.is.null,active.eq.true");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ativos = (clientes ?? []).filter((c) =>
    !/\(teste\)/i.test((c.name as string) || "") && !c.churned_at && !estaPausado(c as never));

  // O porquê: breakdown da última data gravada. Se o cron-scores falhou hoje, vale o de ontem —
  // e a resposta diz de quando é, pra ninguém ler motivo velho achando que é de hoje.
  const { data: ultimo } = await supabaseAdmin.from("client_health_scores")
    .select("computed_for_date").order("computed_for_date", { ascending: false }).limit(1).maybeSingle();
  const dataSaude = (ultimo?.computed_for_date as string | undefined) ?? null;
  const motivosPor = new Map<string, string[]>();
  if (dataSaude && ativos.length) {
    const { data: linhas, error: hErr } = await supabaseAdmin.from("client_health_scores")
      .select("client_id, breakdown").eq("computed_for_date", dataSaude)
      .in("client_id", ativos.map((c) => c.id as string));
    if (hErr) return NextResponse.json({ error: `client_health_scores: ${hErr.message}` }, { status: 500 });
    for (const h of linhas ?? []) {
      const b = (h.breakdown ?? {}) as { motivos?: unknown };
      motivosPor.set(h.client_id as string, Array.isArray(b.motivos) ? (b.motivos as unknown[]).map(String) : []);
    }
  }

  const { data: membros } = await supabaseAdmin.from("team_members").select("name");
  const time = (membros ?? []).map((m) => m.name as string).filter(Boolean);

  const agora = Date.now();
  const lista: ClienteSemana[] = ativos.map((c) => {
    const score = c.current_health_score != null ? Number(c.current_health_score) : null;
    const cache = c.current_health_level as string | null;
    const nivel: NivelSaude = cache && (NIVEIS as string[]).includes(cache) ? cache as NivelSaude : nivelDaSaude(score);
    const ultimaFala = c.last_client_msg_at as string | null;
    return {
      cliente: (c.nome_fantasia as string) || (c.name as string) || "Cliente",
      // Dono é o social da conta (como no cs-esfriando/cs-risco); cliente só-tráfego cai no tráfego.
      dono: canonizarDono((c.assigned_social as string) || (c.assigned_traffic as string) || null, time),
      nivel,
      score: Number.isFinite(score) ? score : null,
      motivos: motivosPor.get(c.id as string) ?? [],
      // Agente desligado no grupo = não dá pra afirmar que o cliente sumiu (mesma regra do cs-esfriando).
      diasQuieto: ultimaFala && c.agente_ativo !== false ? Math.floor((agora - new Date(ultimaFala).getTime()) / DIA_MS) : null,
    };
  });

  const now = spNow();
  // A semana começa na segunda: rodando em qualquer dia, o rótulo é o da segunda corrente.
  const segunda = new Date(now);
  segunda.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const semanaLabel = `${String(segunda.getDate()).padStart(2, "0")}/${String(segunda.getMonth() + 1).padStart(2, "0")}`;

  const blocos = agruparSemana(lista);
  const n = contar(lista);
  const detalhe = {
    saude_de: dataSaude, saude_de_hoje: dataSaude === hojeSP(),
    ...n,
    por_dono: blocos.map((b) => ({ dono: b.dono, clientes: b.clientes.length + b.resto, risco: b.risco })),
  };

  if (!blocos.length) {
    console.log(`[cs-risco-semanal] dia=${ymd(now)} ninguém pedindo atenção dry=${dry}`);
    return NextResponse.json({ ok: true, dry, enviado: false, skip: "ninguém em risco, atenção ou esfriando", ...detalhe });
  }

  const jid = process.env.CS_INTERNAL_GROUP_JID || null;
  const r = await avisoNominal({
    jid, dry,
    donos: blocos.filter((b) => b.dono !== SEM_DONO).map((b) => b.dono),
    titulo: "Clientes pedindo atenção",
    montar: (rotulo) => textoRiscoSemanal(lista, semanaLabel, rotulo),
    resumo: (rotulo) => resumoRiscoSemanal(lista, rotulo),
    // Sem `fatos`: a mensagem tem mais que esfriando, e o portão cala a mensagem INTEIRA quando todos
    // os fatos declarados já foram ditos — o risco da semana não pode sumir por carona.
    meta: { origem: "cs-risco-semanal", destino: "interno" },
  });

  console.log(`[cs-risco-semanal] dia=${ymd(now)} risco=${n.risco} atencao=${n.atencao} esfriando=${n.esfriando} formato=${r.formato} enviado=${r.enviado} dry=${dry}`);
  return NextResponse.json({
    ok: dry || !jid || r.enviado, dry, enviado: r.enviado, formato: r.formato,
    ...detalhe,
    mencionados: r.mencionados.length,
    ...(r.erro ? { aviso: r.erro } : {}),
    ...(jid ? {} : { sem_grupo: "CS_INTERNAL_GROUP_JID não configurado" }),
    legenda: r.legenda,
    texto: r.texto,
  });
}
