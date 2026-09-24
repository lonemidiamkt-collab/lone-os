export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { comExecucao, anotar, idCorrelacao } from "@/lib/obs/correlacao";
import { executarTransicao } from "@/lib/conteudo/producao-server";

// POST /api/ops/entregar-arte — a OPERAÇÃO de entregar arte (Fase 1 do domínio criativo).
// { cardId, designRequestId?, attachmentIds[], urlsExternas?[], operationId }
// Tudo que precisa concordar (anexos → entrega, versão da entrega, card, demanda, audit) acontece
// numa transação no banco (entregar_arte). Idempotente por operationId. Devolve o estado final.
// Só depois do commit: a transição "entregue" (lib/conteudo/producao-server.ts) leva o card pra
// Revisão interna (Leva 5b — a entrega é o que tira o card do designer), depois o aviso ao social; a
// revisão por IA é disparada pelo cliente (best-effort, como antes).
export async function POST(req: NextRequest) {
  const gate = await requireRole(req, ["designer", "admin", "manager"]);
  if (gate instanceof NextResponse) return gate;
  const b = await req.json().catch(() => null) as { cardId?: string; designRequestId?: string | null; attachmentIds?: string[]; urlsExternas?: string[]; operationId?: string } | null;
  if (!b?.cardId || !b.operationId || (!b.attachmentIds?.length && !b.urlsExternas?.length)) {
    return NextResponse.json({ error: "cardId, operationId e pelo menos uma arte (anexo ou link) são obrigatórios" }, { status: 400 });
  }
  return comExecucao({ origem: "ops:entregar-arte", ator: gate.user.email, papel: gate.papel }, async () => {
    const { data: tm } = await supabaseAdmin.from("team_members").select("name").eq("email", gate.user.email).maybeSingle();
    const quem = (tm?.name as string) || gate.user.email || "designer";
    const { data, error } = await supabaseAdmin.rpc("entregar_arte", {
      p_card_id: b.cardId, p_design_request_id: b.designRequestId ?? null,
      p_attachment_ids: b.attachmentIds ?? [], p_urls_externas: b.urlsExternas ?? [],
      p_quem: quem, p_operation_id: b.operationId, p_correlation_id: idCorrelacao(),
    });
    if (error) {
      // Mensagens da função são escritas para a pessoa ler (não código de erro).
      const status = /não encontrad/i.test(error.message) ? 404 : /arquivado|não pode ser entregue|não pertence|sem arte|obrigatório/i.test(error.message) ? 409 : 500;
      anotar(`entregar_arte recusada: ${error.message}`);
      return NextResponse.json({ error: error.message }, { status });
    }
    const estado = data as { repetida?: boolean; delivery: { version: number; urls: string[] }; card: { id: string; status?: string }; demanda: { id: string } | null };
    // A entrega já está gravada (arte, versão, pedido concluído). Falta a ETAPA: o card sai de "Com o
    // designer" pra "Revisão interna". Idempotente — na repetição não muda nada.
    const etapa = await executarTransicao(b.cardId!, { tipo: "entregue", quem }, { quem, operationId: `${b.operationId}:etapa` });
    if (etapa.ok) estado.card.status = etapa.card.status as string;
    else anotar(`entregue: a arte foi gravada mas a etapa não andou (${etapa.erro})`);
    if (!estado.repetida) {
      const { data: card } = await supabaseAdmin.from("content_cards").select("title, client_id, client_name, social_media").eq("id", b.cardId).maybeSingle();
      // Aviso ao social (sino) + revisão por IA — fora da transação, nunca bloqueiam a entrega.
      if (card) {
        await supabaseAdmin.from("notifications").insert({
          type: "content", title: "Arte entregue pelo Designer",
          body: `"${card.title}" (${card.client_name}) — v${estado.delivery.version}, ${estado.delivery.urls.length} arte(s). Pronta para conferir.`,
          client_id: card.client_id, target_user: card.social_media ?? null, card_id: b.cardId,
        }).then(({ error: e }) => { if (e) console.error("[entregar-arte] notificação:", e.message); });
      }
    }
    anotar(`entregar_arte ${b.cardId} v${estado.delivery.version} (${estado.delivery.urls.length} artes)${estado.repetida ? " [repetida]" : ""}`);
    return NextResponse.json(estado);
  });
}
