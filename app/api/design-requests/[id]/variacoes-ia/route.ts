export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { comExecucao, anotar } from "@/lib/obs/correlacao";
import { flagImagemLigada } from "@/lib/traffic/imagem-variacao";
import { kitDoCliente, gerarArteDoCliente, guardarGeracao } from "@/lib/ia/arte-do-cliente";

// PROPOSTA DE ARTE POR IA na demanda do designer — qualquer demanda, com a identidade do cliente:
// logo + artes recentes + estilo lido + textos exatos. Replicação usa o anúncio pai como referência;
// pedido comum usa o anexo do pedido (ou só as artes do cliente) e o briefing como pedido.
// Entra como REFERÊNCIA anexada; o designer revisa e finaliza. Flag agency_settings ia_imagem.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, ["admin", "manager", "designer", "social", "traffic"]);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  if (!(await flagImagemLigada())) return NextResponse.json({ error: "Geração de imagem está desligada (agency_settings ia_imagem = on)." }, { status: 403 });
  const n = Math.min(3, Math.max(1, Number(req.nextUrl.searchParams.get("n") ?? 2) || 2));
  const qualidade = req.nextUrl.searchParams.get("q") === "high" ? "high" : "medium";
  return comExecucao({ origem: "api:variacoes-ia", ator: gate.user.email, papel: gate.papel }, async () => {
    const { data: dr } = await supabaseAdmin.from("design_requests").select("id, client_id, client_name, title, briefing, parent_ad_id, variavel, attachments").eq("id", id).maybeSingle();
    if (!dr) return NextResponse.json({ error: "demanda não encontrada" }, { status: 404 });
    const clientId = dr.client_id as string;
    const kit = await kitDoCliente(clientId);

    let referenciaUrl: string | null = null;
    let mantem = "", muda = "", pedido: string | null = null;
    if (dr.parent_ad_id) {
      const [{ data: cri }, { data: lin }] = await Promise.all([
        supabaseAdmin.from("creative_snapshots").select("thumb_url, image_url").eq("ad_id", dr.parent_ad_id as string).order("capturado_em", { ascending: false }).limit(1).maybeSingle(),
        supabaseAdmin.from("creative_lineage").select("muda, mantem").eq("child_design_request_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      referenciaUrl = (cri?.thumb_url as string) || (cri?.image_url as string) || null;
      mantem = (lin?.mantem as string) ?? ""; muda = (lin?.muda as string) ?? (dr.variavel as string) ?? "";
    } else {
      const anexos = ((dr.attachments as string[]) ?? []).filter((u) => /\.(png|jpe?g|webp)(\?|$)/i.test(u) && !u.includes("/ia/"));
      referenciaUrl = anexos[0] ?? null;
      pedido = [dr.title as string, ((dr.briefing as string) ?? "").replace(/\s+/g, " ").slice(0, 900)].filter(Boolean).join(" — ");
    }
    const t0 = Date.now();
    const g = await gerarArteDoCliente({ kit, referenciaUrl, textos: [], mantem, muda, pedido, n, qualidade, origem: "design:variacoes-ia" });
    if (!g.ok) return NextResponse.json({ error: g.erro }, { status: 502 });
    const { urls, geracaoId } = await guardarGeracao({ clientId, imagens: g.imagens, prompt: g.prompt, entradas: g.entradas, designRequestId: id, adId: (dr.parent_ad_id as string) ?? null, origem: "design:variacoes-ia", qualidade, ms: Date.now() - t0, por: gate.user.email });
    if (!urls.length) return NextResponse.json({ error: "Gerei, mas não consegui guardar as imagens." }, { status: 500 });
    await supabaseAdmin.from("design_requests").update({ attachments: [...((dr.attachments as string[]) ?? []), ...urls], updated_at: new Date().toISOString() }).eq("id", id);
    anotar(`arte IA: ${urls.length} para ${dr.client_name}/${dr.title} (logo=${g.entradas.logo} estilos=${g.entradas.estilos} textos=${(g.entradas.textos as string[]).length})`);
    return NextResponse.json({ ok: true, urls, geracaoId, entradas: g.entradas });
  });
}
