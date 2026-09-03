export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireCron } from "@/lib/api/cron-guard";
import { csSendGroupText } from "@/lib/cs/notify";
import { spNow, isBusinessDay, isBusinessHour } from "@/lib/cs/vigilancia";
import { mencionar } from "@/lib/cs/mencao";
import { porExtenso } from "@/lib/cs/parse-horario";
import {
  janelaDoMes, montarCobranca, textoCobranca, lembretesDevidos, textoLembrete,
  type ClienteCiclo,
} from "@/lib/cs/reuniao-mensal";

// POST /api/system/cs-reuniao-mensal — o ciclo mensal de reuniões com o cliente.
//
// Faz duas coisas por rodada, porque são o mesmo assunto e separá-las em dois crons dobraria as
// mensagens no grupo:
//   1. LEMBRETES das reuniões já agendadas (véspera e uma hora antes) — todo dia útil, de hora
//      em hora.
//   2. COBRANÇA de quem ainda não marcou — só dentro da janela (dia 15 a 22) e uma vez por dia.
//
// Cron sugerido: `0 11-20 * * 1-5` (8h às 17h BRT, de hora em hora).
//   ?dry=1 não posta · ?forcar=1 ignora o dedup diário da cobrança

export async function POST(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;
  const dry = req.nextUrl.searchParams.get("dry") !== null;
  const forcar = req.nextUrl.searchParams.get("forcar") === "1";

  const agora = spNow();
  const janela = janelaDoMes(agora);
  const internalJid = process.env.CS_INTERNAL_GROUP_JID || null;

  // ── 1. LEMBRETES ────────────────────────────────────────────────────────
  // Rodam sempre, inclusive fora da janela: uma reunião marcada dia 20 para o dia 28 precisa do
  // lembrete no dia 27, quando a janela já fechou.
  const { data: agendadas } = await supabaseAdmin
    .from("meetings")
    .select("id, client_id, title, start_at, responsavel, lembrete_vespera_em, lembrete_hora_em, clients(name, nome_fantasia)")
    .eq("estado", "agendada")
    .gte("start_at", new Date(agora.getTime() - 2 * 3600_000).toISOString())
    .lte("start_at", new Date(agora.getTime() + 3 * 86400_000).toISOString());

  const lembretes = lembretesDevidos(
    (agendadas ?? []).map((m) => {
      const c = m.clients as unknown as { name?: string; nome_fantasia?: string } | null;
      return {
        clientId: m.id as string,   // aqui o id é o da REUNIÃO: é ela que marcamos como lembrada
        cliente: c?.nome_fantasia || c?.name || (m.title as string) || "Cliente",
        responsavel: (m.responsavel as string) || null,
        quando: m.start_at as string,
        lembrouVespera: !!m.lembrete_vespera_em,
        lembrouUmaHora: !!m.lembrete_hora_em,
      };
    }),
    agora,
  );

  const lembretesEnviados: string[] = [];
  for (const l of lembretes) {
    const m = l.responsavel ? await mencionar(l.responsavel).catch(() => ({ trecho: "", jids: [] as string[] })) : { trecho: "", jids: [] as string[] };
    const texto = textoLembrete(l, porExtenso(l.quando), m.trecho);
    if (!dry && internalJid) {
      const r = await csSendGroupText(internalJid, texto, undefined,
        { origem: "cs-reuniao-lembrete", destino: "interno" }, m.jids);
      if (r.ok) {
        // Marca ANTES de qualquer outra coisa dar errado: repetir o lembrete é pior que perdê-lo.
        await supabaseAdmin.from("meetings")
          .update(l.tipo === "vespera"
            ? { lembrete_vespera_em: new Date().toISOString() }
            : { lembrete_hora_em: new Date().toISOString() })
          .eq("id", l.clientId);
        lembretesEnviados.push(`${l.cliente}/${l.tipo}`);
      }
    } else {
      lembretesEnviados.push(`(dry) ${l.cliente}/${l.tipo}`);
    }
  }

  // ── 2. COBRANÇA DA JANELA ───────────────────────────────────────────────
  if (!janela.aberta) {
    return NextResponse.json({
      ok: true, janela: { ...janela }, lembretes: lembretesEnviados,
      cobranca: "fora da janela (dia 15 a 22)",
    });
  }
  // Cobrança é de horário comercial: ninguém marca reunião às 21h de sábado.
  if (!(await isBusinessDay(agora)) || !isBusinessHour(agora)) {
    return NextResponse.json({ ok: true, janela, lembretes: lembretesEnviados, cobranca: "fora do expediente" });
  }

  // Uma cobrança por dia. O cron roda de hora em hora por causa dos lembretes; sem este dedup,
  // a mesma lista sairia nove vezes.
  const hojeStr = agora.toISOString().slice(0, 10);
  if (!forcar && !dry) {
    const { data: jaHoje } = await supabaseAdmin.from("cs_outbound")
      .select("id").eq("origem", "cs-reuniao-cobranca").eq("dia", hojeStr).limit(1);
    if (jaHoje?.length) {
      return NextResponse.json({ ok: true, janela, lembretes: lembretesEnviados, cobranca: "já cobrado hoje" });
    }
  }

  const { data: clientes } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, assigned_social, service_type, status")
    .or("active.is.null,active.eq.true")
    .eq("agente_ativo", true)
    .neq("status", "onboarding");

  // Reunião mensal é de quem tem acompanhamento. Cliente só de anúncio não entra na roda de
  // social — cobrar reunião dele inventaria pendência.
  const elegiveis = (clientes ?? []).filter((c) =>
    !/\(teste\)/i.test((c.name as string) || "") && !!c.assigned_social);

  const { data: doMes } = await supabaseAdmin
    .from("meetings")
    .select("client_id, estado, start_at, proposto_em")
    .eq("mes_referencia", janela.mes)
    .eq("meeting_type", "mensal");
  const porCliente = new Map((doMes ?? []).map((m) => [m.client_id as string, m]));

  const ciclo: ClienteCiclo[] = elegiveis.map((c) => {
    const m = porCliente.get(c.id as string);
    return {
      clientId: c.id as string,
      cliente: (c.nome_fantasia as string) || (c.name as string) || "Cliente",
      responsavel: (c.assigned_social as string) || null,
      estado: (m?.estado as ClienteCiclo["estado"]) ?? "pendente",
      quando: (m?.start_at as string) ?? null,
      propostoEm: (m?.proposto_em as string) ?? null,
    };
  });

  const cobrancas = montarCobranca(ciclo, janela, agora);
  const postadas: string[] = [];
  for (const c of cobrancas) {
    const m = c.pessoa === "sem responsável"
      ? { trecho: "", jids: [] as string[] }
      : await mencionar(c.pessoa).catch(() => ({ trecho: "", jids: [] as string[] }));
    const texto = textoCobranca(c, janela, m.trecho);
    if (!dry && internalJid) {
      const r = await csSendGroupText(internalJid, texto, undefined,
        { origem: "cs-reuniao-cobranca", destino: "interno" }, m.jids);
      if (r.ok) postadas.push(c.pessoa);
      await new Promise((r2) => setTimeout(r2, 1200));
    } else {
      postadas.push(`(dry) ${c.pessoa}`);
    }
  }

  return NextResponse.json({
    ok: true,
    janela,
    lembretes: lembretesEnviados,
    cobrancas: cobrancas.map((c) => ({
      pessoa: c.pessoa, pendentes: c.pendentes.length, agendadas: c.agendadas,
      esperando_cliente: c.propostasSemResposta.length, intensidade: c.intensidade,
    })),
    postadas,
    preview: cobrancas[0] ? textoCobranca(cobrancas[0], janela, "") : null,
  });
}
