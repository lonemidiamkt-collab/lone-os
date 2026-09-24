export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { statusDasEtapas } from "@/lib/conteudo/etapas";
import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/auth-server";
import { supabaseAdmin } from "@/lib/supabase/server";

// O QUE O CLIENTE VAI VER no portal — antes de alguém mandar o link. JP Barbearia (15/09): o link
// foi enviado uma semana depois do cadastro, sem conta de anúncio, sem Instagram e sem arte — o
// cliente abriu uma página vazia. Este endpoint responde às três perguntas que evitam isso.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  const { id } = await params;
  const [{ data: cli }, { data: snap }, { count: artes }] = await Promise.all([
    supabaseAdmin.from("clients").select("status, service_type, meta_ad_account_id, ig_business_account_id, join_date").eq("id", id).maybeSingle(),
    supabaseAdmin.from("client_report_snapshots").select("data, generated_at").eq("client_id", id).eq("period_kind", "last_week").order("generated_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("content_cards").select("id", { count: "exact", head: true }).eq("client_id", id).in("status", statusDasEtapas("com_cliente", "agendado", "no_ar")),
  ]);
  if (!cli) return NextResponse.json({ error: "cliente não encontrado" }, { status: 404 });
  const st = (cli.service_type as string) || "lone_growth";
  const socialOnly = ["assessoria_social", "assessoria_design"].includes(st);
  const anuncios = !socialOnly && !!cli.meta_ad_account_id;
  // O snapshot guarda o investimento em kpis.spend.value (lib/portal/types.ts). Ler `totals.spend`
  // — campo que o snapshot nunca teve — dava sempre zero, e a ficha dizia "sem gasto na última
  // semana" para todo cliente com anúncio rodando.
  const d = (snap?.data as { kpis?: { spend?: { value?: number | null } } } | null) ?? null;
  const gastoSemana = Number(d?.kpis?.spend?.value ?? 0);
  const instagram = !!cli.ig_business_account_id;
  const n = artes ?? 0;
  const pronto = (anuncios && gastoSemana > 0) || instagram || n > 0;
  return NextResponse.json({
    pronto, status: cli.status, socialOnly,
    // Quando os números de anúncio do portal foram montados pela última vez (últimos 7 dias).
    snapshotEm: (snap?.generated_at as string | null | undefined) ?? null,
    itens: [
      { chave: "anuncios", ok: anuncios && gastoSemana > 0, texto: socialOnly ? "Pacote sem anúncios — seção não aparece" : !cli.meta_ad_account_id ? "Conta de anúncio não vinculada — vincule em Dados › Meta" : gastoSemana > 0 ? `Anúncios: R$ ${gastoSemana.toFixed(2).replace(".", ",")} na última semana` : "Conta vinculada, mas sem gasto na última semana — a seção abre zerada" },
      { chave: "instagram", ok: instagram, texto: instagram ? "Instagram vinculado" : "Instagram não vinculado — o portal diz 'ainda não conectado'" },
      { chave: "artes", ok: n > 0, texto: n > 0 ? `${n} arte(s) entregue(s) aparecem em Conteúdo` : "Nenhuma arte entregue ainda — seção de conteúdo não aparece" },
    ],
  });
}
