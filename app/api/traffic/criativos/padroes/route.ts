export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";

// CREATIVE PATTERN em três níveis (brief 14/09, itens 17–18): o que os VENCEDORES têm em comum
// contra os demais — por cliente, por segmento (nicho) e na Lone inteira. Agregação, sem expor
// um cliente ao outro: o nível segmento/Lone devolve contagens, nunca nomes. É correlação: vira
// hipótese de teste, não regra. Só aparece com amostra (≥ 5 vencedores no nível).

interface Attr { ad_id: string; client_id: string | null; tags: string[] | null; preco_visivel: boolean | null; pessoa: boolean | null; layout: string | null; cor_predominante: string | null; formato: string | null }

function resumo(vencedores: Attr[], outros: Attr[]) {
  const pct = (xs: Attr[], f: (a: Attr) => boolean) => (xs.length ? Math.round((xs.filter(f).length / xs.length) * 100) : null);
  const conta = (xs: Attr[], pick: (a: Attr) => string[]) => { const m = new Map<string, number>(); for (const a of xs) for (const t of pick(a)) m.set(t, (m.get(t) ?? 0) + 1); return m; };
  const tagsV = conta(vencedores, (a) => a.tags ?? []), tagsO = conta(outros, (a) => a.tags ?? []);
  // "lift": frequência da tag nos vencedores ÷ nos outros (mín. 3 vencedores com a tag)
  const lift = [...tagsV.entries()].filter(([, n]) => n >= 3).map(([tag, n]) => {
    const pv = n / Math.max(1, vencedores.length), po = (tagsO.get(tag) ?? 0) / Math.max(1, outros.length);
    return { tag, vencedores: n, pctVencedores: Math.round(pv * 100), pctOutros: Math.round(po * 100), lift: po > 0 ? Math.round((pv / po) * 10) / 10 : null };
  }).sort((a, b) => (b.lift ?? 99) - (a.lift ?? 99)).slice(0, 8);
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => ({ valor: k, n }));
  return {
    amostra: { vencedores: vencedores.length, outros: outros.length },
    precoVisivel: { vencedores: pct(vencedores, (a) => !!a.preco_visivel), outros: pct(outros, (a) => !!a.preco_visivel) },
    pessoa: { vencedores: pct(vencedores, (a) => !!a.pessoa), outros: pct(outros, (a) => !!a.pessoa) },
    formatos: { vencedores: top(conta(vencedores, (a) => (a.formato ? [a.formato.toLowerCase()] : []))), outros: top(conta(outros, (a) => (a.formato ? [a.formato.toLowerCase()] : []))) },
    cores: { vencedores: top(conta(vencedores, (a) => (a.cor_predominante ? [a.cor_predominante.toLowerCase()] : []))) },
    tags: lift,
  };
}

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, ["admin", "manager", "traffic", "social", "designer"]);
  if (gate instanceof NextResponse) return gate;
  const clientId = req.nextUrl.searchParams.get("clientId");
  const { data: dia } = await supabaseAdmin.from("creative_health").select("data").order("data", { ascending: false }).limit(1).maybeSingle();
  if (!dia) return NextResponse.json({ dia: null, niveis: {} });
  const [{ data: saude }, { data: attrs }, { data: cli }] = await Promise.all([
    supabaseAdmin.from("creative_health").select("ad_id, client_id, vencedor, estado").eq("data", dia.data as string).neq("estado", "SEM_AMOSTRA"),
    supabaseAdmin.from("creative_attributes").select("ad_id, client_id, tags, preco_visivel, pessoa, layout, cor_predominante, formato"),
    supabaseAdmin.from("clients").select("id, nicho, industry"),
  ]);
  const venc = new Set((saude ?? []).filter((s) => s.vencedor).map((s) => s.ad_id as string));
  const avaliados = new Set((saude ?? []).map((s) => s.ad_id as string));
  const nicho = new Map((cli ?? []).map((c) => [c.id as string, ((c.nicho as string) || (c.industry as string) || "").toLowerCase().trim()]));
  const todos = ((attrs ?? []) as Attr[]).filter((a) => avaliados.has(a.ad_id));
  const split = (xs: Attr[]) => resumo(xs.filter((a) => venc.has(a.ad_id)), xs.filter((a) => !venc.has(a.ad_id)));

  const lone = split(todos);
  const niveis: Record<string, unknown> = { lone: lone.amostra.vencedores >= 5 ? lone : { amostra: lone.amostra, insuficiente: true } };
  if (clientId) {
    const doCliente = split(todos.filter((a) => a.client_id === clientId));
    niveis.cliente = doCliente.amostra.vencedores >= 2 ? doCliente : { amostra: doCliente.amostra, insuficiente: true };
    const n = nicho.get(clientId);
    if (n) {
      const doSegmento = split(todos.filter((a) => nicho.get(a.client_id ?? "") === n));
      niveis.segmento = { nicho: n, ...(doSegmento.amostra.vencedores >= 5 ? doSegmento : { amostra: doSegmento.amostra, insuficiente: true }) };
    }
  }
  return NextResponse.json({ dia: dia.data, atributosLidos: todos.length, niveis });
}
