export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireRole } from "@/lib/api/require-role";
import { temSocial, temTrafego } from "@/lib/clients/servico";
import { htmlToPdf } from "@/lib/traffic/renderPdf";
import { loadLoneLogo } from "@/lib/cs/roteiro-pdf";
import {
  entregasPdfHtml, limitesDoMes, mesValido, rascunhoWhatsApp, resumirMes, type DadosEntregasMes,
} from "@/lib/clientes/entregas-do-mes";

// GET /api/clients/[id]/entregas-do-mes?mes=YYYY-MM[&formato=pdf] — "O QUE ENTREGAMOS NO MÊS" (Leva 7C, N21).
// JSON: o resumo, as lacunas e o RASCUNHO de WhatsApp. formato=pdf: o PDF para o CS anexar.
// Nada é enviado daqui: o CS revisa e manda. Regras em lib/clientes/entregas-do-mes.ts.
// Designer e comercial não fecham o mês com o cliente — ficam de fora.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, ["admin", "manager", "social", "traffic"]);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const mes = mesValido(req.nextUrl.searchParams.get("mes"), hoje);
  const { inicio, fim } = limitesDoMes(mes);
  const iniTs = `${inicio}T00:00:00-03:00`;
  const fimTs = `${fim}T23:59:59-03:00`;

  const { data: cli, error: eCli } = await supabaseAdmin.from("clients")
    .select("id, name, nome_fantasia, contact_name, service_type, ig_business_account_id, ig_public_username")
    .eq("id", id).maybeSingle();
  if (eCli) return NextResponse.json({ error: `clients: ${eCli.message}` }, { status: 500 });
  if (!cli) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const [posts, publicados, artes, gasto, pol, reunioes, saude] = await Promise.all([
    supabaseAdmin.from("client_ig_posts").select("posted_at, tipo, permalink").eq("client_id", id).gte("posted_at", iniTs).lte("posted_at", fimTs),
    supabaseAdmin.from("content_cards").select("id", { count: "exact", head: true }).eq("client_id", id)
      .is("archived_at", null).gte("publish_verified_at", iniTs).lte("publish_verified_at", fimTs),
    supabaseAdmin.from("content_cards").select("id", { count: "exact", head: true }).eq("client_id", id)
      .is("archived_at", null).gte("designer_delivered_at", iniTs).lte("designer_delivered_at", fimTs),
    supabaseAdmin.from("metric_snapshots").select("spend, conversions, metric_date").eq("client_id", id).gte("metric_date", inicio).lte("metric_date", fim),
    supabaseAdmin.from("client_traffic_policy").select("cpl_meta, cpl_alerta").eq("client_id", id).maybeSingle(),
    supabaseAdmin.from("meetings").select("title, start_at, realizada_em").eq("client_id", id).is("deleted_at", null)
      .eq("estado", "realizada").gte("start_at", iniTs).lte("start_at", fimTs),
    supabaseAdmin.from("creative_health").select("ad_id, ad_name, vencedor_evidencias, data").eq("client_id", id).eq("vencedor", true)
      .gte("data", inicio).lte("data", fim).order("data", { ascending: false }).limit(50),
  ]);

  const g = (gasto.data ?? []).reduce((a, r) => ({ gasto: a.gasto + Number(r.spend ?? 0), conversas: a.conversas + Number(r.conversions ?? 0), dias: a.dias + 1 }), { gasto: 0, conversas: 0, dias: 0 });
  const vencedores = new Map<string, { nome: string; evidencia: string | null }>();
  for (const v of saude.data ?? []) {
    if (vencedores.has(v.ad_id as string)) continue;
    vencedores.set(v.ad_id as string, { nome: (v.ad_name as string) || (v.ad_id as string), evidencia: ((v.vencedor_evidencias as string[] | null) ?? [])[0] ?? null });
  }

  const nome = (cli.nome_fantasia as string) || (cli.name as string);
  const dados: DadosEntregasMes = {
    cliente: nome, contato: (cli.contact_name as string) ?? null, mes, hoje,
    temTrafego: temTrafego({ service_type: cli.service_type as string }),
    temSocial: temSocial({ service_type: cli.service_type as string }),
    instagramLigado: !!(cli.ig_business_account_id || cli.ig_public_username) && !posts.error,
    posts: (posts.data ?? []).map((p) => ({ em: p.posted_at as string, tipo: (p.tipo as string) ?? null, permalink: (p.permalink as string) ?? null })),
    cardsPublicados: publicados.count ?? 0,
    artesEntregues: artes.count ?? 0,
    anuncios: gasto.error ? null : g,
    cplMeta: Number(pol.data?.cpl_meta ?? pol.data?.cpl_alerta ?? 0) || null,
    reunioes: (reunioes.data ?? []).map((r) => ({ em: (r.realizada_em as string) || (r.start_at as string), titulo: (r.title as string) || "Reunião" })),
    vencedores: [...vencedores.values()],
  };
  const resumo = resumirMes(dados);

  if (req.nextUrl.searchParams.get("formato") === "pdf") {
    if (!resumo.temConteudo) {
      return NextResponse.json({ error: `Nada registrado em ${resumo.mesRotulo} para montar o PDF.`, lacunas: resumo.lacunas }, { status: 422 });
    }
    const geradoEm = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const pdf = await htmlToPdf(entregasPdfHtml(resumo, await loadLoneLogo(), geradoEm));
    if (!pdf.ok || !pdf.buffer) return NextResponse.json({ error: pdf.error ?? "Falha ao gerar o PDF" }, { status: 502 });
    const slug = nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return new NextResponse(new Uint8Array(pdf.buffer), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="entregas-${mes}-${slug}.pdf"` },
    });
  }

  return NextResponse.json({ resumo, rascunho: resumo.temConteudo ? rascunhoWhatsApp(resumo, dados.contato) : null });
}
