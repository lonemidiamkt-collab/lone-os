export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { clienteDoToken } from "@/lib/portal/token";
import { criarLimite } from "@/lib/portal/limite";
import { capasDosAnexos, janelaDaAgenda, mesValido, montarAgenda, type LinhaCardAgenda } from "@/lib/portal/agenda";
import { hojeSP } from "@/lib/clients/pausa";
import { temColunasIg } from "@/lib/conteudo/dados";

// GET /api/portal/[token]/agenda?mes=YYYY-MM — próximos posts (7 dias) e o calendário do mês (N36).
//
// Público via token, como o resto do portal. Só entra card que já é compromisso com o cliente
// (Agendado, No ar ou aprovado por ele) e só com os campos da lista de lib/portal/agenda.ts —
// nada de briefing, observação, responsável ou pedido ao designer.

const LIMITE = criarLimite(40, 60_000); // 40 leituras/min por cliente

const COLS = "id, title, format, status, due_date, due_time, scheduled_at, publish_verified_at, client_approved_at, designer_delivered_at, archived_at, image_url";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const cliente = await clienteDoToken(token);
  if (!cliente) return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 404 });
  if (LIMITE.estourou(cliente.id)) return NextResponse.json({ error: "Muitas buscas seguidas. Tente em 1 minuto." }, { status: 429 });

  const hoje = hojeSP();
  const pedido = req.nextUrl.searchParams.get("mes");
  const mes = mesValido(pedido) ? pedido : hoje.slice(0, 7);
  const { de, ate } = janelaDaAgenda(mes, hoje);
  // Timestamp com folga de 1 dia dos dois lados: o dia em São Paulo é decidido depois, no módulo.
  const tsDe = new Date(`${de}T00:00:00-03:00`).getTime() - 86_400_000;
  const tsAte = new Date(`${ate}T23:59:59-03:00`).getTime() + 86_400_000;
  const isoDe = new Date(tsDe).toISOString();
  const isoAte = new Date(tsAte).toISOString();
  const filtro = [
    `and(due_date.gte.${de},due_date.lte.${ate})`,
    `and(publish_verified_at.gte.${isoDe},publish_verified_at.lte.${isoAte})`,
    `and(due_date.is.null,scheduled_at.gte.${isoDe},scheduled_at.lte.${isoAte})`,
  ].join(",");

  // ig_media_id/ig_permalink vêm da migration do "No ar" (20260924190000). Pergunta antes de pedir:
  // coluna inexistente dá 400, e todo 400 vira alerta no Sentry.
  const comIg = await temColunasIg().catch(() => false);
  const { data, error } = await supabaseAdmin.from("content_cards")
    .select(comIg ? `${COLS}, ig_media_id, ig_permalink` : COLS)
    .eq("client_id", cliente.id).or(filtro).limit(300);
  if (error) {
    console.error("[portal/agenda] falhou a leitura dos cards:", cliente.id, error.message);
    return NextResponse.json({ error: "Não consegui carregar sua agenda agora." }, { status: 503 });
  }
  const cards = (data ?? []) as unknown as (LinhaCardAgenda & { ig_permalink?: string | null })[];

  const semCapa = cards.filter((c) => !(c.image_url ?? "").trim()).map((c) => c.id);
  const links = new Map<string, string>();
  for (const c of cards) {
    if (c.ig_media_id && c.ig_permalink?.startsWith("https://")) links.set(c.ig_media_id, c.ig_permalink);
  }
  // Link que o card não guardou: procura no post sincronizado.
  const midias = [...new Set(cards.map((c) => c.ig_media_id).filter((x): x is string => !!x && !links.has(x)))];
  const [anexosR, postsR] = await Promise.all([
    semCapa.length
      ? supabaseAdmin.from("card_attachments").select("card_id, url, position, tipo").in("card_id", semCapa).order("position", { ascending: true })
      : Promise.resolve({ data: [] as { card_id: string; url: string; tipo: string | null }[] }),
    midias.length
      ? supabaseAdmin.from("client_ig_posts").select("media_id, permalink").eq("client_id", cliente.id).in("media_id", midias)
      : Promise.resolve({ data: [] as { media_id: string; permalink: string | null }[] }),
  ]);
  const capas = capasDosAnexos((anexosR.data ?? []) as { card_id: string; url: string; tipo: string | null }[]);
  for (const p of (postsR.data ?? []) as { media_id: string; permalink: string | null }[]) {
    if (p.permalink?.startsWith("https://")) links.set(p.media_id, p.permalink);
  }

  return NextResponse.json({ hoje, ...montarAgenda({ cards, capas, links, hoje, mes }) });
}
