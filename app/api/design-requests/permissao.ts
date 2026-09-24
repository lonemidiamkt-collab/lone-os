// app/api/design-requests/permissao.ts — QUEM PODE MEXER NUMA DEMANDA. Regra pura, testada em
// tests/design-requests-permissao.test.ts; a rota só busca o que ela precisa.
//
// Antes a rota de update aceitava qualquer logado: um SDR podia marcar demanda como concluída ou
// passar a demanda do Gabriel pro Rodrigo. A regra:
//   · gestão (admin/manager): tudo
//   · social: mexe no pedido (status, briefing, prazo, anexos), mas não troca o designer
//   · designer: só nas demandas dele; pode ASSUMIR uma (é o "um ajuda o outro") e devolver a que
//     assumiu — mas não entrega a demanda pra um terceiro
//   · resto: não mexe

import { donoDaDemanda } from "@/lib/design/dono";
import type { Papel } from "@/lib/api/require-role";

export interface PedidoDeUpdate {
  status?: unknown;
  assignedDesigner?: unknown;
  attachments?: unknown;
  [campo: string]: unknown;
}

export interface ContextoDemanda {
  clientId: string;
  assignedDesigner: string | null;
  clienteDesigner: string | null;
  anexosAtuais: string[];
}

export type Decisao = { ok: true } | { ok: false; status: 400 | 403; erro: string };

const GESTAO: Papel[] = ["admin", "manager"];

export function podeAtualizarDemanda(
  papel: Papel | null,
  nomeDoUsuario: string,
  demanda: ContextoDemanda,
  pedido: PedidoDeUpdate,
): Decisao {
  if (!papel) return { ok: false, status: 403, erro: "Sem permissão para esta área." };
  const gestao = GESTAO.includes(papel);
  if (!gestao && papel !== "social" && papel !== "designer") {
    return { ok: false, status: 403, erro: "Seu perfil não altera demandas de design." };
  }

  const eu = nomeDoUsuario.trim();
  const dono = donoDaDemanda(
    { clientId: demanda.clientId, assignedDesigner: demanda.assignedDesigner },
    [{ id: demanda.clientId, assignedDesigner: demanda.clienteDesigner }],
  );

  if (pedido.assignedDesigner !== undefined && !gestao) {
    const novo = String(pedido.assignedDesigner ?? "").trim();
    const assumidaPorMim = (demanda.assignedDesigner ?? "").trim() === eu && !!eu;
    const assumir = papel === "designer" && !!eu && novo === eu;
    const devolver = papel === "designer" && novo === "" && assumidaPorMim;
    if (!assumir && !devolver) {
      return { ok: false, status: 403, erro: "Só a gestão troca o designer de uma demanda." };
    }
  }

  if (papel === "designer") {
    const assumindo = pedido.assignedDesigner !== undefined && String(pedido.assignedDesigner ?? "").trim() === eu;
    if (!eu || (dono !== eu && !assumindo)) {
      return { ok: false, status: 403, erro: `Esta demanda é de ${dono ?? "outro designer"}. Assuma a demanda para mexer nela.` };
    }
  }

  // "Concluída" sem arte nenhuma é a entrega falsa: o quadro some com a demanda e o social espera
  // uma arte que não existe. Entrega com card passa por /api/ops/entregar-arte.
  if (pedido.status === "done" && !gestao) {
    const novos = Array.isArray(pedido.attachments) ? pedido.attachments : null;
    const anexos = novos ?? demanda.anexosAtuais;
    if (anexos.length === 0) {
      return { ok: false, status: 400, erro: "Para concluir, anexe a arte (botão Entregar Arte)." };
    }
  }

  return { ok: true };
}
