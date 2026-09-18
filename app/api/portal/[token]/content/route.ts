export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// GET /api/portal/[token]/content — conteúdo/artes ENTREGUES do cliente (pro portal de quem tem
// pacote de social/design). Público via token, igual ao snapshot. Retorna posts com arte, recentes.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, public_report_enabled, public_report_token_revoked_at")
    .eq("public_report_token", token)
    .single();
  if (!client || !client.public_report_enabled || client.public_report_token_revoked_at) {
    return NextResponse.json({ error: "Token inválido ou revogado" }, { status: 404 });
  }

  // Cards ENTREGUES (arte pronta).
  //
  // A capa pode estar em DOIS lugares: `content_cards.image_url` (entrega legada, por link) ou em
  // `card_attachments` (entrega multi-arte, que é o caminho padrão hoje). O portal filtrava só por
  // image_url — e como a entrega atual grava apenas em card_attachments, o cliente abria o portal e
  // NÃO VIA NENHUMA ARTE. Em produção: 60 cards entregues, 0 com image_url, 60 com anexo.
  const { data: cards } = await supabaseAdmin
    .from("content_cards")
    .select("id, title, format, status, image_url, due_date, scheduled_at, publish_verified_at, designer_delivered_at, client_approved_at, archived_at")
    .eq("client_id", client.id as string)
    // ARQUIVADO NÃO É APAGADO (18/09): a equipe arquiva o card depois de postar para limpar o quadro —
    // 25 por dia. O portal excluía arquivados e o cliente abria "Conteúdo" VAZIO (UNAFER: 9 artes
    // entregues, 9 arquivadas, 0 visíveis; Calabria 0/27, CIIL 0/24). Arquivar é organização do time;
    // para o cliente, arte entregue é arte entregue. Só fica de fora o que foi apagado de verdade
    // (não existe apagar: soft-delete é o próprio archived_at + sem entrega — coberto pelo .or).
    .or("image_url.not.is.null,designer_delivered_at.not.is.null")
    .order("due_date", { ascending: false })
    .limit(40);

  // Capa vinda dos anexos (a primeira, por posição) para os cards sem image_url.
  const semCapa = (cards ?? []).filter((c) => !(c.image_url as string)?.trim()).map((c) => c.id as string);
  const capaDeAnexo = new Map<string, string>();
  if (semCapa.length) {
    const { data: anexos } = await supabaseAdmin
      .from("card_attachments").select("card_id, url, position, tipo")
      .in("card_id", semCapa).order("position", { ascending: true });
    // A capa é a ARTE, nunca a referência: "referencia" é o print/foto que o social mandou pro designer
    // (às vezes do próprio cliente, às vezes de concorrente). Preferência: entrega > sem tipo (legado).
    const peso = (t: unknown) => (t === "entrega" ? 0 : t == null ? 1 : 9);
    const melhor = new Map<string, { url: string; peso: number }>();
    for (const a of anexos ?? []) {
      const cid = a.card_id as string; const w = peso(a.tipo);
      if (w === 9 || !(a.url as string)) continue;
      const atual = melhor.get(cid);
      if (!atual || w < atual.peso) melhor.set(cid, { url: a.url as string, peso: w });
    }
    for (const [cid, m] of melhor) capaDeAnexo.set(cid, m.url);
  }

  const items = (cards ?? [])
    .map((c) => ({ ...c, image_url: (c.image_url as string)?.trim() || capaDeAnexo.get(c.id as string) || null }))
    .filter((c) => (c.image_url as string)?.startsWith("http") || (c.image_url as string)?.startsWith("/"))
    .slice(0, 12)
    .map((c) => {
      const aprovada = !!c.client_approved_at;
      const entregue = !!c.designer_delivered_at;
      const publicado = ["published", "scheduled"].includes((c.status as string) || "");
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
        pendente, aprovada,
      };
    })
    .sort((a, b) => Number(b.pendente) - Number(a.pendente) || (b.date ?? "").localeCompare(a.date ?? "")); // pendentes primeiro, depois mais recente

  return NextResponse.json({ items });
}
