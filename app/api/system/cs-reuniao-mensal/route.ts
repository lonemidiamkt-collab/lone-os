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
  decidirAcao, HORA_OFERTA, type ClienteCiclo,
} from "@/lib/cs/reuniao-mensal";
import {
  sugerirHorarios, textoOfertaTentativa, textoPassarProSocial, textoCobrarSocial,
  textoLembreteCliente,
} from "@/lib/cs/agendar-reuniao";
import { porExtenso as extenso } from "@/lib/cs/parse-horario";

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
    .select("id, client_id, title, start_at, responsavel, lembrete_vespera_em, lembrete_hora_em, lembrete_cliente_vespera_em, lembrete_cliente_hora_em, clients(name, nome_fantasia, whatsapp_group_jid)")
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

  // Mapa id-da-reunião → grupo do cliente, para lembrar os dois lados.
  const grupoDaReuniao = new Map<string, string | null>(
    (agendadas ?? []).map((m) => {
      const c = m.clients as unknown as { whatsapp_group_jid?: string } | null;
      return [m.id as string, c?.whatsapp_group_jid ?? null];
    }),
  );
  const jaLembrouCliente = new Map<string, { vespera: boolean; hora: boolean }>(
    (agendadas ?? []).map((m) => [m.id as string, {
      vespera: !!m.lembrete_cliente_vespera_em, hora: !!m.lembrete_cliente_hora_em,
    }]),
  );

  const lembretesEnviados: string[] = [];
  for (const l of lembretes) {
    const quandoTxt = porExtenso(l.quando);
    const m = l.responsavel ? await mencionar(l.responsavel).catch(() => ({ trecho: "", jids: [] as string[] })) : { trecho: "", jids: [] as string[] };

    // ── 1a. EQUIPE ────────────────────────────────────────────────────────
    if (!dry && internalJid) {
      const r = await csSendGroupText(internalJid, textoLembrete(l, quandoTxt, m.trecho), undefined,
        { origem: "cs-reuniao-lembrete", destino: "interno" }, m.jids);
      if (r.ok) {
        // Marca ANTES de qualquer outra coisa dar errado: repetir o lembrete é pior que perdê-lo.
        await supabaseAdmin.from("meetings")
          .update(l.tipo === "vespera"
            ? { lembrete_vespera_em: new Date().toISOString() }
            : { lembrete_hora_em: new Date().toISOString() })
          .eq("id", l.clientId);
        lembretesEnviados.push(`equipe:${l.cliente}/${l.tipo}`);
      }
    } else {
      lembretesEnviados.push(`(dry) equipe:${l.cliente}/${l.tipo}`);
    }

    // ── 1b. CLIENTE ───────────────────────────────────────────────────────
    // Roberto: "lembra o cliente 1 dia antes e 1h antes no grupo do cliente". É o lembrete que faz
    // a reunião acontecer — sem ele, o compromisso existe só na agenda da agência.
    const grupoCli = grupoDaReuniao.get(l.clientId);
    const feito = jaLembrouCliente.get(l.clientId);
    const jaMandou = l.tipo === "vespera" ? feito?.vespera : feito?.hora;
    if (grupoCli && !jaMandou) {
      if (!dry) {
        const rc = await csSendGroupText(grupoCli, textoLembreteCliente(quandoTxt, l.tipo), undefined,
          { origem: "cs-reuniao-lembrete-cliente", destino: "cliente" });
        if (rc.ok) {
          await supabaseAdmin.from("meetings")
            .update(l.tipo === "vespera"
              ? { lembrete_cliente_vespera_em: new Date().toISOString() }
              : { lembrete_cliente_hora_em: new Date().toISOString() })
            .eq("id", l.clientId);
          lembretesEnviados.push(`cliente:${l.cliente}/${l.tipo}`);
        }
      } else {
        lembretesEnviados.push(`(dry) cliente:${l.cliente}/${l.tipo}`);
      }
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
    .select("id, name, nome_fantasia, assigned_social, service_type, status, whatsapp_group_jid")
    .or("active.is.null,active.eq.true")
    .eq("agente_ativo", true)
    .neq("status", "onboarding");

  // Reunião mensal é de quem tem acompanhamento. Cliente só de anúncio não entra na roda de
  // social — cobrar reunião dele inventaria pendência.
  const elegiveis = (clientes ?? []).filter((c) =>
    !/\(teste\)/i.test((c.name as string) || "") && !!c.assigned_social);

  const { data: doMes } = await supabaseAdmin
    .from("meetings")
    .select("id, client_id, estado, start_at, proposto_em, tentativas, ofertado_em, perguntado_social_em, horario_proposto")
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
      tentativas: Number(m?.tentativas ?? 0),
      ofertadoEm: (m?.ofertado_em as string) ?? null,
      perguntadoAoSocialEm: (m?.perguntado_social_em as string) ?? null,
    };
  });

  // ── 3. O AGENTE AGE: oferta, reoferta, entrega ao social, cobra ─────────
  //
  // Roberto: "ele pode mandar todo dia oito horas da manhã já perguntando". A oferta sai UMA vez
  // por dia, na primeira rodada da manhã — o cron roda de hora em hora por causa dos lembretes, e
  // sem esta trava o mesmo cliente receberia oferta nove vezes.
  const horaAgora = agora.getHours();
  const podeOfertar = horaAgora >= HORA_OFERTA && horaAgora < HORA_OFERTA + 1;
  const grupoDoCliente = new Map(elegiveis.map((c) => [c.id as string, (c.whatsapp_group_jid as string) || null]));
  const idReuniao = new Map((doMes ?? []).map((m) => [m.client_id as string, m.id as string]));
  const acoes: string[] = [];

  for (const c of ciclo) {
    const acao = decidirAcao(c, janela, agora);
    if (acao.tipo === "nada") continue;

    const grupoCli = grupoDoCliente.get(c.clientId);
    const agoraIso = new Date().toISOString();

    // ── Ofertar / reofertar no grupo do cliente ──────────────────────────
    if (acao.tipo === "ofertar" || acao.tipo === "reofertar") {
      if (!podeOfertar || !grupoCli) continue;
      // Sugere dentro da janela: a reunião deve caber no próprio ciclo sempre que der.
      const opcoes = sugerirHorarios(agora, 2, janela.fecha);
      const texto = textoOfertaTentativa(c.cliente, opcoes.map((o) => o.texto), acao.tentativa);
      if (dry) { acoes.push(`(dry) ofertar#${acao.tentativa} ${c.cliente}`); continue; }

      const r = await csSendGroupText(grupoCli, texto, undefined,
        { origem: "cs-reuniao-oferta", destino: "cliente", clientId: c.clientId });
      if (!r.ok) { acoes.push(`FALHA ofertar ${c.cliente}: ${r.error}`); continue; }

      await supabaseAdmin.from("meetings").upsert({
        client_id: c.clientId,
        title: `Reunião mensal — ${c.cliente}`,
        meeting_type: "mensal",
        mes_referencia: janela.mes,
        estado: "ofertada",
        responsavel: c.responsavel,
        tentativas: acao.tentativa,
        ofertado_em: agoraIso,
        group_jid: grupoCli,
        // start_at é NOT NULL na tabela: sem horário fechado, marca o fim da janela como
        // provisório. O que diz se a reunião existe é o `estado`, não esta data.
        start_at: `${janela.fecha}T12:00:00-03:00`,
        end_at: `${janela.fecha}T13:00:00-03:00`,
        status: "scheduled",
        created_by: "agente-cs",
      }, { onConflict: "client_id,mes_referencia" });
      acoes.push(`ofertou#${acao.tentativa} ${c.cliente}`);
      await new Promise((r2) => setTimeout(r2, 1500));
      continue;
    }

    // ── Entregar a conversa ao social ────────────────────────────────────
    if (acao.tipo === "passar_pro_social") {
      if (!internalJid) continue;
      const m = c.responsavel ? await mencionar(c.responsavel).catch(() => ({ trecho: "", jids: [] as string[] })) : { trecho: "", jids: [] as string[] };
      const texto = textoPassarProSocial(c.cliente, acao.motivo, m.trecho);
      if (dry) { acoes.push(`(dry) passar ${c.cliente}`); continue; }
      const r = await csSendGroupText(internalJid, texto, undefined,
        { origem: "cs-reuniao-entrega", destino: "interno" }, m.jids);
      if (r.ok) {
        const id = idReuniao.get(c.clientId);
        if (id) await supabaseAdmin.from("meetings")
          .update({ estado: "pendente", entregue_ao_social_em: agoraIso }).eq("id", id);
        acoes.push(`entregou ao social: ${c.cliente}`);
        await new Promise((r2) => setTimeout(r2, 1200));
      }
      continue;
    }

    // ── Cobrar o social que não respondeu ao horário do cliente ──────────
    if (acao.tipo === "cobrar_social") {
      if (!internalJid) continue;
      const id = idReuniao.get(c.clientId);
      const prop = (doMes ?? []).find((x) => x.client_id === c.clientId)?.horario_proposto as string | undefined;
      const m = c.responsavel ? await mencionar(c.responsavel).catch(() => ({ trecho: "", jids: [] as string[] })) : { trecho: "", jids: [] as string[] };
      const texto = textoCobrarSocial(c.cliente, prop ? extenso(prop) : "o horário pedido", acao.diasEsperando, m.trecho);
      if (dry) { acoes.push(`(dry) cobrar social ${c.cliente}`); continue; }
      const r = await csSendGroupText(internalJid, texto, undefined,
        { origem: "cs-reuniao-cobra-social", destino: "interno" }, m.jids);
      if (r.ok) {
        // Reinicia o relógio: senão a mesma cobrança sairia todo dia até alguém responder.
        if (id) await supabaseAdmin.from("meetings").update({ perguntado_social_em: agoraIso }).eq("id", id);
        acoes.push(`cobrou social: ${c.cliente}`);
        await new Promise((r2) => setTimeout(r2, 1200));
      }
    }
  }

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
    acoes,
    preview: cobrancas[0] ? textoCobranca(cobrancas[0], janela, "") : null,
  });
}
