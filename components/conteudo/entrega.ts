"use client";

// components/conteudo/entrega.ts — o que a TELA faz depois que a operação de entrega respondeu
// (/api/ops/entregar-arte). Um lugar só para o "Entregar arte" do card e o modo foco do designer
// (Leva 7B, N19): o estado final vem do servidor; o store só reflete.

import { useContentStore, marcarMutacao } from "@/stores/useContentStore";
import { chamar } from "@/lib/api/chamar";
import type { EstadoEntrega } from "@/lib/ops/entregar-arte";
import type { ContentCard, DesignRequest } from "@/lib/types";

/** Reflete no store o card e o pedido como o servidor deixou depois da entrega. */
export function aplicarEntregaNoStore(card: Pick<ContentCard, "id">, estado: EstadoEntrega): void {
  marcarMutacao();
  useContentStore.setState((s) => ({
    contentCards: s.contentCards.map((c) => c.id === card.id ? {
      ...c,
      status: (estado.card.status as ContentCard["status"]) ?? c.status,
      designerDeliveredAt: estado.card.designer_delivered_at ?? undefined,
      designerDeliveredBy: estado.card.designer_delivered_by ?? undefined,
      alteracaoPendenteEm: undefined, alteracaoMotivo: undefined,
      imageUrl: estado.card.image_url ?? c.imageUrl,
    } : c),
    designRequests: estado.demanda
      ? s.designRequests.map((d) => d.id === estado.demanda!.id ? { ...d, status: estado.demanda!.status as DesignRequest["status"], attachments: estado.demanda!.attachments } : d)
      : s.designRequests,
  }));
}

/** Efeitos que não decidem nada: revisão automática por IA contra o briefing e o som. Best-effort. */
export function depoisDaEntrega(card: Pick<ContentCard, "id">): void {
  void chamar("/api/cs/revisar-entrega", { cardId: card.id });
  import("@/lib/audio").then((m) => m.playNotificationSound()).catch(() => {});
}
