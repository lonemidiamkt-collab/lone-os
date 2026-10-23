export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { estaBloqueado, infoEtapa, statusDaEtapa, statusNaEtapa } from "@/lib/conteudo/etapas";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole, GESTAO, type Papel } from "@/lib/api/require-role";
import { comExecucao, anotar } from "@/lib/obs/correlacao";
import { csSendGroupImage } from "@/lib/cs/notify";
import {
  TIMEOUT_ARTE_MS, assinaturaDaPrevia, chaveDoEnvio, decidirEnvio, escolherArtesParaCliente,
  frasesDoQueFicaDeFora, mandarArtes, opcoesDeEnvio, podeEnviarAoCliente, resumoDoEnvio,
  situacaoDoEnvio, statusDoResultado, textoDoEnvio,
  type AnexoDoCard, type EnvioRegistrado, type ModoEnvio, type ResultadoArte,
} from "@/lib/cs/envio-aprovacao";

// /api/cs/enviar-aprovacao — o social/gestor CLICA e o CS manda as artes ENTREGUES do card pro
// GRUPO DO CLIENTE, com uma mensagem padronizada pedindo aprovação. Disparo 100% no clique humano.
// Sai pelo número do CS (monitor[IA], EVOLUTION_*_NEW) — que precisa estar no grupo do cliente.
//
//   GET  ?cardId=   → a PRÉVIA: artes que vão (miniaturas), o texto exato, o grupo, o que fica de
//                     fora, os envios anteriores e as opções (enviar / reenviar todas / só as que
//                     faltaram), cada uma com a assinatura do que foi mostrado.
//   POST { cardId, modo, previa } → manda o que a prévia mostrou.
//
// 21/10/2026 (auditoria de erro recuperável, 2.2 e 2.3) — o que mudou e por quê:
//  · só vai arte ENTREGUE e sem alteração pendente (antes ia a versão reprovada e o card pulava de
//    "Com o designer" para "Com o cliente" com o pedido de alteração aberto);
//  · o envio é registrado (card_envios_cliente) ANTES de mandar; o mesmo conjunto de artes só vai
//    de novo com "reenviar" explícito — clique duplo e repetição não duplicam no grupo do cliente;
//  · o texto nunca vai sozinho: é legenda da primeira arte que chega; sem arte, nada sai;
//  · a resposta diz exatamente o que saiu ("2 de 3 artes…"), arte a arte, e fica no card.
// Rede de segurança da regra: lib/cs/envio-aprovacao.ts (testada).

const PAPEIS: Papel[] = [...GESTAO, "social", "traffic"];

interface Contexto {
  card: Record<string, unknown>;
  clienteNome: string;
  jid: string;
  grupoNome: string;
  bloqueio: string | null;
  escolha: ReturnType<typeof escolherArtesParaCliente>;
  chave: string;
  texto: string;
  /** Envios DESTE conjunto de artes, do mais novo para o mais velho. */
  envios: EnvioRegistrado[];
  /** Último envio do card com OUTRO conjunto (ex.: a versão anterior). */
  outroConjunto: EnvioRegistrado | null;
}

type Falha = { status: number; error: string };

async function montarContexto(cardId: string): Promise<Contexto | Falha> {
  const { data: card, error: eCard } = await supabaseAdmin
    .from("content_cards")
    .select("id, title, image_url, client_id, client_name, designer_delivered_at, alteracao_pendente_em, archived_at, status, social_confirmed_at")
    .eq("id", cardId).maybeSingle();
  if (eCard) return { status: 500, error: `Não consegui ler o card: ${eCard.message}` };
  if (!card) return { status: 404, error: "Card não encontrado." };

  // Leitura que FALHA não vira "sem arte" nem "nunca enviado": a resposta seria mentira.
  const [cli, atts, entrega, envios] = await Promise.all([
    supabaseAdmin.from("clients").select("name, nome_fantasia, whatsapp_group_jid, whatsapp_group_name").eq("id", card.client_id as string).maybeSingle(),
    supabaseAdmin.from("card_attachments").select("id, url, position, tipo, delivery_id").eq("card_id", cardId).order("position", { ascending: true }),
    supabaseAdmin.from("creative_deliveries").select("id").eq("card_id", cardId).eq("status", "entregue")
      .order("version", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("card_envios_cliente").select("*").eq("card_id", cardId).order("criado_em", { ascending: false }).limit(30),
  ]);
  if (cli.error) return { status: 500, error: `Não consegui ler o cliente: ${cli.error.message}` };
  if (atts.error) return { status: 500, error: `Não consegui ler as artes do card: ${atts.error.message}` };
  if (entrega.error) return { status: 500, error: `Não consegui ler a entrega da arte: ${entrega.error.message}` };
  if (envios.error) return { status: 500, error: `Não consegui ler o registro de envios ao cliente: ${envios.error.message}` };

  const clienteNome = (cli.data?.nome_fantasia as string) || (cli.data?.name as string) || (card.client_name as string) || "Cliente";
  const jid = (cli.data?.whatsapp_group_jid as string) || "";
  const grupoNome = (cli.data?.whatsapp_group_name as string) || clienteNome;

  const escolha = escolherArtesParaCliente((atts.data ?? []) as AnexoDoCard[], (entrega.data?.id as string) ?? null, card.image_url as string | null);
  const chave = chaveDoEnvio(cardId, escolha.artes);
  const texto = textoDoEnvio(escolha.artes.length, chave);
  const todos = (envios.data ?? []) as EnvioRegistrado[];
  const desta = todos.filter((e) => e.chave === chave).sort((a, b) => b.tentativa - a.tentativa);
  const outroConjunto = todos.find((e) => e.chave !== chave) ?? null;

  const permissao = podeEnviarAoCliente({
    entregueEm: card.designer_delivered_at as string | null,
    alteracaoPendenteEm: card.alteracao_pendente_em as string | null,
    arquivadoEm: card.archived_at as string | null,
  });
  const bloqueio = !permissao.ok ? permissao.motivo
    : !jid ? `${clienteNome} não tem grupo de WhatsApp mapeado. Vincule em Configurações → Grupos.`
    : escolha.erro;

  return { card, clienteNome, jid, grupoNome, bloqueio, escolha, chave, texto, envios: desta, outroConjunto };
}

function resumoDoRegistro(e: EnvioRegistrado, agoraMs: number) {
  return {
    id: e.id, tentativa: e.tentativa, situacao: situacaoDoEnvio(e, agoraMs), enviadas: e.enviadas, total: e.total,
    quando: e.criado_em, por: e.enviado_por, resultado: e.resultado ?? [],
    resumo: e.status === "enviando" ? null : resumoDoEnvio(e.resultado ?? [], e.grupo_nome || "do cliente"),
  };
}

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS);
  if (gate instanceof NextResponse) return gate;
  const cardId = req.nextUrl.searchParams.get("cardId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(cardId)) return NextResponse.json({ error: "Card inválido." }, { status: 400 });

  const ctx = await montarContexto(cardId);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const agora = Date.now();
  const opcoes = ctx.bloqueio ? [] : opcoesDeEnvio(ctx.escolha.artes, ctx.texto, ctx.envios, agora).map((o) => ({
    modo: o.modo, artes: o.artes, texto: o.texto,
    previa: assinaturaDaPrevia({ chave: ctx.chave, jid: ctx.jid, plano: o }),
  }));
  return NextResponse.json({
    cardId,
    cliente: ctx.clienteNome,
    grupo: ctx.jid ? { nome: ctx.grupoNome, jid: ctx.jid } : null,
    bloqueio: ctx.bloqueio,
    artes: ctx.escolha.artes,
    texto: ctx.texto,
    fora: frasesDoQueFicaDeFora(ctx.escolha.fora, ctx.escolha.legado),
    envios: ctx.envios.map((e) => resumoDoRegistro(e, agora)),
    outroConjunto: ctx.outroConjunto ? resumoDoRegistro(ctx.outroConjunto, agora) : null,
    opcoes,
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, PAPEIS);
  if (gate instanceof NextResponse) return gate;
  const b = (await req.json().catch(() => ({}))) as { cardId?: string; previa?: string; modo?: ModoEnvio };
  if (!b.cardId) return NextResponse.json({ error: "cardId obrigatório" }, { status: 400 });
  if (!b.previa) return NextResponse.json({ error: "Abra a prévia e confirme por ela — o envio precisa saber o que você viu." }, { status: 400 });
  const cardId = b.cardId;

  return comExecucao({ origem: "cs:enviar-aprovacao", ator: gate.user.email, papel: gate.papel }, async () => {
    const ctx = await montarContexto(cardId);
    if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (ctx.bloqueio) return NextResponse.json({ error: ctx.bloqueio }, { status: 409 });

    const decisao = decidirEnvio(
      { chave: ctx.chave, jid: ctx.jid, artes: ctx.escolha.artes, texto: ctx.texto, envios: ctx.envios, agoraMs: Date.now() },
      { previa: b.previa, modo: b.modo },
    );
    if (!decisao.ok) return NextResponse.json({ error: decisao.motivo }, { status: 409 });
    const plano = decisao.plano;

    const { data: tm } = await supabaseAdmin.from("team_members").select("name").eq("email", gate.user.email).maybeSingle();
    const quem = (tm?.name as string) || (gate.user.email as string)?.split("@")[0] || "equipe";

    // REGISTRA ANTES DE MANDAR. Sem registro não há como barrar a repetição — então não manda.
    // O índice único (chave, tentativa) é a trava do clique duplo: a segunda requisição cai aqui.
    const { data: reg, error: eReg } = await supabaseAdmin.from("card_envios_cliente").insert({
      card_id: cardId, client_id: ctx.card.client_id ?? null, chave: ctx.chave, tentativa: plano.tentativa,
      modo: plano.modo, reenvio_de: plano.reenvioDe, grupo_jid: ctx.jid, grupo_nome: ctx.grupoNome,
      texto: plano.texto, artes: plano.artes, total: plano.artes.length, status: "enviando", enviado_por: quem,
    }).select("id").single();
    if (eReg || !reg) {
      if (eReg?.code === "23505") {
        return NextResponse.json({ error: "Este envio já foi disparado por outro clique. Atualize a prévia para ver o que saiu." }, { status: 409 });
      }
      anotar(`enviar-aprovacao: não registrou o envio (${eReg?.message ?? "sem linha"})`);
      return NextResponse.json({ error: `Não consegui registrar o envio (${eReg?.message ?? "erro"}). Nada foi mandado ao grupo.` }, { status: 500 });
    }
    const envioId = reg.id as string;

    const progresso = async (parcial: ResultadoArte[]) => {
      const { error } = await supabaseAdmin.from("card_envios_cliente")
        .update({ resultado: parcial, enviadas: parcial.filter((r) => r.ok).length }).eq("id", envioId);
      if (error) anotar(`enviar-aprovacao: progresso não gravado (${error.message})`);
    };
    const resultado = await mandarArtes(
      plano.artes, plano.texto,
      (url, legenda) => csSendGroupImage(ctx.jid, url, legenda, "arte.png", {
        timeoutMs: TIMEOUT_ARTE_MS, meta: { origem: "enviar-aprovacao", destino: "cliente", clientId: (ctx.card.client_id as string) ?? null },
      }),
      { aoProgredir: progresso },
    );
    const status = statusDoResultado(resultado);
    const enviadas = resultado.filter((r) => r.ok).length;
    const resumo = resumoDoEnvio(resultado, ctx.grupoNome);

    const fim = await supabaseAdmin.from("card_envios_cliente")
      .update({ status, enviadas, resultado, concluido_em: new Date().toISOString() }).eq("id", envioId);
    if (fim.error) anotar(`enviar-aprovacao: resultado final não gravado (${fim.error.message})`);

    // Rastro no card: o que saiu, por quem, e o que ficou de fora.
    const fora = frasesDoQueFicaDeFora(ctx.escolha.fora, ctx.escolha.legado);
    const reenvio = plano.modo === "faltantes" ? " — reenvio só das que faltavam" : plano.modo === "todas" ? " — reenvio" : "";
    await supabaseAdmin.from("card_comments").insert({
      card_id: cardId, author: "🤖 CS", role: "system",
      text: `📤 ${resumo} (por ${quem}${reenvio})${fora.length ? ` ${fora.join(" ")}` : ""}`,
    }).then(({ error }) => { if (error) anotar(`enviar-aprovacao: comentário não gravado (${error.message})`); });

    // AVANÇA o card: arte enviada ao cliente = conferida pelo social e agora com o CLIENTE aprovar.
    // Só pra frente, e só se alguma arte chegou. (A arte já foi checada como entregue e sem alteração.)
    let cardAtualizado: { status: string; social_confirmed_at: string | null } | null = null;
    let aviso: string | null = null;
    const st = ctx.card.status as string;
    if (enviadas > 0 && statusNaEtapa(st, "pauta", "com_designer", "revisao") && !estaBloqueado(st)) {
      const nowIso = new Date().toISOString();
      const social = (ctx.card.social_confirmed_at as string) || nowIso;
      const { error } = await supabaseAdmin.from("content_cards").update({
        status: statusDaEtapa("com_cliente"),
        social_confirmed_at: social,
        social_confirmed_by: quem,
        status_changed_at: nowIso,
      }).eq("id", cardId);
      if (error) {
        aviso = `As artes saíram, mas não consegui mover o card para "${infoEtapa("com_cliente").rotulo}" (${error.message}). Mova à mão.`;
      } else {
        cardAtualizado = { status: statusDaEtapa("com_cliente"), social_confirmed_at: social };
        await supabaseAdmin.from("card_comments").insert({
          card_id: cardId, author: "🤖 CS", role: "system",
          text: `➡️ Card movido pra *${infoEtapa("com_cliente").rotulo}* automaticamente (artes enviadas pro cliente).`,
        }).then(() => {}, () => {});
      }
    }

    anotar(`enviar-aprovacao ${cardId}: ${status} ${enviadas}/${resultado.length} (tentativa ${plano.tentativa}, ${plano.modo})`);
    const corpo = { ok: status === "enviado", status, enviadas, total: resultado.length, resumo, resultado, envioId, grupo: ctx.grupoNome, card: cardAtualizado, aviso };
    // Nada saiu (com certeza): é erro — a frase diz o que houve e que nada foi ao grupo. 424 (e não
    // 502) para a tela não confundir com "o painel caiu e não sei o que saiu".
    if (status === "falhou") return NextResponse.json({ ...corpo, error: resumo }, { status: 424 });
    return NextResponse.json(corpo);
  });
}
