// app/api/system/cs-setup/route.ts — cobrança do SETUP DOS 7 DIAS + marcos de contrato.
// Playbook: docs/PLAYBOOK_SOCIAL.md §13 e §14.
//
//   ?preview=1   → calcula e devolve, NÃO posta e NÃO cria tarefa
//   ?promover=1  → aplica a graduação de onboarding nos clientes que já cumpriram a regra
//
// Cron sugerido: dias úteis de manhã (`0 12 * * 1-5` = 9h BRT).
//
// Por que reusa `tasks`: o time já marca feito em /tarefas e o task-reminders já cobra prazo.
// Criar um mecanismo novo pra isso seria uma segunda fila pra ninguém olhar.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";
import { diagnosticar as diagnosticarAnuncio, paraCobrar, textoCobranca, textoIndefinidos } from "@/lib/cs/anuncio-no-ar";
import { fatoSemAnuncio } from "@/lib/cs/porta-voz";
import { getMetaToken } from "@/lib/traffic/sync-core";
import { spNow, ymd } from "@/lib/cs/vigilancia";
import {
  itensPara, tituloTarefa, montarCobrancaSetup, graduou, escopoDe, PREFIXO,
  type StatusSetup, type PapelSetup,
} from "@/lib/cs/setup-7dias";
import { contaAcessivel, verificarItens, motivosDeAtraso } from "@/lib/cs/setup-autoverificar";

// 15 dias, não 7. Roberto (02/09): "a gente tem quinze dias aí pra entregar". O playbook fala
// dos 7 primeiros dias como ritmo ideal; o PRAZO cobrado é de 15 — cobrar como atraso o que está
// no prazo é o que fez 14 dos 19 clientes em onboarding parecerem parados.
const DIAS_SETUP = 15;
const diasDesde = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const previewOnly = req.nextUrl.searchParams.get("preview") !== null;
  const promover = req.nextUrl.searchParams.get("promover") === "1";

  const agora = spNow();

  const { data: clientes } = await supabaseAdmin
    .from("clients")
    .select("id, name, nome_fantasia, status, created_at, meta_ad_account_id, assigned_traffic, assigned_social, assigned_designer, perfil_conteudo, service_type")
    .eq("status", "onboarding").is("draft_status", null).or("active.is.null,active.eq.true");

  const alvo = (clientes ?? []).filter((c) => !/\(teste\)/i.test((c.name as string) || ""));
  if (!alvo.length) return NextResponse.json({ ok: true, status: "sem cliente em onboarding" });

  const ids = alvo.map((c) => c.id as string);
  const trintaDias = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [{ data: cards }, { data: tarefas }, { data: gastos }] = await Promise.all([
    // `archived_at IS NULL` não é detalhe: card arquivado é trabalho DESCARTADO. Sem este filtro,
    // o UNAFER contava 5 artes entregues — as 5 arquivadas — e GRADUAVA como cliente pronto sem
    // ter nenhuma arte no ar. O mesmo valia para o Dr. Junior Vargas. A prova de entrega tem que
    // ser trabalho que existe hoje, não trabalho que existiu.
    supabaseAdmin.from("content_cards").select("client_id, designer_delivered_at")
      .in("client_id", ids).is("archived_at", null),
    supabaseAdmin.from("tasks").select("id, client_id, title, status").in("client_id", ids).ilike("title", `${PREFIXO}%`),
    // Anúncio RODANDO = houve gasto nos últimos 30 dias. Conta vinculada sem verba é conta parada.
    supabaseAdmin.from("metric_snapshots").select("client_id, spend").in("client_id", ids).gte("metric_date", trintaDias).gt("spend", 0),
  ]);
  const rodando = new Set((gastos ?? []).map((g) => g.client_id as string));

  // ── O acesso à conta é CONFERIDO na Meta, não presumido do cadastro ───────
  //
  // Roberto: "se o email da Lone Mídia, a conta do Facebook da Lone Mídia já tem a conta, então
  // significa que o Julio já fez. Se eu não tiver, então faz essa cobrança."
  //
  // `meta_ad_account_id` preenchido só prova que alguém digitou o ID. O que interessa é se a
  // conta responde à NOSSA credencial — é isso que separa "pediu o acesso" de "conseguiu".
  const tokenSetup = await getMetaToken();
  const acessoPorCliente = new Map<string, boolean | null>();
  if (tokenSetup) {
    const comConta = alvo.filter((c) => !!c.meta_ad_account_id);
    // Sequencial de propósito: são poucos clientes em onboarding e a Meta recusa rajada por app —
    // foi assim que o digest inteiro caiu uma vez por causa de uma conta só.
    for (const c of comConta) {
      acessoPorCliente.set(c.id as string, await contaAcessivel(c.meta_ad_account_id as string, tokenSetup));
    }
  }

  const entreguesPor = new Map<string, number>();
  for (const k of cards ?? []) {
    if (!k.designer_delivered_at) continue;
    const id = k.client_id as string;
    entreguesPor.set(id, (entreguesPor.get(id) ?? 0) + 1);
  }

  const status: StatusSetup[] = [];
  const graduaram: string[] = [];
  const promovidos: string[] = [];
  const criadas: string[] = [];
  const autoFechadas: string[] = [];
  const atrasos: { cliente: string; dias: number; motivos: string[] }[] = [];

  for (const c of alvo) {
    const id = c.id as string;
    const nome = (c.nome_fantasia as string) || (c.name as string);
    const dias = diasDesde(c.created_at as string);
    const contaVinculada = !!c.meta_ad_account_id;
    // O que ele CONTRATOU manda — não o que foi atribuído por engano. Paiva Shopp é só anúncio;
    // Dumar e Atlas são só Instagram. Cobrar bio/linktree de quem tem o próprio perfil, ou esperar
    // arte de quem não contrata arte, é cobrança que nunca fecha.
    const escopo = escopoDe(c.service_type as string);
    // Só cobra vídeo de quem o cadastro DIZ que grava. Com a regra invertida ("tudo que não é
    // arte"), os 45 clientes com perfil em branco viravam "grava vídeo" e recebiam a cobrança —
    // no banco só 6 têm perfil 'video'.
    const gravaVideo = (c.perfil_conteudo as string) === "video";
    const artesEntregues = entreguesPor.get(id) ?? 0;

    if (graduou({ escopo, contaVinculada, anuncioRodando: rodando.has(id), artesEntregues })) {
      graduaram.push(nome);
      if (promover && !previewOnly) {
        const { error } = await supabaseAdmin.from("clients").update({ status: "good" }).eq("id", id).select("id");
        if (!error) promovidos.push(nome);
      }
      continue; // quem já é cliente não entra na cobrança de setup
    }

    const itens = itensPara({ escopo, gravaVideo });
    const minhas = (tarefas ?? []).filter((t) => t.client_id === id);
    const donoDe: Record<PapelSetup, string | null> = {
      designer: (c.assigned_designer as string) || null,
      social: (c.assigned_social as string) || null,
      traffic: (c.assigned_traffic as string) || null,
    };

    const feitos: string[] = [];
    const abertos: StatusSetup["abertos"] = [];

    // O que o SISTEMA já consegue provar que está feito, sem depender de alguém marcar.
    const provas = {
      artesEntregues, metaAdAccountId: (c.meta_ad_account_id as string) || null,
      anuncioRodando: rodando.has(id), contaAcessivel: acessoPorCliente.get(id) ?? null,
    };
    const verificados = new Map(verificarItens(provas).map((v) => [v.chave, v]));

    for (const item of itens) {
      const titulo = tituloTarefa(item, nome);
      const existente = minhas.find((t) => (t.title as string) === titulo);
      const auto = verificados.get(item.chave);

      // Prova encontrada → o item está feito, mesmo que ninguém tenha marcado. E a TAREFA é
      // fechada junto: sem isso o task-reminders continua mandando PDF cobrando o que já existe,
      // que é exatamente a queixa que abriu este trabalho.
      if (auto?.feito) {
        feitos.push(item.titulo);
        if (existente && existente.status !== "done" && !previewOnly) {
          const { error } = await supabaseAdmin.from("tasks")
            .update({ status: "done", completed_at: new Date().toISOString() })
            .eq("id", existente.id as string).neq("status", "done").select("id");
          if (!error) autoFechadas.push(`${nome}: ${item.titulo} (${auto.prova})`);
        }
        continue;
      }

      if (existente) {
        if (existente.status === "done") feitos.push(item.titulo);
        else abertos.push({ titulo: item.titulo, papel: item.papel, responsavel: donoDe[item.papel] });
        continue;
      }
      // Não existe → cria (só dentro da janela; cliente antigo não ganha tarefa retroativa em massa).
      abertos.push({ titulo: item.titulo, papel: item.papel, responsavel: donoDe[item.papel] });
      if (!previewOnly && dias <= DIAS_SETUP) {
        const prazo = new Date(new Date(c.created_at as string).getTime() + DIAS_SETUP * 86400000);
        const { error } = await supabaseAdmin.from("tasks").insert({
          title: titulo, client_id: id, client_name: nome,
          // assigned_to é NOT NULL: sem dono definido, a tarefa vai pro papel e aparece como sem dono.
          assigned_to: donoDe[item.papel] || item.papel,
          role: item.papel, status: "pending", priority: "high",
          start_date: ymd(agora), due_date: prazo.toISOString().slice(0, 10),
          description: item.nota ?? null, created_by: "agente-cs",
        }).select("id");
        if (!error) criadas.push(`${nome}: ${item.titulo}`);
      }
    }

    // Passou dos 15 dias e ainda tem item aberto: a cobrança precisa dizer O QUE observou, não
    // só "pendente". "Não tem anúncio ativo e não tem verba" é acionável; "item de setup" não é.
    if (dias > DIAS_SETUP && abertos.length) {
      const mots = motivosDeAtraso(provas, escopo !== "social");
      if (mots.length) atrasos.push({ cliente: nome, dias, motivos: mots });
    }

    // Nenhuma tarefa do checklist existe pra este cliente = ele é anterior à lista.
    if (abertos.length) status.push({ cliente: nome, diasDeCasa: dias, feitos, abertos, nuncaConferido: minhas.length === 0 });
  }

  // ── §14 — marcos de contrato (3 e 6 meses) ────────────────────────────────
  const marcos = await marcosDeContrato();

  const textoSetup = montarCobrancaSetup(status);

  // ANÚNCIO NO AR — conferido na META, não na caixinha. Caixinha marcada não é campanha rodando:
  // dá pra marcar com tudo pausado, ou esquecer de marcar com tudo no ar. Só a Meta sabe.
  // Entra AQUI, dentro da mensagem que já existe, em vez de virar cron novo — o problema que a
  // gente está resolvendo hoje é excesso de disparo.
  const tokenMeta = await getMetaToken().catch(() => null);
  const candidatos = (clientes ?? []).filter((c) => escopoDe(c.service_type as string) !== "social");
  const diagsAnuncio = await Promise.all(candidatos.map((c) => diagnosticarAnuncio({
    id: c.id as string,
    nome: (c.nome_fantasia as string) || (c.name as string) || "Cliente",
    criadoEm: c.created_at as string,
    contaAnuncio: (c.meta_ad_account_id as string) || null,
  }, tokenMeta)));
  const semAnuncio = paraCobrar(diagsAnuncio);
  const textoAnuncio = textoCobranca(semAnuncio);
  const textoDuvida = textoIndefinidos(diagsAnuncio);

  // ── ATRASO COM CAUSA NOMEADA ────────────────────────────────────────────
  // Passou dos 15 dias: em vez de repetir a lista de itens, diz o que o sistema OBSERVOU. É a
  // diferença entre "setup pendente" e "a conta está no cadastro mas não responde à nossa
  // credencial — falta liberar o acesso", que a pessoa consegue resolver hoje.
  const textoAtraso = atrasos.length
    ? ["⏰ *Onboarding além dos 15 dias*", "",
       ...atrasos.sort((a, b) => b.dias - a.dias).slice(0, 6).flatMap((a) => [
         `*${a.cliente}* — ${a.dias} dias de casa`,
         ...a.motivos.map((m) => `• ${m}`), "",
       ])].join("\n").trim()
    : "";

  const partes = [textoSetup, textoAtraso, textoAnuncio, textoDuvida, marcos.texto].filter(Boolean);
  const texto = partes.join("\n\n———\n\n");

  const jid = process.env.CS_INTERNAL_GROUP_JID;
  let postada = false;
  if (texto && jid && !previewOnly) {
    const r = await csSendGroupText(jid, texto, undefined, {
      origem: "setup-7dias", destino: "interno",
      fatos: semAnuncio.map((d) => fatoSemAnuncio(d.cliente)),
    });
    postada = r.ok;
  }

  return NextResponse.json({
    ok: true, postada,
    em_setup: status.length,
    ja_graduaram: graduaram,
    promovidos: promover ? promovidos : "(passe ?promover=1 pra aplicar)",
    tarefas_criadas: criadas,
    // O que o sistema fechou sozinho, com a prova. Aparece na resposta para dar pra auditar sem
    // abrir o banco — um "feito" automático que ninguém consegue conferir vira desconfiança.
    tarefas_fechadas_por_prova: autoFechadas,
    atrasos_com_causa: atrasos,
    marcos: marcos.lista,
    preview: texto || "(setup em dia e nenhum marco hoje)",
  });
}

/**
 * §14 — lembra dos marcos de 3 e 6 meses. Uma vez por marco: grava a chave em agency_settings
 * (`cs_marco:<clientId>:<3|6>`) pra não repetir todo dia útil até o cliente completar 4 meses.
 */
async function marcosDeContrato(): Promise<{ texto: string; lista: string[] }> {
  const { data: clientes } = await supabaseAdmin
    .from("clients").select("id, name, nome_fantasia, created_at")
    .in("status", ["good", "average"]).is("draft_status", null).or("active.is.null,active.eq.true");

  const lista: string[] = [];
  const linhas: string[] = [];
  for (const c of clientes ?? []) {
    const dias = diasDesde(c.created_at as string);
    // Janela de 7 dias a partir do marco — se o cron não rodar num dia, não perde a data.
    const marco = dias >= 180 && dias < 187 ? 6 : dias >= 90 && dias < 97 ? 3 : null;
    if (!marco) continue;

    const chave = `cs_marco:${c.id}:${marco}`;
    const { data: ja } = await supabaseAdmin.from("agency_settings").select("value").eq("key", chave).maybeSingle();
    if (ja?.value) continue;

    const nome = (c.nome_fantasia as string) || (c.name as string);
    lista.push(`${nome} (${marco} meses)`);
    linhas.push(marco === 3
      ? `• *${nome}* — fecha *3 meses* de casa. Vale revisar o contrato, o que foi entregue e se o escopo ainda bate.`
      : `• *${nome}* — fecha *6 meses*. Hora de falar de renovação/reajuste e de onde dá pra crescer junto.`);
    await supabaseAdmin.from("agency_settings").upsert({ key: chave, value: new Date().toISOString() }, { onConflict: "key" });
  }

  if (!linhas.length) return { texto: "", lista: [] };
  return { texto: [`📄 *Marco de contrato*`, "", ...linhas].join("\n"), lista };
}
