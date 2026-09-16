// lib/prospeccao/agenda.ts — horários reais e reunião de verdade (§17–§22).
//
// Só oferece o que está livre (Google Calendar do Roberto + `meetings` do Lone OS), só marca com
// aceite explícito (quem decide isso é a conversa; aqui já chega decidido) e só confirma ao
// prospect depois que o evento existe. Cria também o lead no funil comercial (origem
// "Prospecção ativa") para a reunião aparecer na agenda da Maria e do Roberto.

import { supabaseAdmin } from "@/lib/supabase/server";
import { conflitoDoResponsavel } from "@/lib/cs/conflito-reuniao";
import type { ProspectRow } from "./tipos";
import type { ProspectConfig } from "./config";
import { candidatosDeHorario, porExtensoSP, isoSP } from "./tempo";
import { estadoGoogle, ocupadosNoCalendario, criarEvento, appUrl } from "./google";
import { rotuloClasse, rotuloFaixa } from "./score";
import { nomeProprio, cnpjFormatado } from "./normalizar";
import { transicionar } from "./maquina";
import { atualizarProspect } from "./db";
import * as db from "@/lib/supabase/queries";

export const RESPONSAVEL_LONE = "Roberto";

/** 2–3 horários livres (dias úteis, 10h/15h) checando Google + meetings. */
export async function horariosDisponiveis(cfg: ProspectConfig, quantos = 2, agora = new Date(), periodo?: "manha" | "tarde" | null, evitarIso: string[] = []): Promise<{ opcoes: string[]; fonte: string }> {
  const horas = periodo === "manha" ? [9, 10, 11] : periodo === "tarde" ? [14, 15, 16] : [10, 15];
  const brutos = candidatosDeHorario(agora, 12, (iso) => evitarIso.includes(iso), horas);
  if (!brutos.length) return { opcoes: [], fonte: "nenhum" };
  const g = await estadoGoogle();
  let faixas: { inicio: string; fim: string }[] = [];
  let fonte = "lone-os";
  if (g.conectado) {
    const fb = await ocupadosNoCalendario(new Date(brutos[0]).toISOString(), new Date(new Date(brutos[brutos.length - 1]).getTime() + 3600_000).toISOString());
    if (fb.ok) { faixas = fb.faixas; fonte = "google+lone-os"; }
  }
  const dur = cfg.duracao_reuniao_min * 60_000;
  const ocupadoGoogle = (iso: string) => {
    const ini = new Date(iso).getTime(), fim = ini + dur;
    return faixas.some((f) => new Date(f.inicio).getTime() < fim && new Date(f.fim).getTime() > ini);
  };
  const opcoes: string[] = [];
  for (const iso of brutos) {
    if (opcoes.length >= quantos) break;
    if (ocupadoGoogle(iso)) continue;
    const fimIso = new Date(new Date(iso).getTime() + dur).toISOString();
    const conf = await conflitoDoResponsavel(RESPONSAVEL_LONE, new Date(iso).toISOString(), fimIso);
    if (conf) continue;
    opcoes.push(iso);
  }
  return { opcoes, fonte };
}

/** O horário pedido está livre? (revalidação no aceite — V2 §8) */
export async function horarioLivre(cfg: ProspectConfig, inicioIso: string): Promise<{ livre: boolean; motivo?: string }> {
  const ini = new Date(inicioIso);
  if (Number.isNaN(ini.getTime())) return { livre: false, motivo: "data inválida" };
  if (ini.getTime() < Date.now()) return { livre: false, motivo: "no passado" };
  const fimIso = new Date(ini.getTime() + cfg.duracao_reuniao_min * 60_000).toISOString();
  const conf = await conflitoDoResponsavel(RESPONSAVEL_LONE, ini.toISOString(), fimIso);
  if (conf) return { livre: false, motivo: `conflito com ${conf.cliente}` };
  const g = await estadoGoogle();
  if (g.conectado) {
    const fb = await ocupadosNoCalendario(ini.toISOString(), fimIso);
    if (fb.ok && fb.faixas.some((f) => new Date(f.inicio).getTime() < new Date(fimIso).getTime() && new Date(f.fim).getTime() > ini.getTime())) {
      return { livre: false, motivo: "ocupado no Google Calendar" };
    }
  }
  return { livre: true };
}

function descricaoDoEvento(p: ProspectRow, tipo: "visita" | "online", resumo: string | null): string {
  const linhas = [
    `Origem: Prospecção ativa (Piloto SDR Lone)`,
    `Empresa: ${p.nome}${p.razao_social ? ` (${p.razao_social})` : ""}`,
    p.cnpj ? `CNPJ: ${cnpjFormatado(p.cnpj)}` : null,
    `Contato: ${p.decisor_nome ? nomeProprio(p.decisor_nome) : "—"}${p.decisor_cargo ? ` — ${p.decisor_cargo}` : ""}`,
    `Telefone: ${p.decisor_telefone ?? p.telefone ?? "—"}`,
    p.instagram ? `Instagram: @${p.instagram}` : null,
    p.site ? `Site: ${p.site}` : null,
    `Cidade: ${p.cidade ?? "—"}${p.uf ? `/${p.uf}` : ""}`,
    `Segmento: ${p.segmento ?? "—"}`,
    `Score: ${p.score ?? "—"}/100 (${rotuloClasse(p.classe)})`,
    p.distancia_km !== null ? `Distância de Araruama: ${p.distancia_km} km` : null,
    tipo === "visita" && p.endereco ? `Endereço: ${p.endereco}` : null,
    p.faturamento_sinal ? `Sinal de faturamento (estimativa): ${rotuloFaixa[p.faturamento_sinal.faixa]}` : null,
    "",
    `Diagnóstico: ${p.diagnostico?.por_que_prospectar ?? "—"}`,
    `Oportunidades identificadas:`,
    ...(p.diagnostico?.oportunidades?.length ? p.diagnostico.oportunidades.map((o) => `- ${o}`) : ["- —"]),
    "",
    `Resumo da conversa: ${resumo ?? p.contexto_comercial?.resumo ?? "—"}`,
    `Objeções: ${p.objecoes?.length ? p.objecoes.join("; ") : "nenhuma registrada"}`,
    p.gift_reserved ? `Presente: ${p.gift_type ?? "reservado"}` : null,
    "",
    `Origem do prospect: ${p.origem ?? "—"}`,
    `Lone OS: ${appUrl()}/prospeccao?prospect=${p.id}`,
  ];
  return linhas.filter((l) => l !== null).join("\n");
}

export interface ReuniaoMarcada {
  ok: boolean;
  error?: string;
  meet_url?: string | null;
  /** true quando era online e o Google não estava conectado (Roberto manda o link). */
  sem_link?: boolean;
  prospect?: ProspectRow;
}

/**
 * Marca a reunião: revalida → Google (se conectado) → meetings → crm_leads → prospect → estágio.
 * Não manda mensagem nenhuma — quem chama confirma ao prospect com o que voltou daqui.
 */
export async function marcarReuniao(p: ProspectRow, cfg: ProspectConfig, r: { inicioIso: string; tipo: "visita" | "online"; resumo?: string | null; por?: string }): Promise<ReuniaoMarcada> {
  const livre = await horarioLivre(cfg, r.inicioIso);
  if (!livre.livre) return { ok: false, error: `horário indisponível: ${livre.motivo}` };
  const ini = new Date(r.inicioIso);
  const fim = new Date(ini.getTime() + cfg.duracao_reuniao_min * 60_000);
  const titulo = `${r.tipo === "visita" ? "VISITA COMERCIAL" : "REUNIÃO COMERCIAL"} | LONE MÍDIA x ${p.nome.toUpperCase()}`;
  const descricao = descricaoDoEvento(p, r.tipo, r.resumo ?? null);

  let google_event_id: string | null = null, meet_url: string | null = null, sem_link = false;
  const g = await estadoGoogle();
  if (g.conectado) {
    const ev = await criarEvento({
      titulo, descricao, inicioIso: ini.toISOString(), fimIso: fim.toISOString(),
      local: r.tipo === "visita" ? (p.endereco ?? p.cidade ?? null) : null,
      convidados: p.email ? [p.email] : [],
      meet: r.tipo === "online",
    });
    if (!ev.ok) return { ok: false, error: ev.error };
    google_event_id = ev.evento!.event_id;
    meet_url = ev.evento!.meet_url;
  } else if (r.tipo === "online") {
    sem_link = true;
  }

  const { data: m, error: em } = await supabaseAdmin.from("meetings").insert({
    client_id: null, prospect_id: p.id, title: titulo, description: descricao,
    meeting_type: r.tipo === "visita" ? "comercial_visita" : "comercial_online",
    start_at: ini.toISOString(), end_at: fim.toISOString(),
    location: r.tipo === "visita" ? (p.endereco ?? p.cidade ?? "Presencial") : "Google Meet",
    estado: "agendada", status: "scheduled", responsavel: RESPONSAVEL_LONE, created_by: r.por ?? "SDR_AI",
    confirmado_em: new Date().toISOString(), confirmado_por: p.decisor_nome ? nomeProprio(p.decisor_nome) : "prospect",
    google_event_id, meet_url, link_reuniao: meet_url,
  }).select("id").single();
  if (em) return { ok: false, error: `meetings: ${em.message}` };

  let crm_lead_id: string | null = p.crm_lead_id;
  try {
    if (!crm_lead_id) {
      const lead = await db.insertCrmLead({
        contatoNome: p.decisor_nome ? nomeProprio(p.decisor_nome) : `Responsável — ${p.nome}`,
        empresa: p.nome, telefone: p.decisor_telefone ?? p.telefone ?? null, email: p.email ?? null,
        estagio: "reuniao", origem: "Prospecção ativa", responsavel: RESPONSAVEL_LONE,
        reuniaoData: ini.toISOString(),
        observacoes: `Piloto SDR Lone — score ${p.score ?? "—"} (${rotuloClasse(p.classe)}). ${p.diagnostico?.por_que_prospectar ?? ""}`.trim(),
      });
      crm_lead_id = lead.id;
      await supabaseAdmin.from("crm_leads").update({ prospect_id: p.id }).eq("id", lead.id);
    } else {
      await db.updateCrmLead(crm_lead_id, { estagio: "reuniao", reuniaoData: ini.toISOString() });
    }
  } catch (err) {
    console.error("[prospeccao/agenda] crm_leads falhou (segue sem):", err instanceof Error ? err.message : err);
  }

  const atual = await atualizarProspect(p.id, {
    reuniao_em: ini.toISOString(), reuniao_tipo: r.tipo, meeting_id: (m as { id: string }).id,
    google_event_id, meet_url, crm_lead_id,
    ...(sem_link ? { precisa_humano: true, motivo_humano: "Reunião online marcada sem Google conectado: enviar o link do Meet ao prospect" } : {}),
    contexto_comercial: { ...(p.contexto_comercial ?? {}), resumo: r.resumo ?? p.contexto_comercial?.resumo },
  });
  const depois = await transicionar(atual, {
    para: "reuniao_agendada", motivo: `${r.tipo === "visita" ? "Visita" : "Reunião online"} marcada para ${porExtensoSP(isoSP(ini))}`,
    responsavel: r.por ?? "SDR_AI", detalhe: { google_event_id, meet_url, sem_link },
  });
  return { ok: true, meet_url, sem_link, prospect: depois };
}

/** Marca o desfecho da reunião (Roberto, pela página). */
export async function registrarResultadoReuniao(p: ProspectRow, resultado: "realizada" | "no_show" | "cancelada", por: string, nota?: string): Promise<ProspectRow> {
  if (p.meeting_id) {
    await supabaseAdmin.from("meetings").update({
      estado: resultado === "realizada" ? "realizada" : "cancelada",
      status: resultado === "realizada" ? "completed" : "cancelled",
      ...(resultado === "realizada" ? { realizada_em: new Date().toISOString() } : {}),
      resumo: nota ?? null,
    }).eq("id", p.meeting_id);
  }
  const atual = await atualizarProspect(p.id, { resultado_reuniao: nota ? `${resultado}: ${nota}` : resultado });
  if (resultado === "realizada") return transicionar(atual, { para: "reuniao_realizada", motivo: nota ?? "Reunião realizada", responsavel: por });
  if (resultado === "no_show") return transicionar(atual, { para: "no_show", motivo: nota ?? "Prospect não apareceu", responsavel: por });
  return transicionar(atual, { para: "horario_proposto", motivo: nota ?? "Reunião cancelada — reoferecer horário", responsavel: por, patch: { reuniao_em: null, meeting_id: null, google_event_id: null, meet_url: null } });
}
