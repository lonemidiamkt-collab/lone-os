// lib/fila/consumidores/aviso-demanda.ts — PRIMEIRO CONSUMIDOR da fila: garante que um card
// criado pelo agente foi avisado. Fase 0B.
//
// O webhook cria o card e, no mesmo fôlego, confirma no grupo. Quando ele morre no meio, o card
// fica órfão de aviso. Este consumidor roda ~2 min depois do INSERT (evento vindo do outbox) e
// pergunta: "a execução que criou este card mandou alguma mensagem DEPOIS de criá-lo?" Se sim,
// não faz nada — a conversa já aconteceu. Se não, manda o aviso que faltou.
//
// A decisão é função pura (decidirAviso) — testada com linha real, sem I/O. O handler só junta os
// dados e executa.

import type PgBoss from "pg-boss";
import { supabaseAdmin } from "@/lib/supabase/server";
import { csSendGroupText } from "@/lib/cs/notify";
import { comExecucao, anotar } from "@/lib/obs/correlacao";

export interface CardCriado {
  id: string;
  client_id: string | null;
  client_name: string | null;
  title: string | null;
  social_media: string | null;
  requested_by_traffic: string | null;
  due_date: string | null;
  status: string | null;
  created_at: string;
  archived_at?: string | null;
}

export interface PayloadCardCriado extends CardCriado {
  outboxId: string;
  correlationId: string | null;
}

export type DecisaoAviso =
  | { acao: "ignorar"; motivo: string }
  | { acao: "pular"; motivo: string }
  | { acao: "avisar"; texto: string; idem: string };

export const ehCardDoAgente = (c: Pick<CardCriado, "requested_by_traffic">) => /agente cs/i.test(c.requested_by_traffic ?? "");

function prazo(d: string | null): string {
  if (!d) return "sem prazo";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}` : d;
}

/**
 * @param card       o card como está AGORA (pode ter sido arquivado nos 2 min)
 * @param avisosDepois mensagens ENVIADAS pela mesma execução depois de o card nascer
 * @param jaAvisouPelaFila já existe envio com o idem deste card (retry depois de um envio que deu certo)
 */
export function decidirAviso(p: {
  card: CardCriado | null;
  correlationId: string | null;
  avisosDepois: number;
  jaAvisouPelaFila: boolean;
}): DecisaoAviso {
  const { card } = p;
  if (!card) return { acao: "ignorar", motivo: "card não existe mais" };
  if (card.archived_at) return { acao: "ignorar", motivo: "card arquivado" };
  if (!ehCardDoAgente(card)) return { acao: "ignorar", motivo: "card humano — o painel avisa pelo sino" };
  const idem = `aviso-demanda:${card.id}`;
  if (p.jaAvisouPelaFila) return { acao: "pular", motivo: "a fila já avisou este card" };
  if (!p.correlationId) return { acao: "ignorar", motivo: "card sem execução — não dá para saber se avisaram; não arrisco duplicar" };
  if (p.avisosDepois > 0) return { acao: "pular", motivo: `a execução confirmou na hora (${p.avisosDepois} msg)` };
  const texto =
    `📌 Criei o card *${(card.title ?? "sem título").slice(0, 80)}* da *${card.client_name ?? "cliente"}*` +
    ` (dono: ${card.social_media || "sem dono"}, prazo ${prazo(card.due_date)}) — o aviso na hora não saiu, então tô confirmando por aqui.\n` +
    `Se não era pra criar, me fala que eu arquivo.`;
  return { acao: "avisar", texto, idem };
}

export async function consumirContentCardCreated(jobs: PgBoss.Job<PayloadCardCriado>[]): Promise<void> {
  for (const job of jobs) {
    const d = job.data;
    await comExecucao({ origem: "fila:content_card.created", ator: "agente", extra: { outboxId: d.outboxId, cardId: d.id, correlacaoOrigem: d.correlationId } }, async () => {
      const { data: card, error } = await supabaseAdmin.from("content_cards")
        .select("id, client_id, client_name, title, social_media, requested_by_traffic, due_date, status, created_at, archived_at")
        .eq("id", d.id).maybeSingle();
      if (error) throw new Error(`content_cards: ${error.message}`); // retry: banco indisponível não é "card sumiu"

      const idem = `aviso-demanda:${d.id}`;
      const [{ data: pelaFila }, { count }] = await Promise.all([
        supabaseAdmin.from("cs_outbound").select("id").eq("idem_key", idem).eq("enviado", true).limit(1),
        d.correlationId
          ? supabaseAdmin.from("cs_outbound").select("id", { count: "exact", head: true })
              .eq("correlation_id", d.correlationId).eq("enviado", true).gte("created_at", (card?.created_at as string) ?? d.created_at)
          : Promise.resolve({ count: 0 }),
      ]);

      const dec = decidirAviso({
        card: (card as CardCriado | null) ?? null,
        correlationId: d.correlationId,
        avisosDepois: count ?? 0,
        jaAvisouPelaFila: !!pelaFila?.length,
      });
      anotar(`${dec.acao}: ${dec.acao === "avisar" ? "aviso enviado" : dec.motivo}`);
      if (dec.acao !== "avisar") return { acao: dec.acao, motivo: dec.motivo };

      const destino = process.env.CS_INTERNAL_GROUP_JID;
      if (!destino) throw new Error("CS_INTERNAL_GROUP_JID ausente");
      const r = await csSendGroupText(destino, dec.texto, undefined, { origem: "fila:aviso-demanda", destino: "interno", clientId: card?.client_id ?? null, idem: dec.idem });
      if (!r.ok) throw new Error(`envio falhou: ${r.error ?? "?"}`); // retry com backoff; idem evita duplicar
      return { acao: "avisar", cardId: d.id };
    });
  }
}
