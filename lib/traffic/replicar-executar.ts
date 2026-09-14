// lib/traffic/replicar-executar.ts — o NÚCLEO de "Replicar vencedor": usado pela rota (botão na
// tela) e pelo inbound (o gestor responde "pode" ao brief de segunda). Um caminho só.

import { supabaseAdmin } from "@/lib/supabase/server";
import { anotar } from "@/lib/obs/correlacao";
import { montarDemanda, prazoPadrao, variavelDe } from "./replicar";

export interface VariacaoPedida { nome: string; muda: string; mantem: string; testa: string }
export type ResultadoReplicacao =
  | { ok: true; demandaId: string; designer: string | null; prazo: string; titulo: string; cliente: string }
  | { ok: false; status: number; erro: string; demandaId?: string };

export async function executarReplicacao(p: { adId: string; variacao: VariacaoPedida; formato?: string; prazo?: string; pedidoPor: string }): Promise<ResultadoReplicacao> {
  const adId = p.adId;
  const variacao = { nome: p.variacao.nome.slice(0, 80), muda: p.variacao.muda.slice(0, 300), mantem: (p.variacao.mantem ?? "").slice(0, 300), testa: (p.variacao.testa ?? "").slice(0, 300) };
  const formato = (p.formato ?? "1080 × 1350").slice(0, 40);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const prazo = p.prazo && /^\d{4}-\d{2}-\d{2}$/.test(p.prazo) ? p.prazo : prazoPadrao(hoje);
  const variavel = variavelDe(variacao);

  const [{ data: saude }, { data: cri }, { data: hip }] = await Promise.all([
    supabaseAdmin.from("creative_health").select("client_id, ad_name, amostra, baseline").eq("ad_id", adId).order("data", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("creative_snapshots").select("hash, thumb_url, image_url, tipo").eq("ad_id", adId).order("capturado_em", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("creative_hypotheses").select("elementos, roteiros").eq("ad_id", adId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!saude?.client_id) return { ok: false, status: 404, erro: "anúncio sem avaliação — não sei de que cliente é" };
  const clientId = saude.client_id as string;

  const { data: aberta } = await supabaseAdmin.from("design_requests").select("id, status").eq("parent_ad_id", adId).eq("variavel", variavel).neq("status", "done").limit(1).maybeSingle();
  if (aberta) return { ok: false, status: 409, erro: "já existe uma demanda aberta testando essa variável deste anúncio", demandaId: aberta.id as string };

  const [{ data: cli }, { data: pol }] = await Promise.all([
    supabaseAdmin.from("clients").select("name, nome_fantasia, assigned_designer").eq("id", clientId).maybeSingle(),
    supabaseAdmin.from("client_traffic_policy").select("cpl_alerta").eq("client_id", clientId).maybeSingle(),
  ]);
  const cliente = ((cli?.nome_fantasia as string) || (cli?.name as string) || "Cliente");
  const am = (saude.amostra ?? {}) as { gasto7d?: number; conversas7d?: number; diasRodando?: number };
  const gasto = Number(am.gasto7d ?? 0), conv = Number(am.conversas7d ?? 0);
  const roteiro = ((hip?.roteiros as { variacao: string; roteiro: { angulo: string; etapas: { tempo: string; nome: string; texto: string }[] } | null }[] | null) ?? []).find((r) => r.variacao === variacao.nome)?.roteiro ?? null;
  const thumb = ((cri?.thumb_url as string) || (cri?.image_url as string) || null);

  const d = montarDemanda({
    cliente, adId, adName: saude.ad_name as string, thumbUrl: thumb,
    resultado: { cpl: conv > 0 ? gasto / conv : null, cplMeta: (pol?.cpl_alerta as number) ?? null, conversas: conv, gasto, dias: Number(am.diasRodando ?? 0) },
    variacao, formato, prazo, roteiro, elementos: (hip?.elementos as { tipo: string; descricao: string }[]) ?? [], pedidoPor: p.pedidoPor,
  });

  const { data: dr, error } = await supabaseAdmin.from("design_requests").insert({
    title: d.titulo, client_id: clientId, client_name: cliente, requested_by: p.pedidoPor,
    priority: "high", status: "queued", format: formato, briefing: d.briefing, attachments: d.attachments, deadline: prazo,
    origem: "ia_replicacao", parent_ad_id: adId, variavel,
  }).select("id").single();
  if (error) return { ok: false, status: 500, erro: error.message };

  await supabaseAdmin.from("creative_lineage").insert({
    client_id: clientId, parent_ad_id: adId, parent_hash: (cri?.hash as string) ?? null, child_design_request_id: dr.id,
    variavel, hipotese: variacao.testa, mantem: variacao.mantem, muda: variacao.muda, criado_por: p.pedidoPor,
  }).then(({ error: e }) => { if (e) console.error("[replicar] lineage:", e.message); });

  const designer = (cli?.assigned_designer as string) || null;
  if (designer) {
    await supabaseAdmin.from("notifications").insert({
      type: "design", title: "🧬 Variação de vencedor pra você", body: `${cliente}: ${variacao.nome} — briefing travado e referência anexada. Prazo ${prazo.split("-").reverse().join("/")}.`,
      client_id: clientId, target_user: designer,
    }).then(({ error: e }) => { if (e) console.error("[replicar] notificação:", e.message); });
  }
  anotar(`replicar ${cliente}/${adId} → ${variavel} (designer: ${designer ?? "sem"})`);
  return { ok: true, demandaId: dr.id as string, designer, prazo, titulo: d.titulo, cliente };
}
