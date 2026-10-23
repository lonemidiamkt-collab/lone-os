// lib/crm/reunioes-server.ts — executa as reuniões de venda: Google Agenda (evento + Meet), banco, funil e grupo
// de vendas. Regras e textos em lib/crm/reunioes.ts (puro, testado).
//
// Ordem ao marcar: valida → cria o evento no Google (se conectado; com Meet quando é online — sem o link, nada
// é gravado) → grava a reunião → lead vai para Diagnóstico se estava antes (decisão do Roberto, 17/10/2026)
// e o histórico registra → avisa o grupo de vendas → devolve a confirmação pronta para ele mandar ao lead.

import { supabaseAdmin } from "@/lib/supabase/server";
import * as db from "@/lib/supabase/queries";
import { atualizarEvento, cancelarEvento, criarEvento, estadoGoogle } from "@/lib/prospeccao/google";
import { mandarNoGrupoVendas } from "@/lib/crm/grupo-vendas-envio";
import { registrarAtividade } from "@/lib/crm/registrar-atividade";
import { registrarEtapa } from "@/lib/crm/etapas-historico";
import { waComTexto } from "@/lib/crm/modelos";
import {
  descricaoDoEvento, diaCurto, fimDe, horaCurta, mensagemConfirmacaoLead, textoCanceladaGrupo, textoMarcadaGrupo,
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

const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

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
  const convidados = [...new Set([...(p.convidados ?? []), ...(lead.email ? [lead.email] : [])].map((e) => e.trim().toLowerCase()).filter(emailValido))];
  const local = p.formato === "presencial" ? (p.local?.trim() || lead.endereco || lead.cidade || null) : (p.local?.trim() || null);

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
  const mensagemLead = mensagemConfirmacaoLead(reuniao, lead, convidados.length > 0 && !!googleEventId);
  return { ok: true, reuniao, aviso, whatsappLead: waComTexto(lead.telefone, mensagemLead), mensagemLead };
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

export async function cancelarReuniao(id: string, autor: string | null): Promise<{ ok: boolean; erro?: string }> {
  const atual = await carregar(id);
  if (!atual || atual.r.estado !== "agendada") return { ok: false, erro: "Reunião não encontrada ou já encerrada." };
  if (atual.r.googleEventId) await cancelarEvento(atual.r.googleEventId).catch(() => false);
  await supabaseAdmin.from("crm_reunioes").update({ estado: "cancelada", atualizado_em: new Date().toISOString() }).eq("id", id);
  await sincronizarReuniaoDoLead(atual.lead.id);
  await db.insertLeadActivity({ leadId: atual.lead.id, tipo: "nota", autor, texto: `Reunião de ${diaCurto(atual.r.inicio)} cancelada` }).catch(() => {});
  await mandarNoGrupoVendas(textoCanceladaGrupo(atual.r, atual.lead), "crm-reuniao:cancelada");
  return { ok: true };
}

/** "Como foi?": aconteceu (vira contato na régua) ou não veio. */
export async function registrarResultado(id: string, estado: "realizada" | "nao_veio", resultado: string | null, autor: string | null): Promise<{ ok: boolean; erro?: string }> {
  const atual = await carregar(id);
  if (!atual || atual.r.estado !== "agendada") return { ok: false, erro: "Reunião não encontrada ou já registrada." };
  await supabaseAdmin.from("crm_reunioes").update({ estado, resultado: resultado?.trim() || null, atualizado_em: new Date().toISOString() }).eq("id", id);
  await sincronizarReuniaoDoLead(atual.lead.id);
  if (estado === "realizada") {
    await registrarAtividade({ leadId: atual.lead.id, tipo: "reuniao", autor, texto: `Reunião realizada${resultado?.trim() ? `: ${resultado.trim()}` : "."}` });
  } else {
    await db.insertLeadActivity({ leadId: atual.lead.id, tipo: "nota", autor, texto: `Não compareceu à reunião de ${diaCurto(atual.r.inicio)}. Remarcar.` }).catch(() => {});
  }
  return { ok: true };
}
