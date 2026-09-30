export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { requireCron } from "@/lib/api/cron-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { comExecucao, anotar } from "@/lib/obs/correlacao";
import { extrairAtributos } from "@/lib/traffic/atributos";
import { escolherProvider } from "@/lib/meta/gateway";
import { linkVencido, erroDeImagemIndisponivel } from "@/lib/meta/link-assinado";

// POST /api/system/creative-atributos?max=60 — extrai atributos dos criativos (versão mais recente
// por anúncio) que ainda não têm. Prioriza quem gastou mais na semana. Cron diário 07:30.
export async function POST(req: NextRequest) {
  const gate = requireCron(req); // só o cron: qualquer logado disparava lote pesado (IA/Meta)
  if (gate) return gate;
  const max = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("max") ?? 60) || 60));
  return comExecucao({ origem: "cron:creative-atributos", ator: "cron" }, async () => {
    const { data: cri, error } = await supabaseAdmin.from("creative_snapshots")
      .select("ad_id, hash, client_id, tipo, thumb_url, image_url, body, title, capturado_em")
      .order("capturado_em", { ascending: false }).limit(2000);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    const ultimo = new Map<string, typeof cri[number]>();
    for (const c of cri ?? []) if (!ultimo.has(c.ad_id as string)) ultimo.set(c.ad_id as string, c);
    const { data: feitos } = await supabaseAdmin.from("creative_attributes").select("ad_id, hash");
    const ja = new Set((feitos ?? []).map((f) => `${f.ad_id}|${f.hash}`));
    const { data: gasto } = await supabaseAdmin.from("meta_ad_period").select("ad_id, spend").eq("dias", 7).order("ate", { ascending: false }).limit(3000);
    const peso = new Map<string, number>();
    for (const g of gasto ?? []) if (!peso.has(g.ad_id as string)) peso.set(g.ad_id as string, Number(g.spend ?? 0));
    const fila = [...ultimo.values()].filter((c) => !ja.has(`${c.ad_id}|${c.hash}`)).sort((a, b) => (peso.get(b.ad_id as string) ?? 0) - (peso.get(a.ad_id as string) ?? 0)).slice(0, max);
    const clientIds = [...new Set(fila.map((c) => c.client_id as string).filter(Boolean))];
    const { data: cli } = clientIds.length ? await supabaseAdmin.from("clients").select("id, name, nome_fantasia").in("id", clientIds) : { data: [] as Record<string, unknown>[] };
    const nome = new Map((cli ?? []).map((c) => [c.id as string, ((c.nome_fantasia as string) || (c.name as string)) ?? ""]));

    // LINK VENCIDO (30/09): a miniatura da Meta é URL assinada e vence em dias. Anúncio que parou de
    // gastar não é recapturado, e o link guardado envelhece — a OpenAI levava 403 e a rotina inteira
    // ficava vermelha por 3 de 60. Antes de gastar IA, pede à Meta o link atual dos vencidos (em
    // lote) e grava de volta. O que a Meta não devolve mais (anúncio apagado) fica "sem imagem":
    // continua na fila e não conta como erro.
    const agora = new Date();
    const imagemDe = (c: (typeof fila)[number]) => (c.thumb_url as string) || (c.image_url as string) || null;
    const vencidos = fila.filter((c) => linkVencido(imagemDe(c), agora)).map((c) => c.ad_id as string);
    const renovados = new Map<string, { thumb: string | null; image: string | null }>();
    let renovarFalhou: string | null = null;
    if (vencidos.length) {
      try {
        const { data: cfg } = await supabaseAdmin.from("agency_settings").select("value").eq("key", "meta_token").maybeSingle();
        const token = cfg?.value as string | undefined;
        if (!token) throw new Error("meta_token ausente");
        const { provider } = await escolherProvider(token);
        for (const a of await provider.criativos({ token, adIds: vencidos })) {
          if (a.thumbUrl || a.imageUrl) renovados.set(a.adId, { thumb: a.thumbUrl ?? null, image: a.imageUrl ?? null });
        }
      } catch (e) {
        renovarFalhou = e instanceof Error ? e.message : String(e);
        console.error("[creative-atributos] renovar links:", renovarFalhou);
      }
    }
    for (const c of fila) {
      const novo = renovados.get(c.ad_id as string);
      if (!novo) continue;
      c.thumb_url = novo.thumb; c.image_url = novo.image;
      const { error: eUp } = await supabaseAdmin.from("creative_snapshots")
        .update({ thumb_url: novo.thumb, image_url: novo.image }).eq("ad_id", c.ad_id).eq("hash", c.hash);
      if (eUp) console.error("[creative-atributos] gravar link novo:", c.ad_id, eUp.message);
    }

    let gerados = 0; let semImagem = 0; const erros: string[] = [];
    if (renovarFalhou) erros.push(`renovar links vencidos na Meta: ${renovarFalhou.slice(0, 120)}`);
    for (const c of fila) {
      const url = imagemDe(c);
      if (url && linkVencido(url, agora, 0)) { semImagem++; continue; } // não renovou: nem gasta a chamada
      const r = await extrairAtributos({ thumbUrl: url, body: c.body as string, title: c.title as string, tipo: c.tipo as string, cliente: nome.get(c.client_id as string) ?? "?" });
      if (!r.ok && erroDeImagemIndisponivel(r.error)) { semImagem++; continue; }
      if (!r.ok || !r.data) { erros.push(`${c.ad_id}: ${r.error ?? "?"}`); continue; }
      const { error: e } = await supabaseAdmin.from("creative_attributes").upsert({
        ad_id: c.ad_id, hash: c.hash, client_id: c.client_id, ...r.data, tags: (r.data.tags ?? []).slice(0, 8), formato: c.tipo ?? null, modelo: "gpt-4o-mini",
      }, { onConflict: "ad_id,hash" });
      if (e) erros.push(`${c.ad_id}: gravar: ${e.message.slice(0, 60)}`); else gerados++;
    }
    anotar(`atributos: ${gerados} criativos`);
    return NextResponse.json({
      ok: erros.length === 0,
      pendentes: [...ultimo.values()].filter((c) => !ja.has(`${c.ad_id}|${c.hash}`)).length - gerados,
      gerados,
      links_renovados: renovados.size,
      // Imagem que nem a Meta devolve mais: fica na fila, não é erro da rotina.
      sem_imagem: semImagem,
      erros: erros.slice(0, 8),
    });
  });
}
export const GET = POST;
