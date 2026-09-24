export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// Idempotência por chave do cliente (criação em lote): cada linha manda a sua. Por título não dá —
// três "Dica da semana" no mesmo lote viravam um card só. Memória do processo basta (1 container).
const JANELA_MS = 2 * 60_000;
const porChave = new Map<string, { id: string; em: number }>();
function lembrar(chave: string, id: string) {
  const agora = Date.now();
  for (const [k, v] of porChave) if (agora - v.em > JANELA_MS) porChave.delete(k);
  porChave.set(chave, { id, em: agora });
}

/**
 * POST /api/content-cards/create
 *
 * Cria um content_card via service_role (bypassa RLS).
 * Aceita LocalSession — não exige Supabase auth real.
 */
export async function POST(req: NextRequest) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !body.clientId || !body.title) {
    return NextResponse.json({ error: "clientId e title são obrigatórios" }, { status: 400 });
  }

  try {
    const titulo = String(body.title).trim();
    const chave = typeof body.idempotencyKey === "string" && body.idempotencyKey ? `${user.id}|${body.idempotencyKey}` : null;
    if (chave) {
      const visto = porChave.get(chave);
      if (visto && Date.now() - visto.em <= JANELA_MS) return NextResponse.json({ id: visto.id, dedupe: true });
    } else {
      // IDEMPOTÊNCIA (16/09): 28 cards duplicados em 30 dias — mesmo cliente+título pela mesma pessoa
      // em segundos. Dentro de 2 min, devolve o existente em vez de criar outro.
      const desde = new Date(Date.now() - JANELA_MS).toISOString();
      const { data: existente } = await supabaseAdmin.from("content_cards").select("id").eq("client_id", body.clientId).eq("title", titulo).is("archived_at", null).gte("created_at", desde).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (existente?.id) return NextResponse.json({ id: existente.id, dedupe: true });
    }

    const { data, error } = await supabaseAdmin.from("content_cards").insert({
      title: titulo,
      client_id: body.clientId,
      client_name: body.clientName ?? "",
      social_media: body.socialMedia ?? null,
      status: body.status ?? "ideas",
      priority: body.priority ?? "medium",
      format: body.format ?? null,
      platform: body.platform ?? null,
      due_date: body.dueDate ?? null,
      due_time: body.dueTime ?? null,
      briefing: body.briefing ?? null,
      caption: body.caption ?? null,
      requested_by_traffic: body.requestedByTraffic ?? null,
      status_changed_at: new Date().toISOString(),
      column_entered_at: { [body.status ?? "ideas"]: new Date().toISOString() },
    }).select("id").single();

    if (error) {
      console.error("[content-cards/create]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (chave) lembrar(chave, data.id as string);

    // ALERTA direcionado ao social responsável pelo card (bell + toast + notificação do SO).
    // Quem criou o próprio card não é avisado dele — o nome vem do corpo ou da sessão.
    let criador = typeof body.createdBy === "string" ? body.createdBy : "";
    if (body.socialMedia && !criador && user.email) {
      const { data: tm } = await supabaseAdmin.from("team_members").select("name").eq("email", user.email.toLowerCase()).maybeSingle();
      criador = (tm?.name as string) ?? "";
    }
    if (body.socialMedia && body.socialMedia !== criador) {
      const quando = body.dueDate ? ` (${String(body.dueDate).slice(8, 10)}/${String(body.dueDate).slice(5, 7)})` : "";
      await supabaseAdmin.from("notifications").insert({
        type: "content",
        title: "🖼️ Novo card de conteúdo pra você",
        body: `${body.title}${body.clientName ? ` — ${body.clientName}` : ""}${quando}`,
        client_id: body.clientId,
        // COM O CARD: o social clica no aviso e cai NO card que acabaram de abrir pra ele. Sem
        // isso caía no cadastro do cliente e ele tinha que garimpar no quadro. Aqui o id existe
        // (acabou de ser criado) — não dependia de resolver nada.
        card_id: data.id,
        target_user: body.socialMedia,
      }).then(() => {}, () => {});
    }

    return NextResponse.json({ id: data.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[content-cards/create] unhandled:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
