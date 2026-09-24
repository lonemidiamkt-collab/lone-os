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
// Roda depois do ig-snapshots (que às 3h atualiza os posts). Cron: `30 9 * * *` = 6h30 BRT.
//
// "NO AR" AUTOMÁTICO (Leva 5a). Na mesma passada, o post real fecha o card que o planejou: mesmo
// cliente, até 1 dia antes/depois da data do card, mesmo formato primeiro, horário mais perto
// depois; um post fecha no máximo um card (regra em lib/conteudo/no-ar.ts). O board tinha ~24 cards
// "publicados" contra ~451 posts reais — ninguém arrasta o card depois que o post sai.
//
//   ?dry=1 (ou ?preview=1) → mostra o que mudaria e QUAIS cards fechariam, sem gravar
//   ?dias=N                → quantos dias para trás o "No ar" olha (padrão 60; 1ª carga: ?dias=180)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { mesAtualBRT } from "@/lib/metrics/posts";
import { noArPeloInstagram } from "@/lib/conteudo/dados";

export async function POST(req: NextRequest) {
  const denied = requireCron(req); if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  // `dry` é o nome padrão de ensaio das rotas novas; `preview` fica por compatibilidade.
  const previewOnly = (sp.get("dry") !== null && sp.get("dry") !== "0") || sp.get("preview") !== null;
  const diasNoAr = Number(sp.get("dias")) || undefined;

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

  // ── NO AR AUTOMÁTICO ────────────────────────────────────────────────────
  // Depois da contagem: fechar card não muda o número de quem tem Instagram (a conta já vem do
  // perfil). Falha aqui não derruba o que já foi gravado acima — volta na resposta.
  const nomes = new Map(clientes.map((c) => [c.id as string, ((c.nome_fantasia as string) || (c.name as string))]));
  const noAr = await noArPeloInstagram({ ensaio: previewOnly, dias: diasNoAr, nomes });

  return NextResponse.json({
    ok: true, mes, preview: previewOnly,
    clientes: clientes.length, mudancas: mudancas.length, atualizados,
    detalhe: mudancas.slice(0, 30),
    no_ar: {
      janela: noAr.janela,
      guarda_link: noAr.guardaLink,
      a_fechar: noAr.aFechar,
      fechados: noAr.fechados,
      falhas: noAr.falhas.slice(0, 20),
      erro: noAr.erro ?? null,
      // O ensaio lista tudo o que fecharia; a execução real, só o começo (o resto está no board).
      cards: noAr.detalhe.slice(0, previewOnly ? 500 : 50).map((f) => ({
        cliente: f.cliente,
        card: f.titulo,
        planejado: f.dataPlanejada,
        postado: dataBRT(f.postedAt),
        dias: f.dias,
        formato: f.mesmoFormato ? f.formatoPost : `${f.formatoCard} → ${f.formatoPost}`,
        link: f.permalink,
      })),
    },
  });
}

/** Timestamp ISO → "YYYY-MM-DD" no horário de São Paulo (o servidor roda em UTC). */
function dataBRT(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
