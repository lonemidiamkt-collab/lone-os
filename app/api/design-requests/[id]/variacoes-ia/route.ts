export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { comExecucao, anotar } from "@/lib/obs/correlacao";
import { registrarChamadaLlm } from "@/lib/obs/llm";

// GERAR VARIAÇÕES (IA) — Fase 4 do brief: "o designer aperta Gerar variações e recebe propostas;
// a IA não decide o que alterar: o briefing trava os elementos." Só para demanda vinda de
// replicação (tem anúncio pai). Propostas entram como REFERÊNCIA anexada à demanda — o designer
// revisa e finaliza; nada vai ao cliente por aqui. Desligado por padrão: agency_settings
// ia_imagem = 'on' liga (custa ~US$ 0,07 por imagem no gpt-image-1, qualidade média).

const PUB = () => `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://painel.lonemidia.com/supabase").replace(/\/$/, "")}/storage/v1/object/public/brand-assets`;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRole(req, ["admin", "manager", "designer", "social", "traffic"]);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const { data: flag } = await supabaseAdmin.from("agency_settings").select("value").eq("key", "ia_imagem").maybeSingle();
  if (flag?.value !== "on") return NextResponse.json({ error: "Geração de imagem está desligada. Liga em agency_settings (ia_imagem = on) quando a sombra dos criativos estiver aprovada." }, { status: 403 });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "OPENAI_API_KEY ausente" }, { status: 500 });
  const n = Math.min(3, Math.max(1, Number(req.nextUrl.searchParams.get("n") ?? 2) || 2));

  return comExecucao({ origem: "api:variacoes-ia", ator: gate.user.email, papel: gate.papel }, async () => {
    const { data: dr } = await supabaseAdmin.from("design_requests").select("id, client_id, client_name, title, format, parent_ad_id, variavel, attachments").eq("id", id).maybeSingle();
    if (!dr) return NextResponse.json({ error: "demanda não encontrada" }, { status: 404 });
    if (!dr.parent_ad_id) return NextResponse.json({ error: "Só demandas de replicação (com anúncio pai) geram variação — a IA precisa da referência e dos elementos travados." }, { status: 400 });
    const [{ data: cri }, { data: lin }] = await Promise.all([
      supabaseAdmin.from("creative_snapshots").select("thumb_url, image_url, body, title").eq("ad_id", dr.parent_ad_id as string).order("capturado_em", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("creative_lineage").select("muda, mantem, hipotese").eq("child_design_request_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const ref = (cri?.thumb_url as string) || (cri?.image_url as string) || null;
    if (!ref) return NextResponse.json({ error: "Sem miniatura do anúncio pai guardada ainda." }, { status: 400 });
    const refRes = await fetch(ref, { signal: AbortSignal.timeout(20_000) });
    if (!refRes.ok) return NextResponse.json({ error: `Não consegui baixar a referência (HTTP ${refRes.status})` }, { status: 502 });
    const refBytes = Buffer.from(await refRes.arrayBuffer());

    const prompt = [
      `Crie uma VARIAÇÃO deste anúncio de loja local para teste A/B.`,
      `MANTER EXATAMENTE (elementos travados): ${lin?.mantem || "todos os textos, preço, produto, logo, hierarquia e chamada para ação"}.`,
      `ALTERAR APENAS: ${lin?.muda || dr.variavel || "o cenário/fundo"}.`,
      `Não invente textos novos, não mude preços, não remova a logo, não troque o produto. Mesmo formato vertical de anúncio, mesma legibilidade. Estilo de peça publicitária brasileira de comércio local.`,
    ].join("\n");

    const fd = new FormData();
    fd.append("model", "gpt-image-1");
    fd.append("image", new Blob([refBytes], { type: "image/png" }), "referencia.png");
    fd.append("prompt", prompt);
    fd.append("n", String(n));
    fd.append("size", "1024x1536");
    fd.append("quality", "medium");
    const t0 = Date.now();
    const r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd, signal: AbortSignal.timeout(170_000) });
    const json = await r.json().catch(() => null) as { data?: { b64_json?: string }[]; error?: { message?: string } } | null;
    registrarChamadaLlm({ modelo: "gpt-image-1", ms: Date.now() - t0, ok: r.ok, erro: r.ok ? null : json?.error?.message ?? `HTTP ${r.status}`, origem: "design:variacoes-ia", tipo: "image" });
    if (!r.ok || !json?.data?.length) return NextResponse.json({ error: `OpenAI: ${json?.error?.message ?? `HTTP ${r.status}`}` }, { status: 502 });

    const urls: string[] = [];
    for (const [i, img] of json.data.entries()) {
      if (!img.b64_json) continue;
      const path = `${dr.client_id}/ia/${id}-${Date.now().toString(36)}-${i + 1}.png`;
      const { error } = await supabaseAdmin.storage.from("brand-assets").upload(path, Buffer.from(img.b64_json, "base64"), { contentType: "image/png", upsert: true });
      if (error) continue;
      urls.push(`${PUB()}/${path}`);
    }
    if (!urls.length) return NextResponse.json({ error: "Gerei, mas não consegui guardar as imagens." }, { status: 500 });
    const attachments = [...((dr.attachments as string[]) ?? []), ...urls];
    await supabaseAdmin.from("design_requests").update({ attachments, updated_at: new Date().toISOString() }).eq("id", id);
    anotar(`variações IA: ${urls.length} para ${dr.client_name}/${dr.title}`);
    return NextResponse.json({ ok: true, urls, prompt });
  });
}
