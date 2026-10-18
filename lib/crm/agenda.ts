// lib/crm/agenda.ts — os compromissos da AGENDA do Comercial (redesign D4, out/2026). Antes a agenda só lia
// "data da reunião" e "próximo contato" — e ficava vazia com 20 follow-ups pendentes, porque o follow-up de
// verdade mora na régua (lib/crm/cadencia.ts) e no "retomar em" (o "Adiar" do Hoje e o Loninho do grupo).
// Módulo PURO, testado.

import { ehAberta } from "@/lib/crm/etapas";
import { proximoToque, ROTULO_CANAL } from "@/lib/crm/cadencia";
import { inicioDaCadencia, type LeadHoje } from "@/lib/crm/hoje";

export type TipoEvento = "reuniao" | "regua" | "retomar" | "contato";
export interface Evento<L> { lead: L; data: string; tipo: TipoEvento; rotulo: string }

export const ROTULO_EVENTO: Record<TipoEvento, string> = {
  reuniao: "Reunião", regua: "Follow-up da régua", retomar: "Retomar", contato: "Contato marcado",
};

export function eventosDaAgenda<L extends LeadHoje>(leads: L[], hoje: string): { porDia: Map<string, Evento<L>[]>; proximos: Evento<L>[]; atrasados: Evento<L>[] } {
  const evs: Evento<L>[] = [];
  for (const l of leads) {
    const aberto = ehAberta(l.estagio);
    if (l.reuniaoData && aberto) evs.push({ lead: l, data: l.reuniaoData, tipo: "reuniao", rotulo: ROTULO_EVENTO.reuniao });
    if (!aberto) continue;
    const datasDoLead = new Set<string>();
    if (l.retomarEm) {
      // Estacionado de propósito (ou retomada vencendo): a retomada É o próximo compromisso.
      evs.push({ lead: l, data: l.retomarEm, tipo: "retomar", rotulo: ROTULO_EVENTO.retomar });
      datasDoLead.add(l.retomarEm);
    } else {
      const t = proximoToque({ estagio: l.estagio, inicio: inicioDaCadencia(l), toques: l.avancos ?? [], hoje, retomarEm: l.retomarEm });
      if (t) {
        evs.push({ lead: l, data: t.data, tipo: "regua", rotulo: `${ROTULO_CANAL[t.passo.canal]} da régua` });
        datasDoLead.add(t.data);
      }
    }
    if (l.proximoContato && !datasDoLead.has(l.proximoContato)) evs.push({ lead: l, data: l.proximoContato, tipo: "contato", rotulo: ROTULO_EVENTO.contato });
  }
  evs.sort((a, b) => a.data.localeCompare(b.data) || (a.tipo === "reuniao" ? -1 : 1));
  const porDia = new Map<string, Evento<L>[]>();
  for (const e of evs) porDia.set(e.data, [...(porDia.get(e.data) ?? []), e]);
  return { porDia, proximos: evs.filter((e) => e.data >= hoje), atrasados: evs.filter((e) => e.data < hoje) };
}
