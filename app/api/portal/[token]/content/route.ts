export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { ETAPAS_FINAIS, statusNaEtapa } from "@/lib/conteudo/etapas";
import { capasDosAnexos, podePedirAlteracao } from "@/lib/portal/agenda";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { estaPausado } from "@/lib/clients/pausa";

// GET /api/portal/[token]/content — conteúdo/artes ENTREGUES do cliente (pro portal de quem tem
// pacote de social/design). Público via token, igual ao snapshot. Retorna posts com arte, recentes.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, public_report_enabled, public_report_token_revoked_at, active, churned_at, paused_at, paused_until")
    .eq("public_report_token", token)
    .single();
  // Ex-cliente (inativo/arquivado) não acessa mais o portal — ver app/portal/[token]/page.tsx.
  if (!client || !client.public_report_enabled || client.public_report_token_revoked_at || client.active === false || client.churned_at || estaPausado(client)) {
    return NextResponse.json({ error: "Token inválido ou revogado" }, { status: 404 });
  }

  // Cards ENTREGUES (arte pronta).
  //
  // A capa pode estar em DOIS lugares: `content_cards.image_url` (entrega legada, por link) ou em
  // `card_attachments` (entrega multi-arte, que é o caminho padrão hoje). O portal filtrava só por
  // image_url — e como a entrega atual grava apenas em card_attachments, o cliente abria o portal e
  // NÃO VIA NENHUMA ARTE. Em produção: 60 cards entregues, 0 com image_url, 60 com anexo.
  const { data: cards, error: errCards } = await supabaseAdmin
    .from("content_cards")
    .select("id, title, format, status, image_url, due_date, scheduled_at, publish_verified_at, designer_delivered_at, client_approved_at, archived_at")
    .eq("client_id", client.id as string)
    .or("image_url.not.is.null,designer_delivered_at.not.is.null")
    .order("due_date", { ascending: false })
    .limit(60);
  if (errCards) {
    console.error("[portal/content] falhou a leitura dos cards:", client.id, errCards.message);
    return NextResponse.json({ error: "Não consegui carregar suas artes agora." }, { status: 503 });
  }

  // ARQUIVADO: a equipe arquiva depois de POSTAR para limpar o quadro (UNAFER: 9 entregues, 9
  // arquivadas) — esses continuam valendo para o cliente. Mas arquivar também é como se descarta
  // arte recusada ou pedido cancelado, e isso não é do cliente ver. Regra: arquivado só se publicado.
  const visiveis = (cards ?? []).filter((c) =>
    !c.archived_at || statusNaEtapa(c.status as string, "no_ar") || !!c.publish_verified_at);

  // Capa vinda dos anexos (a primeira, por posição) para os cards sem image_url.
  const semCapa = visiveis.filter((c) => !(c.image_url as string)?.trim()).map((c) => c.id as string);
  const capaDeAnexo = new Map<string, string>();
  if (semCapa.length) {
    const { data: anexos } = await supabaseAdmin
      .from("card_attachments").select("card_id, url, position, tipo")
      .in("card_id", semCapa).order("position", { ascending: true });
    // A capa é a ARTE, nunca a referência: "referencia" é o print/foto que o social mandou pro designer
    // (às vezes do próprio cliente, às vezes de concorrente). Regra em lib/portal/agenda.ts.
    for (const [cid, url] of capasDosAnexos((anexos ?? []) as { card_id: string; url: string; tipo: string | null }[])) {
      capaDeAnexo.set(cid, url);
    }
  }

  const items = visiveis
    .map((c) => ({ ...c, image_url: (c.image_url as string)?.trim() || capaDeAnexo.get(c.id as string) || null }))
    .filter((c) => (c.image_url as string)?.startsWith("http") || (c.image_url as string)?.startsWith("/"))
    .slice(0, 12)
    .map((c) => {
      const aprovada = !!c.client_approved_at;
      const entregue = !!c.designer_delivered_at;
      const publicado = statusNaEtapa(c.status as string, ...ETAPAS_FINAIS);
      // Pendente de aprovação DO CLIENTE: arte entregue, ainda não aprovada e ainda não publicada/agendada.
      // Card ARQUIVADO pelo time não está pendente de nada — o time já deu o assunto por encerrado;
      // mostrar "Onboarding" de agosto como "aguardando sua aprovação" confunde o cliente.
      const pendente = entregue && !aprovada && !publicado && !c.archived_at;
      return {
        id: c.id as string,
        title: (c.title as string) || "Post",
        format: (c.format as string) || "",
        status: (c.status as string) || "",
        imageUrl: c.image_url as string,
        // `published_at` NÃO EXISTE em content_cards (a data de publicação é publish_verified_at). O select
        // com a coluna inexistente devolvia 400 e o portal mostrava "Conteúdo" vazio para TODOS os clientes.
        date: (c.publish_verified_at as string) || (c.scheduled_at as string) || (c.due_date as string) || null,
        // Quando a arte foi ENTREGUE pelo time — é por ela que o portal filtra "entregue no período"
        // (antes uma arte de 29/jul aparecia na visão de 7 dias, porque não havia filtro nenhum).
        entregueEm: (c.designer_delivered_at as string) || null,
        pendente, aprovada,
        // N35: arte entregue, aprovada ou agendada (e ainda não no ar) aceita "Pedir alteração" —
        // o pedido vira demanda do time pelo mesmo caminho do WhatsApp (ver /approve).
        podeAlterar: podePedirAlteracao(c),
      };
    })
    .sort((a, b) => Number(b.pendente) - Number(a.pendente) || (b.date ?? "").localeCompare(a.date ?? "")); // pendentes primeiro, depois mais recente

  return NextResponse.json({ items });
}
