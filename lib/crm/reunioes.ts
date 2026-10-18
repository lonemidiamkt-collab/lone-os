// lib/crm/reunioes.ts — REUNIÕES DE VENDA do Comercial (out/2026). Módulo PURO, testado; quem grava, fala com
// o Google e manda no WhatsApp é lib/crm/reunioes-server.ts.
//
// Fluxo combinado com o Roberto (17/10/2026): marcar pela Agenda, pela ficha ou pelo Loninho do grupo → evento no
// Google Agenda da Lone (Meet quando é online; o lead recebe o convite por e-mail) → aviso no grupo de vendas →
// confirmação pronta para ELE mandar ao lead (nada sai automático para prospect) → lembrete na véspera às 9h e
// 1 hora antes no grupo → depois, "como foi?" no Hoje. Nenhum texto daqui leva valor.

import { formatarWhatsapp } from "@/lib/team/whatsapp";

export type Formato = "meet" | "presencial" | "ligacao";
export type EstadoReuniao = "agendada" | "realizada" | "nao_veio" | "cancelada";

export interface ReuniaoBase {
  id: string;
  leadId: string;
  inicio: string; // ISO
  fim: string;    // ISO
  formato: Formato;
  local: string | null;
  meetUrl: string | null;
  estado: EstadoReuniao;
  lembreteVesperaEm: string | null;
  lembreteHoraEm: string | null;
  criadoEm: string;
}

export interface LeadDaReuniao {
  empresa: string | null;
  contatoNome: string;
  telefone: string | null;
  endereco?: string | null;
  cidade?: string | null;
}

export const DURACOES = [30, 45, 60, 90] as const;
export const ROTULO_FORMATO: Record<Formato, string> = { meet: "Google Meet", presencial: "Presencial", ligacao: "Ligação" };

// ─── Datas no fuso de São Paulo (o Brasil não tem horário de verão desde 2019: sempre -03:00) ────────────

export const inicioDe = (dia: string, hora: string): string => `${dia}T${hora.length === 5 ? hora : `${hora}:00`.slice(0, 5)}:00-03:00`;
const somaMin = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString();
export const fimDe = (inicioIso: string, duracaoMin: number) => somaMin(inicioIso, duracaoMin);
const diaSP = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const horaSP = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "15h", "15h30" */
export function horaCurta(iso: string): string {
  const [h, m] = horaSP(iso).split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
}
/** "quinta, 23/10" */
export function diaCurto(iso: string): string {
  const d = diaSP(iso);
  return `${DIAS[new Date(`${d}T12:00:00Z`).getUTCDay()]}, ${d.slice(8, 10)}/${d.slice(5, 7)}`;
}
export const duracaoMin = (r: { inicio: string; fim: string }) => Math.round((Date.parse(r.fim) - Date.parse(r.inicio)) / 60_000);

// ─── Validação e horários livres ─────────────────────────────────────────────────────────────────────

export function validarMarcacao(p: { inicio: string; duracao: number; formato: string; agora: Date }): string | null {
  const t = Date.parse(p.inicio);
  if (!Number.isFinite(t)) return "Horário inválido.";
  if (t < p.agora.getTime() - 5 * 60_000) return "Esse horário já passou.";
  if (t > p.agora.getTime() + 366 * 86_400_000) return "Marque com no máximo 1 ano de antecedência.";
  if (!Number.isInteger(p.duracao) || p.duracao < 15 || p.duracao > 240) return "Duração entre 15 minutos e 4 horas.";
  if (!["meet", "presencial", "ligacao"].includes(p.formato)) return "Formato inválido.";
  return null;
}

/**
 * Até `max` horários livres no dia (expediente 9h–18h, de meia em meia hora), sem bater em nada ocupado —
 * nem no Google Agenda da Lone, nem em outra reunião do Comercial — e nunca a menos de 30 min de agora.
 */
export function horariosLivres(p: {
  dia: string; duracao: number; ocupados: { inicio: string; fim: string }[]; agora: Date;
  de?: number; ate?: number; passo?: number; max?: number;
}): string[] {
  const { de = 9, ate = 18, passo = 30, max = 3 } = p;
  const livres: string[] = [];
  for (let min = de * 60; min + p.duracao <= ate * 60; min += passo) {
    const hora = `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
    const ini = Date.parse(inicioDe(p.dia, hora));
    const fim = ini + p.duracao * 60_000;
    if (ini < p.agora.getTime() + 30 * 60_000) continue;
    if (p.ocupados.some((o) => Date.parse(o.inicio) < fim && Date.parse(o.fim) > ini)) continue;
    livres.push(hora);
    if (livres.length >= max) break;
  }
  return livres;
}

// ─── Textos (fixos, sem valor) ───────────────────────────────────────────────────────────────────────

const nome = (l: LeadDaReuniao) => l.empresa || l.contatoNome;
const primeiroNome = (l: LeadDaReuniao) => {
  const n = (l.contatoNome || "").trim().split(/\s+/)[0];
  return n && n.toLowerCase() !== (l.empresa || "").trim().split(/\s+/)[0]?.toLowerCase() ? n : null;
};
const mapa = (endereco: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;

function ondeLinha(r: Pick<ReuniaoBase, "formato" | "meetUrl" | "local">, l: LeadDaReuniao): string {
  if (r.formato === "meet") return r.meetUrl ? `Google Meet: ${r.meetUrl}` : "Google Meet (link no convite)";
  if (r.formato === "presencial") {
    const end = r.local || l.endereco || l.cidade;
    return end ? `Presencial: ${end} — ${mapa(end)}` : "Presencial";
  }
  return l.telefone ? `Ligação: ${formatarWhatsapp(l.telefone)}` : "Ligação";
}

export function tituloDoEvento(l: LeadDaReuniao, formato: Formato): string {
  return `${formato === "presencial" ? "Visita" : "Reunião"} Lone Mídia · ${nome(l)}`;
}

export function descricaoDoEvento(l: LeadDaReuniao, pauta: string | null): string {
  return [
    `Reunião com ${nome(l)}${l.empresa && l.contatoNome && l.contatoNome !== l.empresa ? ` (${l.contatoNome})` : ""}.`,
    pauta?.trim() ? `Pauta: ${pauta.trim()}` : "Pauta: raio-x do marketing da loja e próximos passos.",
    "Marcado pelo Comercial do Lone OS.",
  ].join("\n");
}

export function textoMarcadaGrupo(r: Pick<ReuniaoBase, "inicio" | "fim" | "formato" | "meetUrl" | "local">, l: LeadDaReuniao, autor: string | null): string {
  return [
    "*Reunião marcada*",
    `*${nome(l)}*${l.empresa && l.contatoNome && l.contatoNome !== l.empresa ? ` (${l.contatoNome})` : ""}`,
    `${diaCurto(r.inicio)} às ${horaCurta(r.inicio)} (${duracaoMin(r)} min)`,
    ondeLinha(r, l),
    autor ? `Marcada por ${autor.split(" ")[0]}. Lembrete aqui na véspera às 9h e 1 hora antes.` : "Lembrete aqui na véspera às 9h e 1 hora antes.",
  ].join("\n");
}

export function textoVesperaGrupo(r: Pick<ReuniaoBase, "inicio" | "formato" | "meetUrl" | "local">, l: LeadDaReuniao): string {
  return [
    `*Amanhã às ${horaCurta(r.inicio)}*: reunião com *${nome(l)}*`,
    ondeLinha(r, l),
    "Confirme com o lead hoje — a mensagem está pronta no Comercial → Hoje.",
  ].join("\n");
}

export function textoHoraGrupo(r: Pick<ReuniaoBase, "inicio" | "formato" | "meetUrl" | "local">, l: LeadDaReuniao, agora: Date): string {
  const faltam = Math.max(0, Math.round((Date.parse(r.inicio) - agora.getTime()) / 60_000));
  const quando = faltam >= 50 ? "Em 1 hora" : faltam <= 5 ? "Agora" : `Em ${faltam} min`;
  return [`*${quando} (${horaCurta(r.inicio)})*: reunião com *${nome(l)}*`, ondeLinha(r, l)].join("\n");
}

export function textoRemarcadaGrupo(antes: string, r: Pick<ReuniaoBase, "inicio" | "fim" | "formato" | "meetUrl" | "local">, l: LeadDaReuniao): string {
  return [`*Reunião remarcada*: *${nome(l)}*`, `De ${diaCurto(antes)} ${horaCurta(antes)} para ${diaCurto(r.inicio)} às ${horaCurta(r.inicio)}`, ondeLinha(r, l)].join("\n");
}

export function textoCanceladaGrupo(r: Pick<ReuniaoBase, "inicio">, l: LeadDaReuniao): string {
  return `*Reunião cancelada*: *${nome(l)}* — era ${diaCurto(r.inicio)} às ${horaCurta(r.inicio)}. O convite foi cancelado no Google Agenda.`;
}

/** Confirmação para o lead (rascunho do WhatsApp — quem manda é o comercial). */
export function mensagemConfirmacaoLead(r: Pick<ReuniaoBase, "inicio" | "formato" | "meetUrl" | "local">, l: LeadDaReuniao, temEmail: boolean): string {
  const oi = primeiroNome(l) ? `Oi, ${primeiroNome(l)}!` : "Oi, tudo bem?";
  const onde = r.formato === "meet" ? `pelo Google Meet${r.meetUrl ? `: ${r.meetUrl}` : ""}` : r.formato === "presencial" ? `aí na loja${r.local ? ` (${r.local})` : ""}` : "por ligação, eu te ligo";
  return `${oi} Combinado: nossa conversa fica para ${diaCurto(r.inicio)}, às ${horaCurta(r.inicio)}, ${onde}.${temEmail ? " Mandei o convite no seu e-mail também." : ""} Qualquer coisa, me chama aqui.`;
}

/** Pedido de confirmação na véspera (rascunho do WhatsApp). */
export function mensagemVesperaLead(r: Pick<ReuniaoBase, "inicio" | "formato" | "meetUrl" | "local">, l: LeadDaReuniao): string {
  const oi = primeiroNome(l) ? `Oi, ${primeiroNome(l)}!` : "Oi, tudo bem?";
  const onde = r.formato === "meet" ? `pelo Meet${r.meetUrl ? ` (${r.meetUrl})` : ""}` : r.formato === "presencial" ? "aí na loja" : "por ligação";
  return `${oi} Passando para confirmar nossa conversa amanhã, às ${horaCurta(r.inicio)}, ${onde}. Está de pé?`;
}

// ─── Quando lembrar ──────────────────────────────────────────────────────────────────────────────────

/**
 * Véspera: no dia anterior a partir das 9h (de São Paulo), uma vez, se ainda faltar mais de 2 horas.
 * Uma hora antes: quando faltar 60 minutos ou menos, uma vez. Reunião marcada para dali a 40 minutos ganha
 * só o "em 40 min" — não um "amanhã" que já passou.
 */
export function lembretesDevidos(r: ReuniaoBase, agora: Date): { vespera: boolean; hora: boolean } {
  if (r.estado !== "agendada") return { vespera: false, hora: false };
  const ini = Date.parse(r.inicio);
  const falta = ini - agora.getTime();
  if (falta <= 0) return { vespera: false, hora: false };
  const hojeSP = diaSP(agora.toISOString());
  const vesperaDia = diaSP(new Date(ini - 86_400_000).toISOString());
  const horaAgora = Number(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
  const vespera = !r.lembreteVesperaEm && hojeSP === vesperaDia && horaAgora >= 9 && falta > 2 * 3_600_000;
  const hora = !r.lembreteHoraEm && falta <= 60 * 60_000;
  return { vespera, hora };
}

/** Itens do Hoje que as reuniões geram: as de hoje, as de amanhã para confirmar e as que acabaram sem registro. */
export function itensDeReuniao<R extends ReuniaoBase>(reunioes: R[], agora: Date): { hoje: R[]; confirmarAmanha: R[]; comoFoi: R[] } {
  const hoje = diaSP(agora.toISOString());
  const amanha = diaSP(new Date(agora.getTime() + 86_400_000).toISOString());
  const ag = reunioes.filter((r) => r.estado === "agendada");
  return {
    hoje: ag.filter((r) => diaSP(r.inicio) === hoje && Date.parse(r.fim) + 30 * 60_000 > agora.getTime()).sort((a, b) => a.inicio.localeCompare(b.inicio)),
    confirmarAmanha: ag.filter((r) => diaSP(r.inicio) === amanha).sort((a, b) => a.inicio.localeCompare(b.inicio)),
    comoFoi: ag.filter((r) => Date.parse(r.fim) + 30 * 60_000 <= agora.getTime()).sort((a, b) => a.inicio.localeCompare(b.inicio)),
  };
}

/** Hora dita na frase do grupo: "15h", "15h30", "15:30", "às 10", "3 da tarde". Sem hora → null. */
export function horaPorFrase(texto: string): string | null {
  const t = (texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  let h: number | null = null, m = 0;
  const hm = /\b(\d{1,2})\s*(?:h|:)\s*(\d{2})\b/.exec(t) ?? /\b(\d{1,2})\s*h(?:oras?)?\b/.exec(t) ?? /\bas\s+(\d{1,2})\b/.exec(t);
  if (hm) { h = Number(hm[1]); m = hm[2] ? Number(hm[2]) : 0; }
  if (h == null) return null;
  if (/\b(da|de)\s+tarde\b|\bda noite\b/.test(t) && h < 12) h += 12;
  if (h > 23 || m > 59) return null;
  if (h < 7 && !/\bmadrugada|manha\b/.test(t)) h += 12; // "às 3" num contexto comercial = 15h
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
