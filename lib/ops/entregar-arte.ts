// lib/ops/entregar-arte.ts — cliente da OPERAÇÃO única de entrega (Fase 1, 18/09).
// Todo botão que "entrega arte" chama isto. Nada mais grava card/demanda/anexo por conta própria.
import { chamar } from "@/lib/api/chamar";

export interface EstadoEntrega {
  delivery: { id: string; version: number; urls: string[] };
  card: { id: string; status: string; designer_delivered_at: string | null; designer_delivered_by: string | null; image_url: string | null; alteracao_pendente_em: string | null };
  demanda: { id: string; status: string; attachments: string[] } | null;
  repetida?: boolean;
}

/** Um id por CLIQUE, gerado uma vez e reaproveitado em qualquer repetição (rede, duplo clique). */
export function novoOperationId(): string {
  return `ent-${Date.now().toString(36)}-${globalThis.crypto?.randomUUID?.().slice(0, 12) ?? Math.random().toString(36).slice(2, 14)}`;
}

export async function entregarArte(p: { cardId: string; designRequestId?: string | null; attachmentIds: string[]; urlsExternas?: string[]; operationId: string }) {
  return chamar<EstadoEntrega & { error?: string }>("/api/ops/entregar-arte", p);
}
