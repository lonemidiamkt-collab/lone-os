export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { comExecucao, anotar } from "@/lib/obs/correlacao";
import { flagImagemLigada } from "@/lib/traffic/imagem-variacao";
import { kitDoCliente, gerarArteDoCliente, guardarGeracao } from "@/lib/ia/arte-do-cliente";

// PRÉVIA DE VARIAÇÃO no quadro do gestor: antes de mandar pro designer, o gestor vê 1 imagem
// gerada com os elementos travados. É rascunho para decidir — nunca vai pro cliente nem pro anúncio.
// Fica em creative_hypotheses.previas; flag agency_settings ia_imagem = 'on'.

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, ["admin", "manager", "traffic"]);
  if (gate instanceof NextResponse) return gate;
  if (!(await flagImagemLigada())) return NextResponse.json({ error: "Prévia por IA está desligada (agency_settings ia_imagem = on liga)." }, { status: 403 });
  const body = await req.json().catch(() => null) as { adId?: string; variacao?: { nome: string; muda: string; mantem: string } } | null;
  if (!body?.adId || !body.variacao?.nome) return NextResponse.json({ error: "adId e variacao obrigatórios" }, { status: 400 });
  const { adId, variacao } = body;
  return comExecucao({ origem: "api:previa-variacao", ator: gate.user.email, papel: gate.papel }, async () => {
    const [{ data: hip }, { data: cri }] = await Promise.all([
      supabaseAdmin.from("creative_hypotheses").select("id, client_id, previas").eq("ad_id", adId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("creative_snapshots").select("thumb_url, image_url").eq("ad_id", adId).order("capturado_em", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!hip) return NextResponse.json({ error: "Esse anúncio ainda não tem análise de vencedor." }, { status: 404 });
    const ref = (cri?.thumb_url as string) || (cri?.image_url as string) || null;
    if (!ref) return NextResponse.json({ error: "Sem miniatura do anúncio guardada." }, { status: 400 });
    const kit = await kitDoCliente(hip.client_id as string);
    const t0 = Date.now();
    const g = await gerarArteDoCliente({ kit, referenciaUrl: ref, textos: [], mantem: variacao.mantem, muda: variacao.muda, n: 1, origem: "trafego:previa" });
    if (!g.ok) return NextResponse.json({ error: g.erro }, { status: 502 });
    const { urls } = await guardarGeracao({ clientId: hip.client_id as string, imagens: g.imagens, prompt: g.prompt, entradas: g.entradas, adId, origem: "trafego:previa", qualidade: "medium", ms: Date.now() - t0, por: gate.user.email });
    if (!urls.length) return NextResponse.json({ error: "Gerei, mas não consegui guardar." }, { status: 500 });
    const url = urls[0];
    const previas = [...(((hip.previas as unknown[]) ?? []) as { variacao: string }[]).filter((p) => p.variacao !== variacao.nome), { variacao: variacao.nome, url, por: gate.user.email, em: new Date().toISOString() }];
    await supabaseAdmin.from("creative_hypotheses").update({ previas }).eq("id", hip.id);
    anotar(`prévia de variação "${variacao.nome}" para ad ${adId}`);
    return NextResponse.json({ ok: true, url });
  });
}
