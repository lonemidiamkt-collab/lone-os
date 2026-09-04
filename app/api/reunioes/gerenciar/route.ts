export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// POST /api/reunioes/gerenciar — agendar, editar, escrever a pauta, anexar e cancelar.
//
// Roberto (04/09): "o social media não está tendo um lugar pra eles fazerem o cadastro das
// reuniões, agendar, colocar o briefing da reunião, anexar."
//
// Uma rota com `acao` em vez de cinco endpoints: são operações sobre o MESMO objeto, quase sempre
// feitas em sequência na mesma tela (agenda → escreve a pauta → anexa o material). Cinco rotas
// seriam cinco lugares para esquecer de gravar `responsavel` — que foi exatamente o defeito do
// agendador antigo, que salvava direto do navegador e não gerava lembrete nenhum.

type Acao = "agendar" | "editar" | "pauta" | "gerar_pauta" | "anexar" | "remover_anexo" | "cancelar" | "concluir";

interface Corpo {
  acao?: Acao;
  reuniaoId?: string;
  clientId?: string;
  titulo?: string;
  tipo?: string;
  inicio?: string;       // ISO
  fim?: string;          // ISO
  local?: string;
  descricao?: string;
  pauta?: string;
  /** anexar: arquivo já em base64 (o front lê o File e manda). */
  arquivo?: { nome: string; tipo: string; base64: string };
  /** remover_anexo */
  path?: string;
}

/** Duração padrão quando só o início é informado. */
const UMA_HORA = 3600_000;
/** Teto por arquivo. Anexo de reunião é briefing e apresentação, não vídeo bruto. */
const MAX_ANEXO = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const b = (await req.json().catch(() => null)) as Corpo | null;
  const acao = b?.acao;
  if (!acao) return NextResponse.json({ error: "acao é obrigatória" }, { status: 400 });

  // Nome de quem está agindo — o mesmo que resolve menção no WhatsApp, para o responsável da
  // reunião bater com quem o agente marca no grupo.
  const { data: membro } = await supabaseAdmin
    .from("team_members").select("name").eq("email", user.email).maybeSingle();
  const quem = (membro?.name as string) || user.email;

  // ── AGENDAR ─────────────────────────────────────────────────────────────
  if (acao === "agendar") {
    if (!b?.clientId || !b?.inicio) {
      return NextResponse.json({ error: "clientId e inicio são obrigatórios" }, { status: 400 });
    }
    const { data: cli } = await supabaseAdmin
      .from("clients").select("name, nome_fantasia, assigned_social").eq("id", b.clientId).maybeSingle();
    if (!cli) return NextResponse.json({ error: "cliente não encontrado" }, { status: 404 });
    const nomeCli = (cli.nome_fantasia as string) || (cli.name as string) || "Cliente";

    const inicio = new Date(b.inicio);
    if (Number.isNaN(inicio.getTime())) return NextResponse.json({ error: "data inválida" }, { status: 400 });
    const fim = b.fim ? new Date(b.fim) : new Date(inicio.getTime() + UMA_HORA);

    const { data, error } = await supabaseAdmin.from("meetings").insert({
      client_id: b.clientId,
      title: b.titulo?.trim() || `Reunião — ${nomeCli}`,
      description: b.descricao ?? null,
      meeting_type: b.tipo || "alinhamento",
      start_at: inicio.toISOString(),
      end_at: fim.toISOString(),
      location: b.local || "Online",
      // `estado` e `responsavel` são o que fazem a reunião existir para o resto do sistema:
      // sem eles ela não aparece na agenda nem gera lembrete — fica um registro mudo no banco.
      estado: "agendada",
      responsavel: (cli.assigned_social as string) || quem,
      status: "scheduled",
      created_by: quem,
      pauta: b.pauta?.trim() || null,
      ...(b.pauta?.trim() ? { pauta_em: new Date().toISOString(), pauta_por: quem, pauta_origem: "manual" } : {}),
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // A ficha do cliente precisa saber da próxima — é o que serve para preparar.
    await supabaseAdmin.from("client_journey")
      .upsert({ client_id: b.clientId, proxima_reuniao: inicio.toISOString() }, { onConflict: "client_id" })
      .then(() => {}, () => {});

    return NextResponse.json({ ok: true, reuniaoId: data.id });
  }

  // As demais ações exigem a reunião.
  if (!b?.reuniaoId) return NextResponse.json({ error: "reuniaoId é obrigatório" }, { status: 400 });
  const { data: reu } = await supabaseAdmin
    .from("meetings").select("id, client_id, anexos, start_at, clients(name, nome_fantasia, nicho)")
    .eq("id", b.reuniaoId).maybeSingle();
  if (!reu) return NextResponse.json({ error: "reunião não encontrada" }, { status: 404 });

  // ── EDITAR ──────────────────────────────────────────────────────────────
  if (acao === "editar") {
    const patch: Record<string, unknown> = {};
    if (b.titulo !== undefined) patch.title = b.titulo;
    if (b.descricao !== undefined) patch.description = b.descricao;
    if (b.tipo !== undefined) patch.meeting_type = b.tipo;
    if (b.local !== undefined) patch.location = b.local;
    if (b.inicio) {
      const i = new Date(b.inicio);
      if (Number.isNaN(i.getTime())) return NextResponse.json({ error: "data inválida" }, { status: 400 });
      patch.start_at = i.toISOString();
      patch.end_at = (b.fim ? new Date(b.fim) : new Date(i.getTime() + UMA_HORA)).toISOString();
      // Mudou a data: os lembretes já enviados não valem mais para o horário novo.
      patch.lembrete_vespera_em = null;
      patch.lembrete_hora_em = null;
      patch.lembrete_cliente_vespera_em = null;
      patch.lembrete_cliente_hora_em = null;
    }
    const { error } = await supabaseAdmin.from("meetings").update(patch).eq("id", b.reuniaoId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── PAUTA escrita à mão ─────────────────────────────────────────────────
  if (acao === "pauta") {
    const { error } = await supabaseAdmin.from("meetings").update({
      pauta: b.pauta ?? null,
      pauta_em: new Date().toISOString(),
      pauta_por: quem,
      pauta_origem: "manual",
    }).eq("id", b.reuniaoId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── PAUTA gerada do estado do cliente ───────────────────────────────────
  if (acao === "gerar_pauta") {
    // Reusa o preparo que já existia (lib/cs/reuniao.ts) e nunca era acionado pela tela — só pelo
    // comando "Lone, prepara a reunião do X" no WhatsApp. Aqui ele vira botão.
    const { montarPrepReuniao, pontosPraReuniao } = await import("@/lib/cs/reuniao");
    const cli = reu.clients as unknown as { name?: string; nome_fantasia?: string; nicho?: string } | null;
    const nomeCli = cli?.nome_fantasia || cli?.name || "Cliente";

    // `montarJornada()` devolve a ficha de todos os clientes e não existe uma versão por cliente.
    // Filtrar aqui reusa a consolidação já testada (risco, pendências, dias sem falar) em vez de
    // recalcular tudo de novo com regra própria — que é como duas verdades diferentes nascem.
    let ficha: Parameters<typeof montarPrepReuniao>[0] | null = null;
    try {
      const { montarJornada } = await import("@/lib/cs/jornada");
      const todas = await montarJornada();
      const minha = todas.find((f) => f.clientId === reu.client_id);
      if (minha) {
        ficha = {
          nome: minha.nome, estado: minha.estado, risco: minha.risco,
          healthLevel: minha.healthLevel, healthScore: minha.healthScore,
          cardsAtrasados: minha.cardsAtrasados, pendenciasCliente: minha.pendenciasCliente,
          proximaAcao: minha.proximaAcao, diasSemFalar: minha.diasSemFalar,
          percebeValor: minha.percebeValor, ultimaReuniao: minha.ultimaReuniao,
        };
      }
    } catch { /* segue sem ficha */ }

    if (!ficha) {
      // Sem a ficha completa, o preparo ainda vale com o mínimo: é melhor uma pauta enxuta que
      // nenhuma, e quem lê edita.
      ficha = {
        nome: nomeCli, estado: "ativo", risco: { nivel: "baixo", motivos: [] },
        healthLevel: null, healthScore: null, cardsAtrasados: 0, pendenciasCliente: [],
        proximaAcao: null, diasSemFalar: null, percebeValor: true, ultimaReuniao: null,
      };
    }
    const pontos = await pontosPraReuniao(nomeCli, cli?.nicho, "reunião mensal de acompanhamento").catch(() => []);
    const texto = montarPrepReuniao(ficha, pontos);

    await supabaseAdmin.from("meetings").update({
      pauta: texto, pauta_em: new Date().toISOString(), pauta_por: quem, pauta_origem: "ia",
    }).eq("id", b.reuniaoId);
    return NextResponse.json({ ok: true, pauta: texto });
  }

  // ── ANEXAR ──────────────────────────────────────────────────────────────
  if (acao === "anexar") {
    const a = b.arquivo;
    if (!a?.base64 || !a?.nome) return NextResponse.json({ error: "arquivo é obrigatório" }, { status: 400 });
    const buf = Buffer.from(a.base64.replace(/^data:[^;]+;base64,/, ""), "base64");
    if (buf.length > MAX_ANEXO) {
      return NextResponse.json({ error: `arquivo acima de ${MAX_ANEXO / 1024 / 1024} MB` }, { status: 400 });
    }
    // Nome saneado, mas o original preservado no metadado: o caminho no bucket não pode ter
    // acento nem barra, e quem baixa espera ver o nome que enviou.
    const seguro = a.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\- ]/g, "_").slice(0, 80);
    const caminho = `${reu.client_id}/anexos/${b.reuniaoId}-${Date.now()}-${seguro}`;
    const { error: upErr } = await supabaseAdmin.storage.from("meeting-records")
      .upload(caminho, buf, { contentType: a.tipo || "application/octet-stream", upsert: false });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const atuais = Array.isArray(reu.anexos) ? (reu.anexos as unknown[]) : [];
    const novo = {
      path: caminho, nome: a.nome, tipo: a.tipo || "", tamanho: buf.length,
      enviado_em: new Date().toISOString(), enviado_por: quem,
    };
    const { error } = await supabaseAdmin.from("meetings")
      .update({ anexos: [...atuais, novo] }).eq("id", b.reuniaoId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, anexo: novo });
  }

  if (acao === "remover_anexo") {
    if (!b.path) return NextResponse.json({ error: "path é obrigatório" }, { status: 400 });
    await supabaseAdmin.storage.from("meeting-records").remove([b.path]).catch(() => {});
    const atuais = (Array.isArray(reu.anexos) ? reu.anexos : []) as { path: string }[];
    await supabaseAdmin.from("meetings")
      .update({ anexos: atuais.filter((x) => x.path !== b.path) }).eq("id", b.reuniaoId);
    return NextResponse.json({ ok: true });
  }

  // ── CANCELAR e CONCLUIR ─────────────────────────────────────────────────
  if (acao === "cancelar") {
    await supabaseAdmin.from("meetings")
      .update({ estado: "cancelada", status: "cancelled" }).eq("id", b.reuniaoId);
    return NextResponse.json({ ok: true });
  }
  if (acao === "concluir") {
    await supabaseAdmin.from("meetings").update({
      estado: "realizada", status: "completed", realizada_em: new Date().toISOString(),
    }).eq("id", b.reuniaoId);
    await supabaseAdmin.from("client_journey").upsert({
      client_id: reu.client_id as string,
      ultima_reuniao: (reu.start_at as string).slice(0, 10),
    }, { onConflict: "client_id" }).then(() => {}, () => {});
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: `ação desconhecida: ${acao}` }, { status: 400 });
}
