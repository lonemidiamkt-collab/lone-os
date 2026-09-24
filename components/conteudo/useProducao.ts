"use client";

// components/conteudo/useProducao.ts — o que a tela faz quando alguém move um card ou mexe na arte.
// Uma regra só (lib/conteudo/producao.ts → planejarMovimento), usada pelo quadro, pelo seletor de
// etapa do card e pelo card aberto. Quem precisa de dado extra (arquivos, motivo) recebe de volta
// o pedido para abrir o modal certo.

import { toast } from "sonner";
import { useContentStore } from "@/stores/useContentStore";
import { useRole } from "@/lib/context/RoleContext";
import { infoEtapa, type Etapa } from "@/lib/conteudo/etapas";
import { camposDaTroca, planejarMovimento, ROTULO_ESTADO_DESIGN, type AcaoDesign, type Movimento } from "@/lib/conteudo/producao";
import { pedidoDoCard, paraPedidoDesign } from "@/lib/conteudo/quadro";
import type { ContentCard } from "@/lib/types";

/** O que o chamador precisa abrir depois de um movimento. */
export type Pendencia = null | { tipo: "entregar"; card: ContentCard } | { tipo: "alteracao"; card: ContentCard };

const SUCESSO: Partial<Record<AcaoDesign["tipo"], (titulo: string) => string>> = {
  pedir_arte: (t) => `"${t}" foi pro designer.`,
  iniciar: (t) => `Você pegou "${t}".`,
  pedir_alteracao: (t) => `"${t}" voltou pro designer com o pedido de alteração.`,
  bloquear: (t) => `"${t}" foi devolvido ao social.`,
  desbloquear: (t) => `"${t}" voltou pra fila do designer.`,
  cancelar_pedido: (t) => `Pedido de arte de "${t}" cancelado — o card voltou pra Pauta.`,
};

export function useProducao() {
  const { role, currentUser } = useRole();
  const pedidos = useContentStore((s) => s.designRequests);
  const updateContentCard = useContentStore((s) => s.updateContentCard);
  const transicaoDesign = useContentStore((s) => s.transicaoDesign);

  /** Planeja o arraste do card para `destino` (sem executar). */
  const planejar = (card: ContentCard, destino: Etapa): Movimento => planejarMovimento(
    {
      id: card.id, status: card.status, archivedAt: card.archivedAt ?? null, dueDate: card.dueDate ?? null,
      designRequestId: card.designRequestId ?? null, designerDeliveredAt: card.designerDeliveredAt ?? null,
      alteracaoPendenteEm: card.alteracaoPendenteEm ?? null,
    },
    paraPedidoDesign(pedidoDoCard(card, pedidos)),
    destino,
    role,
  );

  /** Uma ação na arte (servidor). true = deu certo. A falha vira toast com a frase do servidor. */
  const acao = async (card: ContentCard, a: AcaoDesign, extras?: { briefing?: string | null }): Promise<boolean> => {
    try {
      const r = await transicaoDesign(card.id, a, extras);
      const msg = SUCESSO[a.tipo]?.(card.title);
      if (msg && !r.card?.archivedAt) toast.success(msg);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui mexer na arte.");
      return false;
    }
  };

  /**
   * Move o card para `destino`. Devolve o que ainda falta a pessoa fazer (anexar a arte, dizer o
   * motivo da alteração) — ou null quando já está feito (ou foi recusado, com o motivo no toast).
   */
  const mover = async (card: ContentCard, destino: Etapa): Promise<Pendencia> => {
    const mov = planejar(card, destino);
    switch (mov.tipo) {
      case "nada": return null;
      case "recusar": toast.error(mov.motivo); return null;
      case "entregar": return { tipo: "entregar", card };
      case "alteracao": return { tipo: "alteracao", card };
      case "design": await acao(card, mov.acao); return null;
      case "status": {
        const campos = camposDaTroca(card, mov.status, currentUser, new Date().toISOString());
        await updateContentCard(card.id, campos as Partial<ContentCard>)
          .then(() => toast.success(`"${card.title}" → ${infoEtapa(destino).rotulo}.`))
          .catch(() => {}); // o store já avisou e desfez
        return null;
      }
    }
  };

  return { mover, acao, planejar, papel: role, eu: currentUser, rotuloEstado: ROTULO_ESTADO_DESIGN };
}
