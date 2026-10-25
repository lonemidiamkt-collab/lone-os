// lib/tarefas/auto-marcar-server.ts — fecha (e reabre) a tarefa avisada no grupo da equipe. Só servidor.
//
// 25/10/2026 (auditoria de erro recuperável, 13.1). A escolha da tarefa mora em ./auto-marcar (puro, testado). Aqui:
//   • lê as tarefas abertas CONFERINDO o erro (antes, `limit(200)` sem ordem e sem olhar `.error`);
//   • fecha conferindo o update e anota quem fechou e por qual mensagem (colunas da migration 20261025150000 —
//     sem ela, a anotação só avisa no log e a tarefa fecha do mesmo jeito);
//   • avisa o DONO quando quem fechou foi outra pessoa (antes ele nunca sabia);
//   • "reabre" citando a confirmação desfaz; o número citando a pergunta escolhe a tarefa certa.
// A memória curta (id da mensagem → tarefa) some num restart; aí o texto citado basta: a confirmação traz o título
// entre aspas e a pergunta traz as opções numeradas.

import { supabaseAdmin } from "@/lib/supabase/server";
import { resolverDonos } from "@/lib/cs/dono-tarefa";
import {
  escolherTarefaFeita, mesmaPessoa, textoMarquei, textoPergunta, textoReaberta,
  ehPedidoReabrir, numeroEscolhido, tituloDaConfirmacao, opcoesDaPergunta, ehPerguntaDeTarefa,
  type TarefaAberta,
} from "./auto-marcar";

export type ResultadoAviso =
  | { tipo: "marcou"; tarefa: TarefaAberta; texto: string }
  | { tipo: "perguntou"; candidatas: TarefaAberta[]; texto: string }
  | { tipo: "nada" }
  | { tipo: "falhou"; texto: string };

type Lembranca =
  | { tipo: "marcou"; tarefa: TarefaAberta; em: number }
  | { tipo: "perguntou"; candidatas: TarefaAberta[]; em: number };

const DIAS_DE_MEMORIA = 3;
const memoria = new Map<string, Lembranca>();

/** Guarda o que a mensagem do agente marcou/perguntou, pelo id que o WhatsApp devolveu. */
export function lembrarMensagem(msgId: string | null | undefined, r: ResultadoAviso): void {
  if (!msgId || (r.tipo !== "marcou" && r.tipo !== "perguntou")) return;
  const corte = Date.now() - DIAS_DE_MEMORIA * 86_400_000;
  for (const [k, v] of memoria) if (v.em < corte) memoria.delete(k);
  memoria.set(msgId, r.tipo === "marcou"
    ? { tipo: "marcou", tarefa: r.tarefa, em: Date.now() }
    : { tipo: "perguntou", candidatas: r.candidatas, em: Date.now() });
}

/** Só para testes. */
export function _esquecerMensagens(): void { memoria.clear(); }

type LinhaTarefa = { id: string; title: string; client_id: string | null; client_name: string | null; assigned_to: string | null };

async function comDono(linhas: LinhaTarefa[]): Promise<TarefaAberta[]> {
  const donos = await resolverDonos(linhas.map((t) => ({ id: t.id, assigned_to: t.assigned_to, client_id: t.client_id })));
  return linhas.map((t) => ({ id: t.id, titulo: t.title, cliente: t.client_name || null, dono: donos.get(t.id) ?? null }));
}

/** Tarefas abertas, as mais novas primeiro. Lança se não conseguir ler — "nenhuma aberta" seria mentira. */
export async function lerTarefasAbertas(): Promise<TarefaAberta[]> {
  const { data, error } = await supabaseAdmin.from("tasks")
    .select("id, title, client_id, client_name, assigned_to")
    .neq("status", "done").order("created_at", { ascending: false }).limit(500);
  if (error) throw new Error(`não consegui ler as tarefas (${error.message})`);
  return comDono((data ?? []) as LinhaTarefa[]);
}

async function fechar(t: TarefaAberta, quem: { autor: string | null; mensagem: string; msgId?: string | null }): Promise<{ ok: boolean; erro?: string; jaEstava?: boolean }> {
  const { data, error } = await supabaseAdmin.from("tasks")
    .update({ status: "done" }).eq("id", t.id).neq("status", "done").select("id");
  if (error) return { ok: false, erro: error.message };
  if (!data || data.length === 0) return { ok: true, jaEstava: true };
  // Quem fechou e por qual mensagem. Coluna ausente (migration não aplicada) só avisa: a tarefa já fechou.
  const { error: eAnota } = await supabaseAdmin.from("tasks").update({
    concluida_por: quem.autor, concluida_via: "grupo", concluida_msg_id: quem.msgId ?? null,
    concluida_em: new Date().toISOString(),
  }).eq("id", t.id);
  if (eAnota) console.warn("[tarefas/auto-marcar] quem concluiu não anotado (migration 20261025150000?):", eAnota.message);
  // Fechou a tarefa de OUTRA pessoa: o dono fica sabendo, com o caminho para desfazer.
  if (t.dono && !mesmaPessoa(quem.autor, t.dono)) {
    const { error: eNot } = await supabaseAdmin.from("notifications").insert({
      type: "content",
      title: "✅ Sua tarefa foi marcada como feita pelo grupo",
      body: `"${t.titulo}" — ${quem.autor || "alguém da equipe"} avisou: "${quem.mensagem.slice(0, 140)}". Não era? Reabra em Tarefas › Concluídas.`,
      target_user: t.dono,
    });
    if (eNot) console.warn("[tarefas/auto-marcar] aviso ao dono não gravado:", eNot.message);
  }
  console.log(`[tarefas/auto-marcar] "${t.titulo}" (${t.dono ?? "sem dono"}) marcada por ${quem.autor ?? "?"}`);
  return { ok: true };
}

/**
 * Alguém avisou que terminou ("já fiz a arte da Imperio"). Decide, fecha e devolve o texto para o grupo.
 * `nada` = não achou tarefa que bata (quem chama decide se fala); `falhou` = leitura ou gravação deu erro.
 */
export async function marcarTarefaPeloAviso(p: { autor: string | null; referencia: string; mensagem: string; msgId?: string | null }): Promise<ResultadoAviso> {
  let abertas: TarefaAberta[];
  try { abertas = await lerTarefasAbertas(); } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    console.error("[tarefas/auto-marcar]", motivo);
    return { tipo: "falhou", texto: `Não marquei nenhuma tarefa: ${motivo}. Marque em Tarefas.` };
  }
  const d = escolherTarefaFeita(p.autor, p.referencia, abertas);
  if (d.tipo === "nada") return { tipo: "nada" };
  if (d.tipo === "perguntar") return { tipo: "perguntou", candidatas: d.candidatas, texto: textoPergunta(d.candidatas) };
  const r = await fechar(d.tarefa, p);
  if (!r.ok) return { tipo: "falhou", texto: `Não consegui marcar *"${d.tarefa.titulo}"* como feita (${r.erro}). Marque em Tarefas.` };
  return { tipo: "marcou", tarefa: d.tarefa, texto: textoMarquei(d.tarefa) };
}

async function reabrir(p: { lembranca: Lembranca | undefined; citado: string | null }): Promise<string> {
  let alvo: { id: string; titulo: string; dono: string | null } | null = null;
  if (p.lembranca?.tipo === "marcou") alvo = { id: p.lembranca.tarefa.id, titulo: p.lembranca.tarefa.titulo, dono: p.lembranca.tarefa.dono };
  else {
    const titulo = tituloDaConfirmacao(p.citado);
    if (!titulo) return "Não sei qual tarefa reabrir. Reabra em Tarefas › Concluídas.";
    const { data, error } = await supabaseAdmin.from("tasks").select("id, title, client_id, client_name, assigned_to")
      .eq("title", titulo).eq("status", "done").order("updated_at", { ascending: false }).limit(1);
    if (error) return `Não consegui procurar a tarefa (${error.message}). Reabra em Tarefas › Concluídas.`;
    const linha = (data ?? [])[0] as LinhaTarefa | undefined;
    if (!linha) return `Não achei *"${titulo}"* entre as concluídas — ela pode já ter sido reaberta.`;
    const [t] = await comDono([linha]);
    alvo = { id: t.id, titulo: t.titulo, dono: t.dono };
  }
  const { data, error } = await supabaseAdmin.from("tasks").update({ status: "pending" }).eq("id", alvo.id).eq("status", "done").select("id");
  if (error) return `Não consegui reabrir *"${alvo.titulo}"* (${error.message}). Reabra em Tarefas › Concluídas.`;
  if (!data || data.length === 0) return `*"${alvo.titulo}"* já estava aberta — não mudei nada.`;
  const { error: eLimpa } = await supabaseAdmin.from("tasks")
    .update({ concluida_por: null, concluida_via: null, concluida_msg_id: null, concluida_em: null }).eq("id", alvo.id);
  if (eLimpa) console.warn("[tarefas/auto-marcar] anotação de conclusão não limpa (migration 20261025150000?):", eLimpa.message);
  return textoReaberta(alvo.titulo, alvo.dono);
}

async function escolher(p: { n: number; lembranca: Lembranca | undefined; citado: string | null; autor: string | null; mensagem: string; msgId?: string | null }): Promise<ResultadoAviso> {
  let escolhida: TarefaAberta | null = null;
  if (p.lembranca?.tipo === "perguntou") {
    escolhida = p.lembranca.candidatas[p.n - 1] ?? null;
    if (!escolhida) return { tipo: "falhou", texto: `Não tem opção ${p.n} nessa lista. Responda com um dos números.` };
  } else {
    const titulo = opcoesDaPergunta(p.citado)[p.n - 1];
    if (!titulo) return { tipo: "falhou", texto: `Não tem opção ${p.n} nessa lista. Responda com um dos números.` };
    let abertas: TarefaAberta[];
    try { abertas = await lerTarefasAbertas(); } catch (e) {
      return { tipo: "falhou", texto: `Não marquei: ${e instanceof Error ? e.message : String(e)}. Marque em Tarefas.` };
    }
    const iguais = abertas.filter((t) => t.titulo === titulo);
    if (iguais.length !== 1) {
      return { tipo: "falhou", texto: iguais.length ? `Tem ${iguais.length} tarefas abertas com o nome *"${titulo}"* — marque a certa em Tarefas.` : `*"${titulo}"* não está mais aberta — não mudei nada.` };
    }
    escolhida = iguais[0];
  }
  const r = await fechar(escolhida, { autor: p.autor, mensagem: p.mensagem, msgId: p.msgId });
  if (!r.ok) return { tipo: "falhou", texto: `Não consegui marcar *"${escolhida.titulo}"* como feita (${r.erro}). Marque em Tarefas.` };
  if (r.jaEstava) return { tipo: "falhou", texto: `*"${escolhida.titulo}"* já estava marcada como feita — não mudei nada.` };
  return { tipo: "marcou", tarefa: escolhida, texto: textoMarquei(escolhida) };
}

/** A mensagem é "reabre" (ou o número da opção) citando uma confirmação/pergunta de tarefa do agente? Não grava nada. */
export function ehCitacaoDeTarefa(p: { texto: string; quotedMsgId: string | null | undefined; quotedText: string | null | undefined }): boolean {
  const lembranca = p.quotedMsgId ? memoria.get(p.quotedMsgId) : undefined;
  const citouConfirmacao = lembranca?.tipo === "marcou" || !!tituloDaConfirmacao(p.quotedText);
  const citouPergunta = lembranca?.tipo === "perguntou" || ehPerguntaDeTarefa(p.quotedText);
  return (citouConfirmacao && ehPedidoReabrir(p.texto)) || (citouPergunta && numeroEscolhido(p.texto) !== null);
}

/**
 * A mensagem cita uma confirmação ou pergunta de tarefa do agente? Trata "reabre" e o número da opção.
 * `null` = não é sobre tarefa (segue o fluxo normal do inbound). Quem chama confere a autoridade antes.
 */
export async function responderCitacaoDeTarefa(p: {
  texto: string; quotedMsgId: string | null | undefined; quotedText: string | null | undefined;
  autor: string | null; msgId?: string | null;
}): Promise<ResultadoAviso | { tipo: "reaberta"; texto: string } | null> {
  const lembranca = p.quotedMsgId ? memoria.get(p.quotedMsgId) : undefined;
  const citado = p.quotedText ?? null;
  const citouConfirmacao = lembranca?.tipo === "marcou" || !!tituloDaConfirmacao(citado);
  const citouPergunta = lembranca?.tipo === "perguntou" || ehPerguntaDeTarefa(citado);
  if (citouConfirmacao && ehPedidoReabrir(p.texto)) return { tipo: "reaberta", texto: await reabrir({ lembranca, citado }) };
  const n = numeroEscolhido(p.texto);
  if (citouPergunta && n !== null) return escolher({ n, lembranca, citado, autor: p.autor, mensagem: p.texto, msgId: p.msgId });
  return null;
}
