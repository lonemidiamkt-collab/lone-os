export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/auth-server";

// INTELIGÊNCIA CRIATIVA do cliente (brief 14/09): o DNA num lugar só — criativos e saúde,
// vencedores, testes de variação, aprendizados e o padrão dos vencedores (atributos). Só leitura.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req);
  if (!user) return NextResponse.json({ error: "Sessão inválida" }, { status: 401 });
  const { id } = await params;

  const { data: dia } = await supabaseAdmin.from("creative_health").select("data").eq("client_id", id).order("data", { ascending: false }).limit(1).maybeSingle();
  const [{ data: saude }, { data: lins }, { data: apr }, { data: attrs }] = await Promise.all([
    dia ? supabaseAdmin.from("creative_health").select("ad_id, ad_name, estado, severidade, confianca, evidencias, amostra, vencedor, vencedor_evidencias").eq("client_id", id).eq("data", dia.data as string).neq("estado", "SEM_AMOSTRA").order("vencedor", { ascending: false }).order("severidade", { ascending: false }).limit(12) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    supabaseAdmin.from("creative_lineage").select("id, parent_ad_id, child_ad_id, child_design_request_id, variavel, muda, hipotese, resultado, created_at").eq("client_id", id).order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("creative_learnings").select("variavel, hipotese, veredito, evidencia, created_at").eq("client_id", id).order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("creative_attributes").select("ad_id, tags, layout, preco_visivel, pessoa, cor_predominante, elemento_destaque").eq("client_id", id).limit(500),
  ]);

  const adIds = [...new Set([...(saude ?? []).map((s) => s.ad_id as string), ...(lins ?? []).map((l) => l.parent_ad_id as string)])];
  const { data: cri } = adIds.length ? await supabaseAdmin.from("creative_snapshots").select("ad_id, tipo, thumb_url, image_url, body").in("ad_id", adIds).order("capturado_em", { ascending: false }) : { data: [] as Record<string, unknown>[] };
  const thumb = new Map<string, Record<string, unknown>>();
  for (const c of cri ?? []) if (!thumb.has(c.ad_id as string)) thumb.set(c.ad_id as string, c);

  // Hipóteses/variações do vencedor: é daqui que a ficha cria a arte (botão "Criar arte") sem ir ao Tráfego.
  const vencIds = (saude ?? []).filter((s) => s.vencedor).map((s) => s.ad_id as string);
  const { data: hips } = vencIds.length ? await supabaseAdmin.from("creative_hypotheses").select("ad_id, variacoes, resumo, previas, created_at").in("ad_id", vencIds).order("created_at", { ascending: false }) : { data: [] as Record<string, unknown>[] };
  const hip = new Map<string, Record<string, unknown>>();
  for (const h of hips ?? []) if (!hip.has(h.ad_id as string)) hip.set(h.ad_id as string, h);
  const { data: abertas } = vencIds.length ? await supabaseAdmin.from("design_requests").select("id, parent_ad_id, variavel, status").in("parent_ad_id", vencIds).neq("status", "done") : { data: [] as Record<string, unknown>[] };

  const criativos = (saude ?? []).map((s) => ({ ...s, thumb: (thumb.get(s.ad_id as string)?.thumb_url as string) ?? (thumb.get(s.ad_id as string)?.image_url as string) ?? null, tipo: thumb.get(s.ad_id as string)?.tipo ?? null,
    analise: hip.has(s.ad_id as string) ? { resumo: hip.get(s.ad_id as string)?.resumo ?? null, variacoes: hip.get(s.ad_id as string)?.variacoes ?? [], previas: hip.get(s.ad_id as string)?.previas ?? [] } : null,
    demandasAbertas: (abertas ?? []).filter((d) => d.parent_ad_id === s.ad_id).map((d) => ({ id: d.id, variavel: d.variavel, status: d.status })) }));

  // Padrão dos vencedores: tags mais frequentes entre vencedores vs. entre os demais (do mesmo cliente).
  const vencedores = new Set((saude ?? []).filter((s) => s.vencedor).map((s) => s.ad_id as string));
  const conta = (lista: Record<string, unknown>[]) => { const m = new Map<string, number>(); for (const a of lista) for (const t of (a.tags as string[]) ?? []) m.set(t, (m.get(t) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag, n]) => ({ tag, n })); };
  const attrV = (attrs ?? []).filter((a) => vencedores.has(a.ad_id as string));
  const attrO = (attrs ?? []).filter((a) => !vencedores.has(a.ad_id as string));
  const padrao = { vencedores: attrV.length, outros: attrO.length, tagsVencedores: conta(attrV), tagsOutros: conta(attrO),
    precoVisivel: { vencedores: attrV.filter((a) => a.preco_visivel).length, outros: attrO.filter((a) => a.preco_visivel).length },
    pessoa: { vencedores: attrV.filter((a) => a.pessoa).length, outros: attrO.filter((a) => a.pessoa).length } };

  const { data: flag } = await supabaseAdmin.from("agency_settings").select("value").eq("key", "ia_imagem").maybeSingle();
  return NextResponse.json({ dia: dia?.data ?? null, criativos, testes: lins ?? [], aprendizados: apr ?? [], padrao, iaImagem: flag?.value === "on" });
}
