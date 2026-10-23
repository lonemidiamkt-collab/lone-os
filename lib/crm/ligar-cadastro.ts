// lib/crm/ligar-cadastro.ts — cadastro do Lone OS ↔ lead do Comercial, pelo nome (out/2026).
//
// Pedido do Roberto (23/10/2026): "se tem no funil o nome da empresa e o Roberto abriu um link de cadastro para essa
// mesma empresa, é aquele cliente — a gente já deveria ter essa automação". E: "se tenho dois cadastros da mesma empresa em
// pendência e um foi feito, era duplicado — eu posso tirar".
//
// Regras (a decisão é em código; nada de "achar" com IA):
//   • LIGAR só quando o par é ÚNICO nos dois sentidos (um cliente sem lead × um lead sem cliente, nome parecido —
//     lib/crm/fechados.ts empresasParecidas). Dois candidatos = avisa e deixa o Roberto escolher na ficha.
//   • Ligar NÃO move o lead de etapa: o aviso sugere marcar Ganho (lição de 17/10/2026 — cadastro em onboarding foi
//     marcado ganho sozinho e ele voltou os dois para Negociação).
//   • DUPLICADO = rascunho de cadastro ainda pendente com nome parecido ao de um cadastro já preenchido: avisa para excluir
//     (UMA vez por rascunho — trava `cadastro-duplicado:<id>` em automation_settings; a conferência diária não repete).

import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import { empresasParecidas } from "@/lib/crm/fechados";
import { DESTINO_AVISOS_COMERCIAL } from "@/lib/crm/acesso";
import { ROTULO_ETAPA, normalizarEtapa } from "@/lib/crm/etapas";

export interface ClienteLig { id: string; nome: string; leadId: string | null; rascunho: boolean; criadoEm: string }
export interface LeadLig { id: string; nome: string; estagio: string }

export interface ParLigacao { clienteId: string; cliente: string; leadId: string; lead: string; etapa: string }

/** Pares únicos cliente sem lead × lead sem cliente, por nome parecido. Lead perdido fica de fora. */
export function paresParaLigar(clientes: ClienteLig[], leads: LeadLig[]): { pares: ParLigacao[]; ambiguos: { cliente: string; leads: string[] }[] } {
  const leadsLigados = new Set(clientes.map((c) => c.leadId).filter(Boolean));
  const livresC = clientes.filter((c) => !c.leadId && c.nome.trim());
  const livresL = leads.filter((l) => !leadsLigados.has(l.id) && normalizarEtapa(l.estagio) !== "perdido" && l.nome.trim());
  const pares: ParLigacao[] = [];
  const ambiguos: { cliente: string; leads: string[] }[] = [];
  for (const c of livresC) {
    const cand = livresL.filter((l) => empresasParecidas(c.nome, l.nome));
    if (cand.length === 0) continue;
    if (cand.length > 1) { ambiguos.push({ cliente: c.nome, leads: cand.map((l) => l.nome) }); continue; }
    const l = cand[0];
    // Único também do outro lado: nenhum outro cliente livre parecido com este lead.
    if (livresC.filter((x) => empresasParecidas(x.nome, l.nome)).length > 1) { ambiguos.push({ cliente: c.nome, leads: [l.nome] }); continue; }
    pares.push({ clienteId: c.id, cliente: c.nome, leadId: l.id, lead: l.nome, etapa: ROTULO_ETAPA[normalizarEtapa(l.estagio)] ?? l.estagio });
  }
  return { pares, ambiguos };
}

/** Rascunhos pendentes que parecem duplicados de um cadastro já preenchido (o pendente é o que sobra). */
export function cadastrosDuplicados(clientes: ClienteLig[]): { pendenteId: string; pendente: string; criadoEm: string; feito: string }[] {
  const feitos = clientes.filter((c) => !c.rascunho);
  return clientes
    .filter((c) => c.rascunho)
    .flatMap((p) => {
      const f = feitos.find((x) => x.id !== p.id && empresasParecidas(x.nome, p.nome));
      return f ? [{ pendenteId: p.id, pendente: p.nome, criadoEm: p.criadoEm, feito: f.nome }] : [];
    });
}

async function lerClientesELeads(): Promise<{ clientes: ClienteLig[]; leads: LeadLig[] }> {
  const [cli, leads] = await Promise.all([
    supabaseAdmin.from("clients").select("id, name, nome_fantasia, source_lead_id, draft_status, created_at"),
    db.fetchCrmLeads(),
  ]);
  if (cli.error) throw new Error(cli.error.message);
  return {
    clientes: (cli.data ?? []).map((c) => ({
      id: c.id as string, nome: ((c.nome_fantasia as string) || (c.name as string) || "").trim(), leadId: (c.source_lead_id as string) ?? null,
      rascunho: c.draft_status === "pending_invite", criadoEm: c.created_at as string,
    })),
    leads: leads.map((l) => ({ id: l.id, nome: (l.empresa || l.contatoNome || "").trim(), estagio: l.estagio })),
  };
}

async function sino(titulo: string, corpo: string) {
  const { error } = await supabaseAdmin.from("notifications").insert({ type: "content", title: titulo, body: corpo, target_user: DESTINO_AVISOS_COMERCIAL, read: false });
  if (error) console.error("[ligar-cadastro] sino:", error.message);
}

/** Avisa no sino que o rascunho parece duplicado — uma vez só por rascunho. */
async function avisarDuplicadoUmaVez(d: { pendenteId: string; pendente: string; criadoEm: string; feito: string }): Promise<boolean> {
  const job = `cadastro-duplicado:${d.pendenteId}`;
  const { data: trava, error } = await supabaseAdmin.from("automation_settings").select("ultimo_alerta_em").eq("job", job).maybeSingle();
  if (error) { console.error("[ligar-cadastro] trava:", error.message); return false; }
  if (trava?.ultimo_alerta_em) return false;
  const dia = new Date(d.criadoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  await sino(`Cadastro duplicado: ${d.pendente}`, `"${d.feito}" já preencheu o cadastro e ainda existe um rascunho pendente "${d.pendente}" de ${dia}. Provavelmente duplicado — exclua o rascunho em Clientes.`);
  await supabaseAdmin.from("automation_settings").upsert({ job, ultimo_alerta_em: new Date().toISOString() }, { onConflict: "job" });
  return true;
}

/** Grava a ligação (só se o cliente continuar sem lead) e registra no histórico do lead. */
export async function gravarLigacao(par: ParLigacao, origem: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("clients").update({ source_lead_id: par.leadId }).eq("id", par.clienteId).is("source_lead_id", null).select("id").maybeSingle();
  if (error || !data) { if (error) console.error("[ligar-cadastro] ligar:", error.message); return false; }
  await db.insertLeadActivity({ leadId: par.leadId, tipo: "nota", autor: null, texto: `Cadastro "${par.cliente}" (${origem}) ligado a este lead automaticamente pelo nome.` }).catch(() => {});
  return true;
}

/** Depois de criar um cadastro fora do Comercial: liga ao lead de mesmo nome, se for único, e avisa. Nunca lança. */
export async function ligarCadastroNovo(clientId: string): Promise<void> {
  try {
    const { clientes, leads } = await lerClientesELeads();
    const este = clientes.find((c) => c.id === clientId);
    if (!este || este.leadId) return;
    const { pares, ambiguos } = paresParaLigar([este, ...clientes.filter((c) => c.id !== clientId)], leads);
    const par = pares.find((p) => p.clienteId === clientId);
    if (par && (await gravarLigacao(par, "link de cadastro do Lone OS"))) {
      await sino(`Cadastro de ${par.cliente} ligado ao Comercial`, `O lead "${par.lead}" (${par.etapa}) agora aponta para este cadastro. Se a venda fechou, marque Ganho no Funil.`);
      return;
    }
    const amb = ambiguos.find((a) => a.cliente === este.nome);
    if (amb) await sino(`Cadastro de ${este.nome}: mais de um lead parecido`, `Leads parecidos no Comercial: ${amb.leads.join(", ")}. Ligue o certo pela ficha (Transformar em cliente → Ligar a este cadastro).`);
  } catch (e) {
    console.error("[ligar-cadastro] cadastro novo:", e instanceof Error ? e.message : e);
  }
}

/** Depois que o cliente PREENCHE o cadastro: liga ao lead (se ainda não) e avisa se sobrou um rascunho duplicado. */
export async function aoConcluirCadastro(clientId: string): Promise<void> {
  try {
    await ligarCadastroNovo(clientId);
    const { clientes } = await lerClientesELeads();
    const este = clientes.find((c) => c.id === clientId);
    if (!este) return;
    const duplicados = clientes.filter((c) => c.rascunho && c.id !== clientId && empresasParecidas(c.nome, este.nome));
    for (const d of duplicados) await avisarDuplicadoUmaVez({ pendenteId: d.id, pendente: d.nome, criadoEm: d.criadoEm, feito: este.nome });
  } catch (e) {
    console.error("[ligar-cadastro] concluir:", e instanceof Error ? e.message : e);
  }
}

/** Conferência geral (rota de sistema, todo dia): pares para ligar, ambíguos e duplicados. `aplicar` grava os pares
 *  únicos, avisa o que ligou e avisa cada duplicado novo (os já avisados não repetem). */
export async function conferirCadastros(aplicar: boolean) {
  const { clientes, leads } = await lerClientesELeads();
  const { pares, ambiguos } = paresParaLigar(clientes, leads);
  const duplicados = cadastrosDuplicados(clientes);
  const ligados: ParLigacao[] = [];
  if (aplicar) for (const p of pares) if (await gravarLigacao(p, "conferência de cadastros")) ligados.push(p);
  if (aplicar && ligados.length) {
    await sino("Cadastros ligados ao Comercial", `${ligados.map((p) => `${p.cliente} → ${p.lead} (${p.etapa})`).join("; ")}. Se a venda fechou, marque Ganho no Funil.`);
  }
  let duplicadosAvisados = 0;
  if (aplicar) for (const d of duplicados) if (await avisarDuplicadoUmaVez(d)) duplicadosAvisados++;
  return { pares, ambiguos, duplicados, ligados, duplicadosAvisados };
}
