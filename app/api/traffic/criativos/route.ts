export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";

// Saúde dos criativos em SOMBRA (Fase 2). GET lista o dia mais recente com miniatura e evidências;
// POST grava o rótulo do gestor (concordo/discordo) — é a medida de precisão que decide se o motor
// entra no feed (portão: ≥ 0,8).

const PAPEIS = ["admin", "manager", "traffic"] as const;

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, [...PAPEIS]);
  if (gate instanceof NextResponse) return gate;
  const diaParam = req.nextUrl.searchParams.get("dia");
  const { data: ultimo } = await supabaseAdmin.from("creative_health").select("data").order("data", { ascending: false }).limit(1).maybeSingle();
  const dia = diaParam || (ultimo?.data as string | undefined);
  if (!dia) return NextResponse.json({ dia: null, itens: [], precisao: null });

  const { data: linhas, error } = await supabaseAdmin.from("creative_health")
    .select("ad_id, client_id, ad_name, estado, severidade, confianca, sinais, evidencias, amostra, vencedor, vencedor_evidencias, rotulo, rotulado_por")
    .eq("data", dia).neq("estado", "SEM_AMOSTRA").order("severidade", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const adIds = [...new Set((linhas ?? []).map((l) => l.ad_id as string))];
  const clientIds = [...new Set((linhas ?? []).map((l) => l.client_id as string).filter(Boolean))];
  const [{ data: cri }, { data: cli }, { data: hip }] = await Promise.all([
    adIds.length ? supabaseAdmin.from("creative_snapshots").select("ad_id, tipo, thumb_url, image_url, body, title, cta, capturado_em").in("ad_id", adIds).order("capturado_em", { ascending: false }) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    clientIds.length ? supabaseAdmin.from("clients").select("id, name, nome_fantasia").in("id", clientIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    adIds.length ? supabaseAdmin.from("creative_hypotheses").select("ad_id, hash, elementos, hipoteses, variacoes, resumo, roteiros, previas, created_at").in("ad_id", adIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const hipotese = new Map<string, Record<string, unknown>>();
  for (const h of hip ?? []) if (!hipotese.has(h.ad_id as string)) hipotese.set(h.ad_id as string, h);
  const criativo = new Map<string, Record<string, unknown>>();
  for (const c of cri ?? []) if (!criativo.has(c.ad_id as string)) criativo.set(c.ad_id as string, c);
  const nome = new Map((cli ?? []).map((c) => [c.id as string, ((c.nome_fantasia as string) || (c.name as string)) ?? ""]));

  const itens = (linhas ?? []).map((l) => {
    const c = criativo.get(l.ad_id as string);
    const h = hipotese.get(l.ad_id as string);
    return { ...l, cliente: nome.get(l.client_id as string) ?? "", tipo: c?.tipo ?? null, thumb: (c?.thumb_url as string) ?? (c?.image_url as string) ?? null, texto: (c?.body as string) ?? null, titulo: (c?.title as string) ?? null,
      analise: h ? { resumo: h.resumo, elementos: h.elementos, hipoteses: h.hipoteses, variacoes: h.variacoes, roteiros: h.roteiros, previas: h.previas ?? [] } : null };
  });

  // Testes em andamento: cada variação replicada, com o estado (na fila do designer / entregue / no ar / veredito).
  const { data: lins } = await supabaseAdmin.from("creative_lineage")
    .select("id, client_id, parent_ad_id, child_ad_id, child_design_request_id, variavel, muda, hipotese, criado_por, resultado, created_at")
    .order("created_at", { ascending: false }).limit(60);
  const drIds = [...new Set((lins ?? []).map((l) => l.child_design_request_id as string).filter(Boolean))];
  const { data: drs } = drIds.length ? await supabaseAdmin.from("design_requests").select("id, status, assigned_designer, deadline").in("id", drIds) : { data: [] as Record<string, unknown>[] };
  const dr = new Map((drs ?? []).map((d) => [d.id as string, d]));
  const paiIds = [...new Set((lins ?? []).map((l) => l.parent_ad_id as string))];
  const { data: pais } = paiIds.length ? await supabaseAdmin.from("creative_health").select("ad_id, ad_name, client_id").in("ad_id", paiIds).order("data", { ascending: false }) : { data: [] as Record<string, unknown>[] };
  const pai = new Map<string, Record<string, unknown>>();
  for (const p of pais ?? []) if (!pai.has(p.ad_id as string)) pai.set(p.ad_id as string, p);
  const clientIds2 = [...new Set((lins ?? []).map((l) => l.client_id as string).filter(Boolean))];
  const { data: cli2 } = clientIds2.length ? await supabaseAdmin.from("clients").select("id, name, nome_fantasia").in("id", clientIds2) : { data: [] as Record<string, unknown>[] };
  const nome2 = new Map((cli2 ?? []).map((c) => [c.id as string, ((c.nome_fantasia as string) || (c.name as string)) ?? ""]));
  const testes = (lins ?? []).map((l) => {
    const d = dr.get(l.child_design_request_id as string);
    const r = (l.resultado ?? null) as { veredito?: string; motivo?: string; cplPai?: number | null; cplFilho?: number | null } | null;
    const etapa = r?.veredito && r.veredito !== "inconclusiva" ? r.veredito : l.child_ad_id ? (r ? "medindo" : "no_ar") : d?.status === "done" ? "entregue" : d?.status === "in_progress" ? "em_producao" : "na_fila";
    return { id: l.id, cliente: nome2.get(l.client_id as string) ?? "", pai: (pai.get(l.parent_ad_id as string)?.ad_name as string) ?? l.parent_ad_id, variavel: l.variavel, muda: l.muda, hipotese: l.hipotese, criadoPor: l.criado_por, designer: d?.assigned_designer ?? null, prazo: d?.deadline ?? null, etapa, resultado: r, createdAt: l.created_at };
  });

  // Precisão acumulada do shadow: concordo ÷ (concordo + discordo), todos os dias.
  const { data: rot } = await supabaseAdmin.from("creative_health").select("rotulo").not("rotulo", "is", null).neq("rotulo", "sem_opiniao");
  const concordo = (rot ?? []).filter((r) => r.rotulo === "concordo").length;
  const total = (rot ?? []).length;
  const { data: brief } = await supabaseAdmin.from("traffic_briefs").select("id, semana, texto, proposta, enviado_whatsapp, estado").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { data: flag } = await supabaseAdmin.from("agency_settings").select("value").eq("key", "ia_imagem").maybeSingle();
  return NextResponse.json({ dia, itens, testes, brief: brief ?? null, iaImagem: flag?.value === "on", precisao: total ? { concordo, total, taxa: Math.round((concordo / total) * 100) } : null });
}

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, [...PAPEIS]);
  if (gate instanceof NextResponse) return gate;
  const body = await req.json().catch(() => null);
  const { adId, dia, rotulo } = body ?? {};
  if (!adId || !dia || !["concordo", "discordo", "sem_opiniao"].includes(rotulo)) {
    return NextResponse.json({ error: "adId, dia e rotulo (concordo|discordo|sem_opiniao) são obrigatórios" }, { status: 400 });
  }
  const { error } = await supabaseAdmin.from("creative_health")
    .update({ rotulo, rotulado_por: gate.user.email, rotulado_em: new Date().toISOString() }).eq("ad_id", adId).eq("data", dia);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
