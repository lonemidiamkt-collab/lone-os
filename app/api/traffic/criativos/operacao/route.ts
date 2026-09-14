export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { temTrafego } from "@/lib/clients/servico";

// CREATIVE OPERATIONS (brief 14/09, item 20 — a visão do Roberto): quantos criativos pedidos e
// entregues, tempo médio do designer, atrasados, testes criados, clientes sem teste novo, clientes
// há 30 dias com os mesmos criativos, vencedores encontrados e replicados. Últimos 30 dias.
export async function GET(req: NextRequest) {
  const gate = await requireRole(req, ["admin", "manager"]);
  if (gate instanceof NextResponse) return gate;
  const desde = new Date(Date.now() - 30 * 864e5).toISOString();
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [{ data: drs }, { data: lins }, { data: dia }, { data: cli }, { data: versoes }] = await Promise.all([
    supabaseAdmin.from("design_requests").select("id, client_id, status, origem, created_at, updated_at, deadline, assigned_designer").gte("created_at", desde),
    supabaseAdmin.from("creative_lineage").select("id, client_id, child_ad_id, resultado, created_at"),
    supabaseAdmin.from("creative_health").select("data").order("data", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("clients").select("id, name, nome_fantasia, service_type, assigned_designer").or("active.is.null,active.eq.true").is("churned_at", null).is("draft_status", null),
    supabaseAdmin.from("creative_snapshots").select("client_id, primeira_vez").gte("primeira_vez", desde),
  ]);
  const { data: saude } = dia ? await supabaseAdmin.from("creative_health").select("client_id, vencedor, estado").eq("data", dia.data as string) : { data: [] as Record<string, unknown>[] };

  const pedidos = drs ?? [];
  const entregues = pedidos.filter((d) => d.status === "done");
  const tempos = entregues.map((d) => (Date.parse(d.updated_at as string) - Date.parse(d.created_at as string)) / 864e5).filter((n) => n >= 0 && n < 60);
  const tempoMedio = tempos.length ? Math.round((tempos.reduce((a, b) => a + b, 0) / tempos.length) * 10) / 10 : null;
  const atrasados = pedidos.filter((d) => d.status !== "done" && d.deadline && String(d.deadline) < hoje).length;
  const porDesigner: Record<string, { pedidos: number; entregues: number; atrasados: number }> = {};
  for (const d of pedidos) {
    const k = (d.assigned_designer as string) || (cli ?? []).find((c) => c.id === d.client_id)?.assigned_designer as string || "(sem designer)";
    porDesigner[k] ??= { pedidos: 0, entregues: 0, atrasados: 0 };
    porDesigner[k].pedidos++; if (d.status === "done") porDesigner[k].entregues++;
    if (d.status !== "done" && d.deadline && String(d.deadline) < hoje) porDesigner[k].atrasados++;
  }

  const trafego = (cli ?? []).filter((c) => temTrafego({ service_type: c.service_type as string | null }));
  const nome = (id: string) => { const c = (cli ?? []).find((x) => x.id === id); return ((c?.nome_fantasia as string) || (c?.name as string)) ?? id; };
  const vencedores = (saude ?? []).filter((s) => s.vencedor);
  const clientesComVencedor = new Set(vencedores.map((v) => v.client_id as string));
  const replicados = (lins ?? []).filter((l) => l.created_at >= desde);
  const comTeste = new Set(replicados.map((l) => l.client_id as string));
  const comCriativoNovo = new Set((versoes ?? []).map((v) => v.client_id as string));
  const semCriativoNovo30d = trafego.filter((c) => !comCriativoNovo.has(c.id as string)).map((c) => nome(c.id as string));
  const vencedorSemTeste = [...clientesComVencedor].filter((id) => !comTeste.has(id)).map(nome);
  const vereditos = (lins ?? []).map((l) => (l.resultado as { veredito?: string } | null)?.veredito).filter(Boolean) as string[];

  return NextResponse.json({
    periodo: "30 dias", dia: dia?.data ?? null,
    demandas: { pedidas: pedidos.length, entregues: entregues.length, viaIa: pedidos.filter((d) => d.origem === "ia_replicacao").length, atrasadas: atrasados, tempoMedioDias: tempoMedio, porDesigner },
    testes: { criados: replicados.length, noAr: (lins ?? []).filter((l) => l.child_ad_id).length, validados: vereditos.filter((v) => v === "validada").length, refutados: vereditos.filter((v) => v === "refutada").length },
    criativos: { avaliados: (saude ?? []).length, vencedores: vencedores.length, criticos: (saude ?? []).filter((s) => s.estado === "CRITICAL").length, clientesComVencedor: clientesComVencedor.size },
    alertas: { vencedorSemTeste, semCriativoNovo30d, contasTrafego: trafego.length },
  });
}
