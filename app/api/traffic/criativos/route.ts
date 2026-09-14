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
  const [{ data: cri }, { data: cli }] = await Promise.all([
    adIds.length ? supabaseAdmin.from("creative_snapshots").select("ad_id, tipo, thumb_url, image_url, body, title, cta, capturado_em").in("ad_id", adIds).order("capturado_em", { ascending: false }) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    clientIds.length ? supabaseAdmin.from("clients").select("id, name, nome_fantasia").in("id", clientIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const criativo = new Map<string, Record<string, unknown>>();
  for (const c of cri ?? []) if (!criativo.has(c.ad_id as string)) criativo.set(c.ad_id as string, c);
  const nome = new Map((cli ?? []).map((c) => [c.id as string, ((c.nome_fantasia as string) || (c.name as string)) ?? ""]));

  const itens = (linhas ?? []).map((l) => {
    const c = criativo.get(l.ad_id as string);
    return { ...l, cliente: nome.get(l.client_id as string) ?? "", tipo: c?.tipo ?? null, thumb: (c?.thumb_url as string) ?? (c?.image_url as string) ?? null, texto: (c?.body as string) ?? null, titulo: (c?.title as string) ?? null };
  });

  // Precisão acumulada do shadow: concordo ÷ (concordo + discordo), todos os dias.
  const { data: rot } = await supabaseAdmin.from("creative_health").select("rotulo").not("rotulo", "is", null).neq("rotulo", "sem_opiniao");
  const concordo = (rot ?? []).filter((r) => r.rotulo === "concordo").length;
  const total = (rot ?? []).length;
  return NextResponse.json({ dia, itens, precisao: total ? { concordo, total, taxa: Math.round((concordo / total) * 100) } : null });
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
