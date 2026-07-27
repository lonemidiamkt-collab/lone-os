// app/api/system/sync-posts/route.ts — RESSUSCITA os campos de postagem com o dado real.
//
// `clients.posts_this_month` e `clients.last_post_date` são lidos pelo dashboard, pelos Alertas
// Inteligentes, pelo Status dos Clientes e pelo score de saúde — e NINGUÉM escrevia neles:
//   posts_this_month .... 0 na base inteira → todo cliente aparecia "0/12"
//   last_post_date ...... 22 de 46, desatualizado → "Araruama Tintas sem post há 21 dias"
//                         no mesmo dia em que o Instagram dele tinha post de 2 dias atrás
//
// Em vez de reescrever as dez telas que leem esses campos, esta rota faz os campos falarem a
// verdade: recalcula a partir de `client_ig_posts` (o Instagram real) e só cai no board quando
// o cliente não tem Instagram vinculado.
//
// Roda depois do ig-snapshots (que às 6h atualiza os posts). Cron: `30 9 * * *` = 6h30 BRT.
//   ?preview=1 → mostra o que mudaria, sem gravar

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { mesAtualBRT } from "@/lib/metrics/posts";

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const previewOnly = req.nextUrl.searchParams.get("preview") !== null;

  const mes = mesAtualBRT();
  const inicioMes = `${mes}-01T00:00:00-03:00`;

  const { data: clientes } = await supabaseAdmin
    .from("clients").select("id, name, nome_fantasia, posts_this_month, last_post_date, ig_business_account_id, ig_public_username")
    .or("active.is.null,active.eq.true");
  if (!clientes?.length) return NextResponse.json({ ok: true, status: "sem clientes" });

  const ids = clientes.map((c) => c.id as string);

  // Uma consulta pra todo mundo, não uma por cliente.
  const [{ data: igMes }, { data: igTodos }, { data: cardsPub }] = await Promise.all([
    supabaseAdmin.from("client_ig_posts").select("client_id").in("client_id", ids).gte("posted_at", inicioMes),
    supabaseAdmin.from("client_ig_posts").select("client_id, posted_at").in("client_id", ids).order("posted_at", { ascending: false }),
    supabaseAdmin.from("content_cards").select("client_id, status_changed_at")
      .in("client_id", ids).eq("status", "published").is("archived_at", null)
      .order("status_changed_at", { ascending: false }),
  ]);

  const igNoMes = new Map<string, number>();
  for (const r of igMes ?? []) {
    const id = r.client_id as string;
    igNoMes.set(id, (igNoMes.get(id) ?? 0) + 1);
  }
  const igUltimo = new Map<string, string>();
  for (const r of igTodos ?? []) {
    const id = r.client_id as string;
    if (!igUltimo.has(id)) igUltimo.set(id, dataBRT(r.posted_at as string));
  }
  const cardMes = new Map<string, number>();
  const cardUltimo = new Map<string, string>();
  for (const r of cardsPub ?? []) {
    const id = r.client_id as string;
    const d = dataBRT(r.status_changed_at as string);
    if (!cardUltimo.has(id)) cardUltimo.set(id, d);
    if (d >= `${mes}-01`) cardMes.set(id, (cardMes.get(id) ?? 0) + 1);
  }

  const mudancas: { cliente: string; de: string; para: string }[] = [];
  let atualizados = 0;

  for (const c of clientes) {
    const id = c.id as string;
    const nome = (c.nome_fantasia as string) || (c.name as string);
    const temIg = !!c.ig_business_account_id || !!c.ig_public_username;

    // Instagram manda. Sem Instagram vinculado, o board é o que existe.
    const total = temIg ? (igNoMes.get(id) ?? 0) : (cardMes.get(id) ?? 0);
    const calculado = temIg ? (igUltimo.get(id) ?? null) : (cardUltimo.get(id) ?? null);

    const antesTotal = (c.posts_this_month as number) ?? 0;
    const antesUltimo = (c.last_post_date as string) ?? null;

    // NUNCA APAGAR DATA SEM TER OUTRA MELHOR. Sem esta guarda, MAX Contabilidade, Maicon e
    // Atlas — que não têm Instagram vinculado e não têm card publicado — perderiam a data que
    // alguém preencheu na mão, e ficariam com "nunca postou". Substituir dado fraco por dado
    // bom é conserto; substituir dado fraco por NADA é destruir informação.
    const ultimo = calculado ?? antesUltimo;
    if (antesTotal === total && antesUltimo === ultimo) continue;

    mudancas.push({
      cliente: nome,
      de: `${antesTotal} posts · último ${antesUltimo ?? "—"}`,
      para: `${total} posts · último ${ultimo ?? "—"}`,
    });

    if (!previewOnly) {
      const { error } = await supabaseAdmin
        .from("clients").update({ posts_this_month: total, last_post_date: ultimo }).eq("id", id).select("id");
      if (!error) atualizados++;
    }
  }

  return NextResponse.json({
    ok: true, mes, preview: previewOnly,
    clientes: clientes.length, mudancas: mudancas.length, atualizados,
    detalhe: mudancas.slice(0, 30),
  });
}

/** Timestamp ISO → "YYYY-MM-DD" no horário de São Paulo (o servidor roda em UTC). */
function dataBRT(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
