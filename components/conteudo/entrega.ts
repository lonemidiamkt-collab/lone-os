"use client";

// components/conteudo/entrega.ts — o que a TELA faz depois que a operação de entrega respondeu
// (/api/ops/entregar-arte). Um lugar só para o "Entregar arte" do card e o modo foco do designer
// (Leva 7B, N19): o estado final vem do servidor; o store só reflete.

import { toast } from "sonner";
import { useContentStore, marcarMutacao } from "@/stores/useContentStore";
import { chamar } from "@/lib/api/chamar";
import { trilha } from "@/lib/obs/trilha";
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
  // 24/10/2026 (2.9): a revisão que não chegava ao servidor (rede, deploy) não deixava rastro. O
  // servidor comenta no card quando não roda; se nem chegou lá, quem entregou fica sabendo aqui.
  void chamar("/api/cs/revisar-entrega", { cardId: card.id }).then((r) => {
    if (r.ok) return;
    trilha("entrega:revisao-nao-rodou", { card: card.id, status: r.status });
    toast.warning(`A revisão automática da arte não rodou (${r.erro ?? "erro"}). A entrega valeu — confira a arte à mão ou use "Revisar arte" no card.`, { duration: 9000 });
  });
  import("@/lib/audio").then((m) => m.playNotificationSound()).catch(() => {});
}
