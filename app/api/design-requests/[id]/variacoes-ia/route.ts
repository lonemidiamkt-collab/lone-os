export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { comExecucao, anotar } from "@/lib/obs/correlacao";
import { gerarVariacoesImagem, flagImagemLigada } from "@/lib/traffic/imagem-variacao";

// GERAR VARIAÇÕES (IA) na demanda do designer — Fase 4 do brief. Propostas viram REFERÊNCIA
// anexada; o designer revisa e finaliza. Flag agency_settings ia_imagem = 'on' (padrão desligado).
const PUB = () => `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://painel.lonemidia.com/supabase").replace(/\/$/, "")}/storage/v1/object/public/brand-assets`;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, ["admin", "manager", "designer", "social", "traffic"]);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  if (!(await flagImagemLigada())) return NextResponse.json({ error: "Geração de imagem está desligada. Liga em agency_settings (ia_imagem = on) quando a sombra dos criativos estiver aprovada." }, { status: 403 });
  const n = Math.min(3, Math.max(1, Number(req.nextUrl.searchParams.get("n") ?? 2) || 2));
  return comExecucao({ origem: "api:variacoes-ia", ator: gate.user.email, papel: gate.papel }, async () => {
    const { data: dr } = await supabaseAdmin.from("design_requests").select("id, client_id, client_name, title, parent_ad_id, variavel, attachments").eq("id", id).maybeSingle();
    if (!dr) return NextResponse.json({ error: "demanda não encontrada" }, { status: 404 });
    if (!dr.parent_ad_id) return NextResponse.json({ error: "Só demandas de replicação (com anúncio pai) geram variação — a IA precisa da referência e dos elementos travados." }, { status: 400 });
    const [{ data: cri }, { data: lin }] = await Promise.all([
      supabaseAdmin.from("creative_snapshots").select("thumb_url, image_url").eq("ad_id", dr.parent_ad_id as string).order("capturado_em", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("creative_lineage").select("muda, mantem").eq("child_design_request_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const ref = (cri?.thumb_url as string) || (cri?.image_url as string) || null;
    if (!ref) return NextResponse.json({ error: "Sem miniatura do anúncio pai guardada ainda." }, { status: 400 });
    const refRes = await fetch(ref, { signal: AbortSignal.timeout(20_000) });
    if (!refRes.ok) return NextResponse.json({ error: `Não consegui baixar a referência (HTTP ${refRes.status})` }, { status: 502 });
    const g = await gerarVariacoesImagem({ referencia: Buffer.from(await refRes.arrayBuffer()), mantem: (lin?.mantem as string) ?? "", muda: (lin?.muda as string) ?? (dr.variavel as string) ?? "", n, origem: "design:variacoes-ia" });
    if (!g.ok) return NextResponse.json({ error: g.erro }, { status: 502 });
    const urls: string[] = [];
    for (const [i, img] of g.imagens.entries()) {
      const path = `${dr.client_id}/ia/${id}-${Date.now().toString(36)}-${i + 1}.png`;
      const { error } = await supabaseAdmin.storage.from("brand-assets").upload(path, img, { contentType: "image/png", upsert: true });
      if (!error) urls.push(`${PUB()}/${path}`);
    }
    if (!urls.length) return NextResponse.json({ error: "Gerei, mas não consegui guardar as imagens." }, { status: 500 });
    await supabaseAdmin.from("design_requests").update({ attachments: [...((dr.attachments as string[]) ?? []), ...urls], updated_at: new Date().toISOString() }).eq("id", id);
    anotar(`variações IA: ${urls.length} para ${dr.client_name}/${dr.title}`);
    return NextResponse.json({ ok: true, urls, prompt: g.prompt });
  });
}
