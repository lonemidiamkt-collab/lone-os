export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { comExecucao, anotar } from "@/lib/obs/correlacao";
import { montarDemanda, prazoPadrao, variavelDe } from "@/lib/traffic/replicar";

// POST /api/traffic/criativos/replicar { adId, variacao: {nome, muda, mantem, testa}, formato?, prazo? }
// Gestor escolhe a hipótese → nasce a demanda no quadro do designer do cliente, com briefing
// travado e a referência anexada, e a genealogia (creative_lineage) registra pai → filho.
// Dedupe: mesma variável do mesmo pai com demanda aberta → 409.

export async function POST(req: NextRequest) {
  const gate = await requireRole(req, ["admin", "manager", "traffic"]);
  if (gate instanceof NextResponse) return gate;
  const body = await req.json().catch(() => null);
  const adId = String(body?.adId ?? "");
  const v = body?.variacao as { nome?: string; muda?: string; mantem?: string; testa?: string } | undefined;
  if (!adId || !v?.nome || !v?.muda) return NextResponse.json({ error: "adId e variacao {nome, muda} são obrigatórios" }, { status: 400 });
  const variacao = { nome: String(v.nome).slice(0, 80), muda: String(v.muda).slice(0, 300), mantem: String(v.mantem ?? "").slice(0, 300), testa: String(v.testa ?? "").slice(0, 300) };
  const formato = String(body?.formato ?? "1080 × 1350").slice(0, 40);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const prazo = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.prazo ?? "")) ? String(body.prazo) : prazoPadrao(hoje);
  const variavel = variavelDe(variacao);

  return comExecucao({ origem: "api:replicar-vencedor", ator: gate.user.email, papel: gate.papel }, async () => {
    const [{ data: saude }, { data: cri }, { data: hip }] = await Promise.all([
      supabaseAdmin.from("creative_health").select("client_id, ad_name, amostra, baseline").eq("ad_id", adId).order("data", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("creative_snapshots").select("hash, thumb_url, image_url, tipo").eq("ad_id", adId).order("capturado_em", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("creative_hypotheses").select("elementos, roteiros").eq("ad_id", adId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (!saude?.client_id) return NextResponse.json({ error: "anúncio sem avaliação — não sei de que cliente é" }, { status: 404 });
    const clientId = saude.client_id as string;

    const { data: aberta } = await supabaseAdmin.from("design_requests").select("id, status").eq("parent_ad_id", adId).eq("variavel", variavel).neq("status", "done").limit(1).maybeSingle();
    if (aberta) return NextResponse.json({ error: "já existe uma demanda aberta testando essa variável deste anúncio", demandaId: aberta.id }, { status: 409 });

    const [{ data: cli }, { data: pol }, { data: tm }] = await Promise.all([
      supabaseAdmin.from("clients").select("name, nome_fantasia, assigned_designer").eq("id", clientId).maybeSingle(),
      supabaseAdmin.from("client_traffic_policy").select("cpl_alerta").eq("client_id", clientId).maybeSingle(),
      supabaseAdmin.from("team_members").select("name").eq("email", gate.user.email).maybeSingle(),
    ]);
    const cliente = ((cli?.nome_fantasia as string) || (cli?.name as string) || "Cliente");
    const am = (saude.amostra ?? {}) as { gasto7d?: number; conversas7d?: number; diasRodando?: number };
    const gasto = Number(am.gasto7d ?? 0), conv = Number(am.conversas7d ?? 0);
    const roteiro = ((hip?.roteiros as { variacao: string; roteiro: { angulo: string; etapas: { tempo: string; nome: string; texto: string }[] } | null }[] | null) ?? []).find((r) => r.variacao === variacao.nome)?.roteiro ?? null;
    const thumb = ((cri?.thumb_url as string) || (cri?.image_url as string) || null);

    const d = montarDemanda({
      cliente, adId, adName: saude.ad_name as string, thumbUrl: thumb,
      resultado: { cpl: conv > 0 ? gasto / conv : null, cplMeta: (pol?.cpl_alerta as number) ?? null, conversas: conv, gasto, dias: Number(am.diasRodando ?? 0) },
      variacao, formato, prazo, roteiro, elementos: (hip?.elementos as { tipo: string; descricao: string }[]) ?? [],
      pedidoPor: (tm?.name as string) ?? gate.user.email,
    });

    const { data: dr, error } = await supabaseAdmin.from("design_requests").insert({
      title: d.titulo, client_id: clientId, client_name: cliente, requested_by: (tm?.name as string) ?? gate.user.email,
      priority: "high", status: "queued", format: formato, briefing: d.briefing, attachments: d.attachments, deadline: prazo,
      origem: "ia_replicacao", parent_ad_id: adId, variavel,
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabaseAdmin.from("creative_lineage").insert({
      client_id: clientId, parent_ad_id: adId, parent_hash: (cri?.hash as string) ?? null, child_design_request_id: dr.id,
      variavel, hipotese: variacao.testa, mantem: variacao.mantem, muda: variacao.muda, criado_por: (tm?.name as string) ?? gate.user.email,
    }).then(({ error: e }) => { if (e) console.error("[replicar] lineage:", e.message); });

    const designer = (cli?.assigned_designer as string) || null;
    if (designer) {
      await supabaseAdmin.from("notifications").insert({
        type: "design", title: "🧬 Variação de vencedor pra você", body: `${cliente}: ${variacao.nome} — briefing travado e referência anexada. Prazo ${prazo.split("-").reverse().join("/")}.`,
        client_id: clientId, target_user: designer,
      }).then(({ error: e }) => { if (e) console.error("[replicar] notificação:", e.message); });
    }
    anotar(`replicar ${cliente}/${adId} → ${variavel} (designer: ${designer ?? "sem"})`);
    return NextResponse.json({ ok: true, demandaId: dr.id, designer, prazo, titulo: d.titulo });
  });
}
