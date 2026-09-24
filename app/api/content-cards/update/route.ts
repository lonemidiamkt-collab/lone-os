export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { papelDoUsuario, GESTAO } from "@/lib/api/require-role";
import { montarUpdate } from "../campos";
import { etapaDoStatus } from "@/lib/conteudo/etapas";
import { planejarMovimento, type AcaoDesign, type StatusDoPedido } from "@/lib/conteudo/producao";
import { executarTransicao, lerCardEPedido, nomeDoMembro } from "@/lib/conteudo/producao-server";
import { registrarAvaliacao } from "@/lib/conteudo/avaliacao-server";

// Colunas que só descrevem a troca de etapa — quando a troca vira transição de design, quem grava
// é a transição, não este update.
const COLUNAS_DA_ETAPA = ["status", "status_changed_at", "column_entered_at"];

export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { id, ...updates } = body as Record<string, unknown>;

  // contentApproval NÃO é coluna de content_cards — é uma linha na tabela
  // content_approvals (aprovar/reprovar arte). Separa antes de montar o update,
  // senão o Postgres rejeita a query inteira (coluna inexistente) → "Falha ao confirmar a arte".
  let contentApproval = updates.contentApproval as
    | { status: string; reviewedBy?: string; reviewedAt?: string; reason?: string }
    | undefined;
  delete updates.contentApproval;

  const papel = await papelDoUsuario(user);
  const gestao = !!papel && GESTAO.includes(papel);
  const montado = montarUpdate(updates, { gestao, podeArquivar: gestao || papel === "social" });
  if (!montado.ok) return NextResponse.json({ error: montado.erro }, { status: montado.status });
  const row = montado.row;

  if (Object.keys(row).length === 0 && !contentApproval) {
    return NextResponse.json({ success: true });
  }

  try {
    // ─── TROCA DE ETAPA QUE MEXE NA ARTE (Leva 5b) ────────────────────────────
    // Entrar em "Com o designer" é pedir arte; voltar pra lá é pedir alteração; devolver é bloquear.
    // Isso não é mais um status solto que alguém sincroniza depois: passa pela transição de design
    // (lib/conteudo/producao-server.ts), que abre/reabre o pedido junto. Passar da etapa de design
    // sem a arte entregue é recusado aqui também — não só na tela.
    if (typeof row.status === "string") {
      const { card, pedido } = await lerCardEPedido(id as string);
      if (card && row.status !== card.status) {
        const quem = (await nomeDoMembro(user.email)) || user.email || "equipe";
        let acao: AcaoDesign | null = null;
        let origemSocial = false;
        if (row.status === "blocked") {
          acao = { tipo: "bloquear", motivo: String(row.blocked_reason ?? "") || "Devolvido pelo designer", quem };
          delete row.blocked_reason; delete row.blocked_by; delete row.blocked_at;
        } else {
          const mov = planejarMovimento(
            {
              id: card.id as string, status: card.status as never, archivedAt: (card.archived_at as string) ?? null,
              dueDate: (row.due_date as string) ?? (card.due_date as string) ?? null,
              designRequestId: (card.design_request_id as string) ?? null,
              designerDeliveredAt: (card.designer_delivered_at as string) ?? null,
              alteracaoPendenteEm: (card.alteracao_pendente_em as string) ?? null,
            },
            pedido ? { id: pedido.id as string, status: pedido.status as StatusDoPedido } : null,
            etapaDoStatus(row.status),
            papel,
          );
          if (mov.tipo === "design") acao = mov.acao;
          else if (mov.tipo === "alteracao" && contentApproval?.status === "rejected" && contentApproval.reason) {
            acao = { tipo: "pedir_alteracao", motivo: contentApproval.reason };
            origemSocial = true;
            contentApproval = undefined; // a transição grava a reprovação
          } else if (mov.tipo === "alteracao") {
            return NextResponse.json({ error: "Para mandar de volta ao designer, use \"Pedir alteração\" e diga o que mudar." }, { status: 409 });
          } else if (mov.tipo === "entregar") {
            return NextResponse.json({ error: "A arte ainda não foi entregue — a entrega vai pelo \"Entregar arte\"." }, { status: 409 });
          } else if (mov.tipo === "recusar") {
            return NextResponse.json({ error: mov.motivo }, { status: 409 });
          }
        }
        if (acao) {
          const r = await executarTransicao(id as string, acao, { quem, origem: origemSocial ? "social" : undefined });
          if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
          for (const c of COLUNAS_DA_ETAPA) delete row[c];
        }
      }
    }

    if (Object.keys(row).length > 0) {
      const { error } = await supabaseAdmin.from("content_cards").update(row).eq("id", id as string);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ─── CONFERE A ARTE CONTRA AS REGRAS DO CLIENTE, NA ENTREGA ───────────────
    // A verificação existia (api/cs/verificar-arte-regras) e NUNCA era chamada — zero notificações
    // na base inteira. É aqui que ela faz sentido: no instante em que o designer marca a entrega,
    // antes da peça ir pro cliente. Se o cliente já corrigiu o endereço uma vez, essa regra está
    // guardada e o time é avisado ANTES de errar de novo.
    // Não bloqueia a entrega e não espera: erro aqui não pode impedir o designer de entregar.
    if (row.designer_delivered_at) {
      void import("@/lib/cs/verificar-arte")
        .then(({ verificarArteDoCard }) => verificarArteDoCard(id as string))
        .then((r) => { if (r.status === "alertado") console.warn(`[content-cards] arte pode violar regra (${id}): ${r.resumo}`); })
        .catch((e) => console.error("[content-cards] verificação de arte falhou (ignorado):", e));
    }

    // Prazo e título do pedido de arte NÃO são mais copiados daqui: o banco espelha (trigger
    // content_cards_espelha_pedido, migration 20260924200000) — vale para qualquer caminho que
    // mexa no card, não só este.

    if (contentApproval) {
      const av = await registrarAvaliacao(id as string, contentApproval);
      if (!av.ok) return NextResponse.json({ error: av.erro }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
