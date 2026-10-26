// lib/cs/regras-propostas.ts — REGRA PERMANENTE DE CLIENTE PEDE OK. Fase 0A do Lone Agent V2.
//
// Antes (até 13/09/2026): três pontos do inbound gravavam em cs_client_rules com ativo = true a
// partir de UMA mensagem — o modelo devolvia `ensino` ou `aprendizado`, e virava regra. Medido:
// 354 das 356 regras ativas nasceram assim. Auditoria anterior: 378 regras, 10 acionáveis. É a
// memória do agente sendo escrita por observação pontual, sem ninguém olhar.
//
// Agora a regra nasce PROPOSTA (ativo = false) e o grupo vê:
//   📌 Parece uma regra nova para *Quero Tintas*: _usar preço na primeira arte_
//      Salvar como regra permanente? *ok a1b2* / *não a1b2*
// Todos os leitores de regra já filtram ativo = true, então a proposta é invisível até o ok.
//
// Fato TEMPORÁRIO ("fechado até dia 20", "promoção até sexta") continua automático, com a
// expiração de 14 dias que já existia — não é regra permanente, e pedir ok para cada aviso
// passageiro seria o ruído que o Roberto já cortou duas vezes.

import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";
import { podeNoNivel, type Papel } from "@/lib/cs/autoridade";

/** Ativar regra permanente é COMUNICAÇÃO/MODIFICAÇÃO do comportamento do agente: nível D. */
export const NIVEL_PARA_ATIVAR_REGRA = "D" as const;

/**
 * A pergunta "salvar como regra?" vai SEMPRE ao grupo interno — nunca ao grupo do cliente, mesmo
 * que o chamador passe outro JID. Garantia no módulo, não na disciplina de quem chama: um
 * "salvar isso como regra permanente?" no grupo do cliente exporia como o agente funciona.
 */
function grupoDaPergunta(): string | null {
  return process.env.CS_INTERNAL_GROUP_JID || null;
}

// Fato com prazo embutido ("semana que vem", "até dia 15") não pode virar regra ETERNA da memória
// do cliente — ganha TTL de 14 dias. "a partir de hoje/amanhã" é mudança permanente, não casa.
export function ehFatoTemporario(texto: string): boolean {
  if (/a partir de/i.test(texto)) return false;
  return /semana que vem|essa semana|esta semana|este m[êe]s|esse m[êe]s|pr[óo]xim[ao]s? (semana|m[êe]s)|at[ée] (o )?dia \d|s[óo] (essa|esta) semana|f[ée]rias|recesso|balan[çc]o/i.test(texto);
}

export interface PedidoDeRegra {
  clientId: string;
  clienteNome: string;
  texto: string;
  escopo: "sempre" | "roteiro" | "social" | "promocao";
  sourceMessage: string;
  author: string | null;
  /**
   * @deprecated Ignorado de propósito: a pergunta vai sempre ao grupo interno. Mantido na assinatura
   * só para os chamadores existentes não quebrarem; será removido.
   */
  groupJid?: string | null;
}

export type ResultadoProposta =
  | { tipo: "ja_existe" }
  | { tipo: "temporaria_ativa"; id: string }
  | { tipo: "proposta"; id: string; codigo: string };

/**
 * Propõe uma regra. Temporária → ativa com expiração (como antes). Permanente → proposta + pergunta.
 * Idempotente por (cliente, texto): regra igual já ativa ou já proposta não gera outra.
 */
export async function proporRegra(p: PedidoDeRegra): Promise<ResultadoProposta> {
  const texto = p.texto.trim().slice(0, 200);
  if (!texto) return { tipo: "ja_existe" };

  const { data: ex } = await supabaseAdmin.from("cs_client_rules")
    .select("id").eq("client_id", p.clientId).eq("texto", texto).in("estado", ["ativa", "proposta"]).limit(1);
  if (ex && ex.length) return { tipo: "ja_existe" };

  const temporaria = ehFatoTemporario(texto);
  if (temporaria) {
    const { data } = await supabaseAdmin.from("cs_client_rules").insert({
      client_id: p.clientId, texto, escopo: p.escopo, origem: "aprendido", ativo: true, estado: "ativa",
      source_message: p.sourceMessage, author: p.author,
      expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    }).select("id").single();
    return { tipo: "temporaria_ativa", id: (data?.id as string) ?? "" };
  }

  const codigo = randomBytes(2).toString("hex");
  const { data, error } = await supabaseAdmin.from("cs_client_rules").insert({
    client_id: p.clientId, texto, escopo: p.escopo, origem: "aprendido", ativo: false, estado: "proposta",
    codigo, source_message: p.sourceMessage, author: p.author,
  }).select("id").single();
  if (error || !data) return { tipo: "ja_existe" };

  const destino = grupoDaPergunta();
  if (destino) {
    const pergunta =
      `📌 Parece uma regra nova para *${p.clienteNome}*:\n_${texto}_\n\n` +
      `Salvar como regra permanente? Responde *ok ${codigo}* ou *não ${codigo}* — ou responde nesta mensagem.`;
    const r = await csSendGroupText(destino, pergunta, undefined, { origem: "regra-proposta", destino: "interno" })
      .catch(() => ({ ok: false as const, id: undefined as string | undefined }));
    const msgId = (r as { id?: string }).id;
    if (msgId) await supabaseAdmin.from("cs_client_rules").update({ msg_id_proposta: msgId }).eq("id", data.id as string);
  }
  return { tipo: "proposta", id: data.id as string, codigo };
}

export interface DecisaoDeRegra {
  acao: "confirmar" | "descartar";
  codigo?: string | null;
  quotedMsgId?: string | null;
  quem: string | null;
  /** Papel de quem decide. Ativar exige nível D (manager/admin); descartar, C. */
  papel: Papel | null;
}

export type ResultadoDecisao =
  | { tipo: "nao_achei" }
  /** A mensagem citada é um resumo com várias propostas: "ok" sozinho não escolhe uma ao acaso. */
  | { tipo: "varias"; total: number }
  | { tipo: "sem_autoridade"; texto: string; cliente: string; nivelExigido: "C" | "D" }
  | { tipo: "ja_decidida"; estado: string; texto: string; cliente: string }
  | { tipo: "ativada" | "descartada"; texto: string; cliente: string; clientId: string };

/** Resolve "ok xxxx" / "não xxxx" (ou resposta à mensagem da proposta) para uma regra proposta. */
export async function decidirRegra(d: DecisaoDeRegra): Promise<ResultadoDecisao> {
  if (d.quotedMsgId && !d.codigo) {
    const { count } = await supabaseAdmin.from("cs_client_rules").select("id", { count: "exact", head: true })
      .eq("msg_id_proposta", d.quotedMsgId).eq("estado", "proposta");
    if ((count ?? 0) > 1) return { tipo: "varias", total: count ?? 0 };
  }
  let q = supabaseAdmin.from("cs_client_rules")
    .select("id, texto, estado, client_id, clients(nome_fantasia, name)")
    .order("created_at", { ascending: false }).limit(1);
  if (d.quotedMsgId) q = q.eq("msg_id_proposta", d.quotedMsgId);
  else if (d.codigo) q = q.eq("codigo", d.codigo);
  else return { tipo: "nao_achei" };

  const { data } = await q.maybeSingle();
  if (!data) return { tipo: "nao_achei" };
  const cli = data.clients as { nome_fantasia?: string; name?: string } | null;
  const cliente = cli?.nome_fantasia || cli?.name || "cliente";
  if (data.estado !== "proposta") return { tipo: "ja_decidida", estado: data.estado as string, texto: data.texto as string, cliente };

  const ativar = d.acao === "confirmar";
  // Ativar muda o que o agente faz para aquele cliente daqui em diante — nível D. Descartar é C.
  const nivelExigido = ativar ? NIVEL_PARA_ATIVAR_REGRA : "C";
  if (!podeNoNivel(d.papel, nivelExigido)) {
    return { tipo: "sem_autoridade", texto: data.texto as string, cliente, nivelExigido };
  }
  await supabaseAdmin.from("cs_client_rules").update({
    estado: ativar ? "ativa" : "descartada", ativo: ativar,
    confirmada_por: d.quem, confirmada_em: new Date().toISOString(),
    ...(ativar ? {} : { motivo_desativacao: "descartada na proposta", desativada_em: new Date().toISOString() }),
  }).eq("id", data.id as string);
  return { tipo: ativar ? "ativada" : "descartada", texto: data.texto as string, cliente, clientId: data.client_id as string };
}

// ── Várias de uma vez (26/10/2026) ───────────────────────────────────────────
// As rotinas de domingo propõem dezenas de regras por semana. Uma pergunta por regra seria a enxurrada que o
// Roberto já cortou duas vezes; por isso elas saem num RESUMO só, na segunda, e o gestor decide em lote:
//   "ok a1b2 c3d4"            → salva essas
//   "não a1b2"                → descarta essa
//   "ok todas" (citando o resumo) → salva todas as daquele resumo
// "ok" sozinho citando o resumo NÃO salva tudo: responde perguntando, para ninguém aprovar 20 regras sem ler.

const ACAO_RE = /^(ok|okay|sim|confirmar|confirma|salvar|salva|nao|não|descartar|descarta)\b/i;

/** "ok a1b2 c3d4", "não a1b2 c3d4", "ok todas". null = não é decisão em lote (o leitor de um código cuida). */
export function parseDecisaoLote(texto: string): { acao: "confirmar" | "descartar"; codigos: string[]; todas: boolean } | null {
  const t = texto.trim().replace(/[!.,;…]+$/g, "");
  const m = ACAO_RE.exec(t);
  if (!m) return null;
  const resto = t.slice(m[0].length).trim();
  const acao = /^(ok|okay|sim|confirm|salva)/i.test(m[1]) ? "confirmar" : "descartar";
  if (/^(todas|todos|tudo)$/i.test(resto)) return { acao, codigos: [], todas: true };
  const partes = resto.split(/[\s,]+/).filter(Boolean);
  if (partes.length < 2 || !partes.every((p) => /^[a-f0-9]{4}$/i.test(p))) return null;
  return { acao, codigos: [...new Set(partes.map((p) => p.toLowerCase()))], todas: false };
}

export interface LinhaProposta { id: string; codigo: string | null; texto: string; estado: string; client_id: string; cliente: string }

/** O que fazer com cada código pedido. Pura. */
export function planejarLote(pedidos: string[], linhas: LinhaProposta[]): { decidir: LinhaProposta[]; jaDecididas: LinhaProposta[]; naoAchados: string[] } {
  const porCodigo = new Map<string, LinhaProposta>();
  // Mais de uma linha com o mesmo código (só aconteceria com propostas antigas): vale a proposta aberta.
  for (const l of linhas) {
    const c = (l.codigo ?? "").toLowerCase();
    const atual = porCodigo.get(c);
    if (!atual || (atual.estado !== "proposta" && l.estado === "proposta")) porCodigo.set(c, l);
  }
  const decidir: LinhaProposta[] = [], jaDecididas: LinhaProposta[] = [], naoAchados: string[] = [];
  for (const c of pedidos) {
    const l = porCodigo.get(c);
    if (!l) naoAchados.push(c);
    else if (l.estado === "proposta") decidir.push(l);
    else jaDecididas.push(l);
  }
  return { decidir, jaDecididas, naoAchados };
}

export type ResultadoLote =
  | { tipo: "nao_achei" }
  | { tipo: "sem_autoridade"; nivelExigido: "C" | "D" }
  | { tipo: "decididas"; acao: "confirmar" | "descartar"; regras: LinhaProposta[]; jaDecididas: number; naoAchados: string[] };

async function lerPropostas(filtro: { codigos?: string[]; msgId?: string }): Promise<LinhaProposta[]> {
  let q = supabaseAdmin.from("cs_client_rules").select("id, codigo, texto, estado, client_id, clients(nome_fantasia, name)");
  if (filtro.msgId) q = q.eq("msg_id_proposta", filtro.msgId).eq("estado", "proposta");
  else q = q.in("codigo", filtro.codigos ?? []);
  const { data, error } = await q;
  if (error) throw new Error(`cs_client_rules: ${error.message}`);
  return (data ?? []).map((r) => {
    const cli = r.clients as { nome_fantasia?: string; name?: string } | null;
    return { id: String(r.id), codigo: (r.codigo as string) ?? null, texto: String(r.texto), estado: String(r.estado), client_id: String(r.client_id), cliente: cli?.nome_fantasia || cli?.name || "cliente" };
  });
}

/** Decide várias propostas de uma vez (códigos, ou "todas" de um resumo citado). */
export async function decidirRegras(d: {
  acao: "confirmar" | "descartar"; codigos: string[]; todas: boolean; quotedMsgId?: string | null;
  quem: string | null; papel: Papel | null;
}): Promise<ResultadoLote> {
  const nivelExigido = d.acao === "confirmar" ? NIVEL_PARA_ATIVAR_REGRA : "C";
  if (!podeNoNivel(d.papel, nivelExigido)) return { tipo: "sem_autoridade", nivelExigido };

  let alvo: { decidir: LinhaProposta[]; jaDecididas: LinhaProposta[]; naoAchados: string[] };
  if (d.todas) {
    if (!d.quotedMsgId) return { tipo: "nao_achei" };
    alvo = { decidir: await lerPropostas({ msgId: d.quotedMsgId }), jaDecididas: [], naoAchados: [] };
  } else {
    alvo = planejarLote(d.codigos, await lerPropostas({ codigos: d.codigos }));
  }
  if (!alvo.decidir.length && !alvo.jaDecididas.length) return { tipo: "nao_achei" };

  const ativar = d.acao === "confirmar";
  if (alvo.decidir.length) {
    const agora = new Date().toISOString();
    const { error } = await supabaseAdmin.from("cs_client_rules").update({
      estado: ativar ? "ativa" : "descartada", ativo: ativar, confirmada_por: d.quem, confirmada_em: agora,
      ...(ativar ? {} : { motivo_desativacao: "descartada na proposta", desativada_em: agora }),
    }).in("id", alvo.decidir.map((l) => l.id)).eq("estado", "proposta");
    if (error) throw new Error(`cs_client_rules: ${error.message}`);
    if (ativar) {
      const { sincronizarBriefingAprendido } = await import("@/lib/cs/briefing-sync");
      for (const c of new Set(alvo.decidir.map((l) => l.client_id))) await sincronizarBriefingAprendido(c);
    }
  }
  return { tipo: "decididas", acao: d.acao, regras: alvo.decidir, jaDecididas: alvo.jaDecididas.length, naoAchados: alvo.naoAchados };
}

/** A resposta no grupo depois de decidir em lote. Pura. */
export function textoDoLote(r: Extract<ResultadoLote, { tipo: "decididas" }>): string {
  const linhas: string[] = [];
  if (r.regras.length) {
    linhas.push(r.acao === "confirmar"
      ? `✅ ${r.regras.length === 1 ? "Regra salva" : `${r.regras.length} regras salvas`}:`
      : `👍 ${r.regras.length === 1 ? "Descartei 1 regra" : `Descartei ${r.regras.length} regras`}:`);
    for (const l of r.regras.slice(0, 15)) linhas.push(`• *${l.cliente}*: _${l.texto}_`);
    if (r.regras.length > 15) linhas.push(`… e mais ${r.regras.length - 15}.`);
  }
  if (r.jaDecididas) linhas.push(`${r.jaDecididas === 1 ? "1 já tinha sido decidida" : `${r.jaDecididas} já tinham sido decididas`} antes.`);
  if (r.naoAchados.length) linhas.push(`Não achei: ${r.naoAchados.join(", ")}.`);
  return linhas.join("\n");
}

// ── Resumo semanal e validade ────────────────────────────────────────────────

/** Proposta sem resposta por tanto tempo é descartada sozinha: a fila não vira um arquivo morto. */
export const DIAS_VALIDADE_PROPOSTA = 14;
/** Quantas cabem no resumo; o resto entra no da semana seguinte. */
export const MAX_NO_RESUMO = 20;

export interface ItemResumo { codigo: string; cliente: string; texto: string; author: string | null }

const ROTULO_FONTE = (author: string | null) =>
  author === "IA (releitura do ciclo)" ? "peça que voltou" : author === "IA (conversas)" ? "conversa do grupo" : author?.startsWith("correção do") ? "correção" : "aprendido";

/** A mensagem do resumo, agrupada por cliente. Pura. */
export function textoResumoPropostas(itens: ItemResumo[], restantes: number): string {
  const porCliente = new Map<string, ItemResumo[]>();
  for (const i of itens) porCliente.set(i.cliente, [...(porCliente.get(i.cliente) ?? []), i]);
  const blocos = [...porCliente.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([cliente, xs]) => [`*${cliente}*`, ...xs.map((x) => `• _${x.texto}_ (${ROTULO_FONTE(x.author)}) — *${x.codigo}*`)].join("\n"));
  return [
    `📌 *Regras que o Loninho aprendeu e esperam o seu ok* (${itens.length})`,
    "Nenhuma vale até um gestor salvar. Sem resposta em 14 dias, a proposta some.",
    "",
    blocos.join("\n\n"),
    "",
    "Para salvar: *ok a1b2 c3d4* (os códigos que quiser). Para descartar: *não a1b2*. Respondendo esta mensagem com *ok todas*, salva todas da lista.",
    restantes > 0 ? `_Mais ${restantes} ficaram para o próximo resumo._` : "",
  ].filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== "")).join("\n").trim();
}

/** Descarta as propostas vencidas. Devolve quantas. */
export async function expirarPropostas(agora: Date = new Date()): Promise<number> {
  const limite = new Date(agora.getTime() - DIAS_VALIDADE_PROPOSTA * 86400000).toISOString();
  const { data, error } = await supabaseAdmin.from("cs_client_rules")
    .update({ estado: "descartada", ativo: false, motivo_desativacao: "proposta sem resposta em 14 dias", desativada_em: agora.toISOString() })
    .eq("estado", "proposta").lt("created_at", limite).select("id");
  if (error) throw new Error(`cs_client_rules: ${error.message}`);
  return data?.length ?? 0;
}

/**
 * Manda UM resumo com as propostas que ainda não foram anunciadas (msg_id_proposta vazio) e liga cada uma à
 * mensagem, para "ok todas" citando o resumo funcionar. dry = só monta o texto.
 */
export async function enviarResumoDePropostas(opts: { dry: boolean }): Promise<{ total: number; listadas: number; texto: string | null; enviado: boolean; erro?: string }> {
  const { data, error } = await supabaseAdmin.from("cs_client_rules")
    .select("id, codigo, texto, author, created_at, clients(nome_fantasia, name)")
    .eq("estado", "proposta").is("msg_id_proposta", null).not("codigo", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`cs_client_rules: ${error.message}`);
  const todas = data ?? [];
  if (!todas.length) return { total: 0, listadas: 0, texto: null, enviado: false };
  const lista = todas.slice(0, MAX_NO_RESUMO);
  const itens: ItemResumo[] = lista.map((r) => {
    const cli = r.clients as { nome_fantasia?: string; name?: string } | null;
    return { codigo: String(r.codigo), cliente: cli?.nome_fantasia || cli?.name || "cliente", texto: String(r.texto), author: (r.author as string) ?? null };
  });
  const texto = textoResumoPropostas(itens, todas.length - lista.length);
  if (opts.dry) return { total: todas.length, listadas: lista.length, texto, enviado: false };

  const destino = grupoDaPergunta();
  if (!destino) return { total: todas.length, listadas: 0, texto, enviado: false, erro: "CS_INTERNAL_GROUP_JID não configurado" };
  const r = await csSendGroupText(destino, texto, undefined, { origem: "regras-propostas", destino: "interno" });
  if (!r.ok) return { total: todas.length, listadas: 0, texto, enviado: false, erro: r.error ?? "envio falhou" };
  // Sem o id da mensagem, "ok todas" não acha a lista — mas os códigos continuam valendo.
  if (r.id) await supabaseAdmin.from("cs_client_rules").update({ msg_id_proposta: r.id }).in("id", lista.map((l) => String(l.id)));
  return { total: todas.length, listadas: lista.length, texto, enviado: true };
}
