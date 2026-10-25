// lib/crm/enviou.ts — "Enviou?" depois de abrir o WhatsApp (24/10/2026, auditoria 4.5). Módulo PURO.
//
// Antes, clicar em "WhatsApp" (no funil, na ficha ou no Hoje) já registrava "enviado": o toque contava, a cadência
// andava e o lead saía de Novo — mesmo quando a pessoa só abriu a conversa e desistiu, ou o WhatsApp nem abriu.
// Agora abrir só ANOTA que falta saber; na volta para a tela o comercial responde "Sim, enviei" ou "Não enviei", e só
// o "Sim" registra (com Desfazer, como qualquer registro).

import type { CrmAtividadeTipo } from "@/lib/types";

export interface EnvioPendente<L> {
  lead: L;
  tipo: CrmAtividadeTipo;
  /** O texto que vai para o histórico se a resposta for "Sim". */
  texto: string;
  abertoEm: string; // ISO
}

/** Mais um WhatsApp aberto: um pendente por lead (abrir duas vezes o mesmo lead pergunta uma vez só, com o último texto). */
export function anotarEnvio<L extends { id: string }>(lista: EnvioPendente<L>[], novo: EnvioPendente<L>): EnvioPendente<L>[] {
  return [...lista.filter((p) => p.lead.id !== novo.lead.id), novo];
}

/** Respondeu (sim ou não): sai da fila. */
export function tirarEnvio<L extends { id: string }>(lista: EnvioPendente<L>[], leadId: string): EnvioPendente<L>[] {
  return lista.filter((p) => p.lead.id !== leadId);
}

/** O texto do histórico quando o WhatsApp foi aberto do funil ou da ficha (sem mensagem pronta). */
export const TEXTO_WHATSAPP_PAINEL = "Mensagem pelo WhatsApp (conversa aberta pelo painel)";

/** O texto do histórico quando a mensagem pronta do Hoje foi aberta no WhatsApp. */
export function textoWhatsappDoHoje(mensagem: string): string {
  return `WhatsApp enviado pelo Hoje: “${mensagem.length > 160 ? `${mensagem.slice(0, 157)}…` : mensagem}”`;
}
