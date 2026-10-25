// lib/crm/reunioes-server.ts — executa as reuniões de venda: Google Agenda (evento + Meet), banco, funil e grupo
// de vendas. Regras e textos em lib/crm/reunioes.ts (puro, testado).
//
// Ordem ao marcar: valida → cria o evento no Google (se conectado; com Meet quando é online — sem o link, nada
// é gravado) → grava a reunião → lead vai para Diagnóstico se estava antes (decisão do Roberto, 17/10/2026)
// e o histórico registra → avisa o grupo de vendas → devolve a confirmação pronta para ele mandar ao lead.

import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import { atualizarEvento, cancelarEvento, cancelarEventoComMotivo, criarEvento, estadoGoogle, ocupadosNoCalendario } from "@/lib/prospeccao/google";
import { mandarNoGrupoVendas } from "@/lib/crm/grupo-vendas-envio";
import { desfazerRegistro, registrarAtividade } from "@/lib/crm/registrar-atividade";
import { JANELA_DESFAZER_MIN, type DesfazerRegistro } from "@/lib/crm/desfazer-registro";
import { registrarEtapa } from "@/lib/crm/etapas-historico";
import { waComTexto } from "@/lib/crm/modelos";
import {
  convidadosDoConvite, descricaoDoEvento, diaCurto, emailValido, erroCancelarNoGoogle, fimDe, horaCurta, mensagemConfirmacaoLead, textoCanceladaGrupo, textoMarcadaGrupo,
  textoRemarcadaGrupo, tituloDoEvento, validarMarcacao, type EstadoReuniao, type Formato, type ReuniaoBase,
} from "@/lib/crm/reunioes";
import type { CrmLead } from "@/lib/types";

export interface Reuniao extends ReuniaoBase {
  convidados: string[];
  pauta: string | null;
  resultado: string | null;
  googleEventId: string | null;
  htmlLink: string | null;
  criadoPor: string | null;
}

export function deLinha(r: Record<string, unknown>): Reuniao {
  return {
    id: r.id as string, leadId: r.lead_id as string, inicio: r.inicio as string, fim: r.fim as string,
    formato: r.formato as Formato, local: (r.local as string) ?? null, meetUrl: (r.meet_url as string) ?? null,
    estado: r.estado as EstadoReuniao, lembreteVesperaEm: (r.lembrete_vespera_em as string) ?? null,
    lembreteHoraEm: (r.lembrete_hora_em as string) ?? null, criadoEm: r.criado_em as string,
    convidados: (r.convidados as string[]) ?? [], pauta: (r.pauta as string) ?? null, resultado: (r.resultado as string) ?? null,
    googleEventId: (r.google_event_id as string) ?? null, htmlLink: (r.html_link as string) ?? null, criadoPor: (r.criado_por as string) ?? null,
  };
}


/** Próxima reunião agendada do lead → reuniao_data do lead (o Hoje e o funil leem por ali). */
async function sincronizarReuniaoDoLead(leadId: string) {
  const { data } = await supabaseAdmin.from("crm_reunioes").select("inicio").eq("lead_id", leadId).eq("estado", "agendada")
    .gte("fim", new Date().toISOString()).order("inicio").limit(1).maybeSingle();
  const dia = data ? new Date(data.inicio as string).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : null;
  await db.updateCrmLead(leadId, { reuniaoData: dia });
}

export async function marcarReuniao(p: {
  leadId: string; inicio: string; duracao: number; formato: Formato; local?: string | null;
  convidados?: string[]; pauta?: string | null; autor: string | null; agora?: Date;
}): Promise<{ ok: true; reuniao: Reuniao; aviso: string | null; whatsappLead: string | null; mensagemLead: string } | { ok: false; erro: string }> {
  const agora = p.agora ?? new Date();
  const erro = validarMarcacao({ inicio: p.inicio, duracao: p.duracao, formato: p.formato, agora });
  if (erro) return { ok: false, erro };
  const lead = await db.fetchCrmLeadById(p.leadId);
  if (!lead) return { ok: false, erro: "Lead não encontrado." };
  const inicioIso = new Date(p.inicio).toISOString();
  const fimIso = fimDe(inicioIso, p.duracao);
  // SÓ QUEM ESTÁ NO CAMPO (24/10/2026, auditoria 4.7). Antes o e-mail do cadastro do lead entrava sempre: quem
  // apagava o campo para não convidar o lead (ou trocava pelo e-mail certo) via o convite ir para o cadastro mesmo
  // assim. A tela mostra a lista antes de confirmar; o Loninho pergunta com a lista e manda a mesma.
  const convidados = convidadosDoConvite(p.convidados);
  const recusados = (p.convidados ?? []).filter((e) => e.trim() && !emailValido(e));
  if (recusados.length) return { ok: false, erro: `E-mail inválido no convite: ${recusados.join(", ")}. Corrija ou apague antes de marcar.` };
  const local = p.formato === "presencial" ? (p.local?.trim() || lead.endereco || lead.cidade || null) : (p.local?.trim() || null);

  // Mesmo lead e mesmo horário já marcados (duplo "ok" no grupo, clique repetido): para ANTES do Google — senão o
  // lead recebia um convite e, logo depois, o cancelamento do evento órfão (24/10/2026).
  const { data: jaMarcada } = await supabaseAdmin.from("crm_reunioes").select("id").eq("lead_id", lead.id).eq("estado", "agendada").eq("inicio", inicioIso).limit(1);
  if (jaMarcada?.length) return { ok: false, erro: "Essa reunião já está marcada (mesmo lead, mesmo horário)." };

  let googleEventId: string | null = null, meetUrl: string | null = null, htmlLink: string | null = null, aviso: string | null = null;
  const g = await estadoGoogle();
  if (g.conectado) {
    const ev = await criarEvento({
      titulo: tituloDoEvento(lead, p.formato), descricao: descricaoDoEvento(lead, p.pauta ?? null),
      inicioIso, fimIso, local, convidados, meet: p.formato === "meet",
    });
    // Online sem link de Meet não vale: o Roberto mandaria ao lead um convite sem sala.
    if (!ev.ok || !ev.evento) return { ok: false, erro: `O Google Agenda não criou o evento: ${ev.error ?? "sem resposta"}. Nada foi gravado — tente de novo.` };
    googleEventId = ev.evento.event_id; meetUrl = ev.evento.meet_url; htmlLink = ev.evento.html_link;
  } else {
    aviso = p.formato === "meet"
      ? "Google Agenda não conectado: a reunião ficou só no Lone OS, sem link do Meet. Conecte na Agenda do Comercial."
      : "Google Agenda não conectado: a reunião ficou só no Lone OS.";
  }

  const { data, error } = await supabaseAdmin.from("crm_reunioes").insert({
    lead_id: lead.id, inicio: inicioIso, fim: fimIso, formato: p.formato, local, convidados, pauta: p.pauta?.trim() || null,
    google_event_id: googleEventId, meet_url: meetUrl, html_link: htmlLink, criado_por: p.autor,
  }).select("*").single();
  if (error || !data) {
    if (googleEventId) await cancelarEvento(googleEventId).catch(() => false); // não deixa evento órfão no Google
    return { ok: false, erro: error?.code === "23505" ? "Já existe uma reunião com esse lead nesse horário." : `Não consegui gravar a reunião: ${error?.message ?? "erro"}` };
  }
  const reuniao = deLinha(data);

  // Funil: reunião marcada = quem decide topou ver o diagnóstico (só avança, nunca volta).
  if (lead.estagio === "novo" || lead.estagio === "contato") {
    await db.updateCrmLead(lead.id, { estagio: "diagnostico", etapaDesde: new Date().toISOString() });
    await registrarEtapa({ leadId: lead.id, de: lead.estagio, para: "diagnostico", autor: p.autor, origem: "reuniao" });
    await db.insertLeadActivity({ leadId: lead.id, tipo: "etapa", texto: "Movido para Diagnóstico (reunião marcada)", autor: p.autor }).catch(() => {});
  }
  await sincronizarReuniaoDoLead(lead.id);
  await db.insertLeadActivity({
    leadId: lead.id, tipo: "nota", autor: p.autor,
    texto: `Reunião marcada para ${diaCurto(inicioIso)} às ${horaCurta(inicioIso)} (${p.formato === "meet" ? "Google Meet" : p.formato === "presencial" ? "presencial" : "ligação"})${meetUrl ? ` — ${meetUrl}` : ""}`,
  }).catch(() => {});

  await mandarNoGrupoVendas(textoMarcadaGrupo(reuniao, lead, p.autor), "crm-reuniao:marcada");
  // "Mandei o convite no seu e-mail" só quando o e-mail do lead está entre os convidados.
  const leadConvidado = !!lead.email && convidados.includes(lead.email.trim().toLowerCase());
  const mensagemLead = mensagemConfirmacaoLead(reuniao, lead, leadConvidado && !!googleEventId);
  return { ok: true, reuniao, aviso, whatsappLead: waComTexto(lead.telefone, mensagemLead), mensagemLead };
}

/**
 * O horário está livre? Para o Loninho avisar na pergunta antes de marcar (24/10/2026). Confere as reuniões do
 * Comercial e, com o Google conectado, o Google Agenda da Lone. Leitura que falha = "nao_conferi", nunca "livre".
 */
export async function conferirHorario(inicioIso: string, fimIso: string): Promise<"livre" | "ocupado" | "nao_conferi"> {
  try {
    const { data, error } = await supabaseAdmin.from("crm_reunioes").select("id")
      .eq("estado", "agendada").lt("inicio", fimIso).gt("fim", inicioIso).limit(1);
    if (error) return "nao_conferi";
    if (data?.length) return "ocupado";
    const g = await estadoGoogle();
    if (!g.conectado) return "livre"; // sem Google, a reunião fica só no Lone OS — marcarReuniao avisa isso
    const fb = await ocupadosNoCalendario(inicioIso, fimIso);
    if (!fb.ok) return "nao_conferi";
    const ini = Date.parse(inicioIso), fim = Date.parse(fimIso);
    return fb.faixas.some((f) => Date.parse(f.inicio) < fim && Date.parse(f.fim) > ini) ? "ocupado" : "livre";
  } catch {
    return "nao_conferi";
  }
}

async function carregar(id: string): Promise<{ r: Reuniao; lead: CrmLead } | null> {
  const { data } = await supabaseAdmin.from("crm_reunioes").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const lead = await db.fetchCrmLeadById(data.lead_id as string);
  return lead ? { r: deLinha(data), lead } : null;
}

export async function remarcarReuniao(id: string, novoInicio: string, duracao: number, autor: string | null): Promise<{ ok: boolean; erro?: string; reuniao?: Reuniao }> {
  const atual = await carregar(id);
  if (!atual || atual.r.estado !== "agendada") return { ok: false, erro: "Reunião não encontrada ou já encerrada." };
  const erro = validarMarcacao({ inicio: novoInicio, duracao, formato: atual.r.formato, agora: new Date() });
  if (erro) return { ok: false, erro };
  const inicioIso = new Date(novoInicio).toISOString();
  const fimIso = fimDe(inicioIso, duracao);
  if (atual.r.googleEventId) {
    const g = await atualizarEvento(atual.r.googleEventId, { inicioIso, fimIso });
    if (!g.ok) return { ok: false, erro: `O Google Agenda não mudou o horário: ${g.error}` };
  }
  const { data, error } = await supabaseAdmin.from("crm_reunioes").update({
    inicio: inicioIso, fim: fimIso, lembrete_vespera_em: null, lembrete_hora_em: null, atualizado_em: new Date().toISOString(),
  }).eq("id", id).select("*").single();
  if (error || !data) return { ok: false, erro: error?.message ?? "erro" };
  const reuniao = deLinha(data);
  await sincronizarReuniaoDoLead(atual.lead.id);
  await db.insertLeadActivity({ leadId: atual.lead.id, tipo: "nota", autor, texto: `Reunião remarcada para ${diaCurto(inicioIso)} às ${horaCurta(inicioIso)}` }).catch(() => {});
  await mandarNoGrupoVendas(textoRemarcadaGrupo(atual.r.inicio, reuniao, atual.lead), "crm-reuniao:remarcada");
  return { ok: true, reuniao };
}

/**
 * Cancela o evento no Google e só diz "ok" se o Google confirmou (evento já apagado, 404/410, conta como
 * cancelado). Reunião sem evento (marcada com o Google desconectado) não tem o que cancelar lá.
 */
export async function cancelarNoGoogle(r: Pick<Reuniao, "inicio" | "meetUrl" | "googleEventId">): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!r.googleEventId) return { ok: true };
  let g: { ok: boolean; error?: string };
  try { g = await cancelarEventoComMotivo(r.googleEventId); } catch (e) { g = { ok: false, error: e instanceof Error ? e.message : "erro de conexão" }; }
  return g.ok ? { ok: true } : { ok: false, erro: erroCancelarNoGoogle(r, g.error ?? "sem resposta do Google") };
}

// GOOGLE PRIMEIRO, PAINEL DEPOIS (21/10/2026). Antes a falha do Google era engolida (.catch(() => false))
// e a reunião virava "cancelada" mesmo assim: o lead seguia com o convite e o Meet valendo, e o grupo
// recebia "o convite foi cancelado". Agora, sem confirmação do Google, nada muda e a tela diz o porquê.
export async function cancelarReuniao(id: string, autor: string | null): Promise<{ ok: boolean; erro?: string }> {
  const atual = await carregar(id);
  if (!atual || atual.r.estado !== "agendada") return { ok: false, erro: "Reunião não encontrada ou já encerrada." };
  const g = await cancelarNoGoogle(atual.r);
  if (!g.ok) return { ok: false, erro: g.erro };
  const { error } = await supabaseAdmin.from("crm_reunioes").update({ estado: "cancelada", atualizado_em: new Date().toISOString() }).eq("id", id);
  if (error) {
    // O Google já cancelou; repetir o clique é seguro (o evento apagado responde 410 = cancelado).
    return { ok: false, erro: `O evento foi cancelado no Google Agenda, mas não consegui marcar a reunião como cancelada no painel (${error.message}). Clique em Cancelar de novo.` };
  }
  await sincronizarReuniaoDoLead(atual.lead.id);
  await db.insertLeadActivity({ leadId: atual.lead.id, tipo: "nota", autor, texto: `Reunião de ${diaCurto(atual.r.inicio)} cancelada` }).catch(() => {});
  await mandarNoGrupoVendas(textoCanceladaGrupo(atual.r, atual.lead), "crm-reuniao:cancelada");
  return { ok: true };
}

/** "Como foi?": aconteceu (vira contato na régua) ou não veio. Devolve o `desfazer` do aviso (24/10/2026, auditoria 4.6). */
export async function registrarResultado(id: string, estado: "realizada" | "nao_veio", resultado: string | null, autor: string | null): Promise<{ ok: boolean; erro?: string; desfazer?: DesfazerRegistro }> {
  const atual = await carregar(id);
  if (!atual || atual.r.estado !== "agendada") return { ok: false, erro: "Reunião não encontrada ou já registrada." };
  // Falha ao gravar não vira "Registrado" (24/10/2026): antes o erro do banco era ignorado.
  const { error } = await supabaseAdmin.from("crm_reunioes").update({ estado, resultado: resultado?.trim() || null, atualizado_em: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, erro: `Não consegui registrar (${error.message}). Tente de novo.` };
  await sincronizarReuniaoDoLead(atual.lead.id);
  if (estado === "realizada") {
    const { desfazer } = await registrarAtividade({ leadId: atual.lead.id, tipo: "reuniao", autor, texto: `Reunião realizada${resultado?.trim() ? `: ${resultado.trim()}` : "."}` });
    return { ok: true, desfazer };
  }
  const nota = await db.insertLeadActivity({ leadId: atual.lead.id, tipo: "nota", autor, texto: `Não compareceu à reunião de ${diaCurto(atual.r.inicio)}. Remarcar.` }).catch(() => null);
  return { ok: true, desfazer: { leadId: atual.lead.id, atividadeIds: nota ? [nota.id] : [], antes: {}, depois: {} } };
}

/**
 * O "Desfazer" do "Aconteceu" / "Não veio" (24/10/2026): a reunião volta a agendada e o registro sai do lead.
 * Só logo depois de registrar — passado o prazo, o aviso já sumiu e o caminho é editar a ficha.
 */
export async function desfazerResultado(id: string, desfazer: DesfazerRegistro | null, agora: Date = new Date()): Promise<{ ok: boolean; erro?: string }> {
  const { data, error } = await supabaseAdmin.from("crm_reunioes").select("id, lead_id, estado, atualizado_em").eq("id", id).maybeSingle();
  if (error) return { ok: false, erro: `Não consegui conferir a reunião (${error.message}). Nada foi desfeito.` };
  if (!data || (data.estado !== "realizada" && data.estado !== "nao_veio")) return { ok: false, erro: "Essa reunião não está mais registrada como aconteceu/não veio." };
  if (agora.getTime() - Date.parse(data.atualizado_em as string) > JANELA_DESFAZER_MIN * 60_000) {
    return { ok: false, erro: `Só dá para desfazer nos primeiros ${JANELA_DESFAZER_MIN} minutos.` };
  }
  if (desfazer && desfazer.leadId !== data.lead_id) return { ok: false, erro: "Esse registro não é desta reunião." };
  const { error: errUp } = await supabaseAdmin.from("crm_reunioes").update({ estado: "agendada", resultado: null, atualizado_em: agora.toISOString() }).eq("id", id);
  if (errUp) return { ok: false, erro: `Não consegui voltar a reunião (${errUp.message}). Nada foi desfeito.` };
  await sincronizarReuniaoDoLead(data.lead_id as string);
  if (desfazer) {
    const r = await desfazerRegistro(desfazer, agora);
    if (!r.ok) return { ok: false, erro: `A reunião voltou para agendada, mas o registro no lead ficou: ${r.erro}` };
  }
  return { ok: true };
}

/** Reuniões que ainda vão acontecer (agendadas e não terminadas) de um lead — as que têm convite valendo. */
export async function reunioesFuturasDoLead(leadId: string, agora: Date = new Date()): Promise<{ ok: true; reunioes: Reuniao[] } | { ok: false; erro: string }> {
  const { data, error } = await supabaseAdmin.from("crm_reunioes").select("*").eq("lead_id", leadId).eq("estado", "agendada")
    .gte("fim", agora.toISOString()).order("inicio");
  if (error) return { ok: false, erro: `Não consegui conferir as reuniões do lead (${error.message}).` };
  return { ok: true, reunioes: (data ?? []).map(deLinha) };
}

/**
 * Antes de EXCLUIR um lead (21/10/2026): a exclusão apaga as reuniões em cascata e o evento do Google
 * ficava de pé — o lead continuava com o convite e o Meet de uma reunião que ninguém ia fazer. Cancela
 * cada reunião futura pelo mesmo caminho do botão Cancelar (Google primeiro) e para na primeira que o
 * Google não confirmar: quem chama não exclui e mostra o erro.
 */
export async function cancelarReunioesDoLead(leadId: string, autor: string | null): Promise<{ ok: true; canceladas: Reuniao[] } | { ok: false; erro: string; canceladas: Reuniao[] }> {
  const futuras = await reunioesFuturasDoLead(leadId);
  if (!futuras.ok) return { ok: false, erro: futuras.erro, canceladas: [] };
  const canceladas: Reuniao[] = [];
  for (const r of futuras.reunioes) {
    const c = await cancelarReuniao(r.id, autor).catch((e: unknown) => ({ ok: false, erro: e instanceof Error ? e.message : "erro" }));
    if (!c.ok) return { ok: false, erro: c.erro ?? "Não consegui cancelar a reunião.", canceladas };
    canceladas.push(r);
  }
  return { ok: true, canceladas };
}
