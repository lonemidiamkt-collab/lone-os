export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/clients/pausa";
import { somarDias } from "@/lib/reports/relatorioCliente";
import { faltaNoBanco } from "@/lib/trafego/anuncios-server";
import { montarLinhaMeta, frequenciaDaConta, type ContaMeta, type DiaMeta, type LinhaMeta } from "@/lib/trafego/carteira-meta";

// GET /api/trafego/meta-carteira?de=YYYY-MM-DD&ate=YYYY-MM-DD — a visão "Carteira" da aba Anúncios Meta (19/11/2026).
// Uma linha por cliente com conta Meta, do que o servidor JÁ gravou (metric_snapshots dia a dia, ad_accounts e
// meta_ad_period): nenhuma chamada à Meta, sempre cheia. Compara com o período anterior do mesmo tamanho.
// Regras em lib/trafego/carteira-meta.ts.

const TRAFEGO: Papel[] = ["admin", "manager", "traffic"];
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export interface ItemCarteiraMeta { clientId: string; nome: string; gestor: string | null; linha: LinhaMeta; leituraEm: string | null }
export interface RespostaCarteiraMeta { periodo: { de: string; ate: string }; anterior: { de: string; ate: string }; itens: ItemCarteiraMeta[]; falhas: string[] }

async function lerTudo<T>(montar: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string; code?: string } | null }>): Promise<{ data: T[]; error: { message: string; code?: string } | null }> {
  const out: T[] = [];
  for (let i = 0; i < 200; i++) {
    const { data, error } = await montar(i * 1000, i * 1000 + 999);
    if (error) return { data: [], error };
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return { data: out, error: null };
}

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, TRAFEGO);
  if (gate instanceof NextResponse) return gate;
  const hoje = hojeSP();
  const ontem = somarDias(hoje, -1);
  const sp = req.nextUrl.searchParams;
  let de = sp.get("de") ?? somarDias(ontem, -6);
  let ate = sp.get("ate") ?? ontem;
  if (!DATA.test(de) || !DATA.test(ate) || de > ate) return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  if (ate > ontem) ate = ontem;
  if (de > ate) de = ate;
  const tamanho = Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000) + 1;
  if (tamanho > 400) return NextResponse.json({ error: "Período de no máximo 400 dias." }, { status: 400 });
  const anterior = { de: somarDias(de, -tamanho), ate: somarDias(de, -1) };

  try {
    const falhas: string[] = [];
    const colsSnap = "client_id, metric_date, spend, impressions, clicks, conversions";
    const lerSnaps = (cols: string) => lerTudo<DiaMeta & { client_id: string }>((a, b) => supabaseAdmin.from("metric_snapshots").select(cols)
      .gte("metric_date", anterior.de).lte("metric_date", ate).order("client_id").order("metric_date").range(a, b));
    let snaps = await lerSnaps(`${colsSnap}, results, result_kind`);
    if (snaps.error && faltaNoBanco(snaps.error)) snaps = await lerSnaps(colsSnap);
    if (snaps.error) throw new Error(`métricas diárias: ${snaps.error.message}`);

    const [cliRes, contasRes, freqRes] = await Promise.all([
      supabaseAdmin.from("clients").select("id, name, nome_fantasia, assigned_traffic, active, churned_at, draft_status, meta_ad_account_id"),
      supabaseAdmin.from("ad_accounts").select("client_id, monthly_budget, current_month_spend, last_3d_avg_spend, last_balance, is_prepaid, account_status, sync_error, last_synced_at"),
      lerTudo<{ client_id: string | null; ate: string; impressions: number | null; reach: number | null }>((a, b) => supabaseAdmin.from("meta_ad_period")
        .select("client_id, ate, impressions, reach").eq("dias", 7).gte("ate", somarDias(ate, -3)).lte("ate", hoje).order("ad_id").range(a, b)),
    ]);
    if (cliRes.error) throw new Error(`clientes: ${cliRes.error.message}`);
    if (contasRes.error) falhas.push("contas de anúncio");
    if (freqRes.error) falhas.push("frequência");

    type Cli = { id: string; name: string | null; nome_fantasia: string | null; assigned_traffic: string | null; active: boolean | null; churned_at: string | null; draft_status: string | null; meta_ad_account_id: string | null };
    const clientes = ((cliRes.data ?? []) as Cli[]).filter((c) => c.active !== false && !c.churned_at && c.draft_status == null && c.meta_ad_account_id);
    const contaDe = new Map(((contasRes.data ?? []) as (ContaMeta & { client_id: string; last_synced_at: string | null })[]).map((c) => [c.client_id, c]));
    const snapsDe = new Map<string, DiaMeta[]>();
    for (const s of snaps.data) { const arr = snapsDe.get(s.client_id) ?? []; arr.push(s); snapsDe.set(s.client_id, arr); }
    const freqDe = new Map<string, { ate: string; impressions: number | null; reach: number | null }[]>();
    for (const f of freqRes.data) { if (!f.client_id) continue; const arr = freqDe.get(f.client_id) ?? []; arr.push(f); freqDe.set(f.client_id, arr); }

    const itens: ItemCarteiraMeta[] = clientes.map((c) => {
      const conta = contaDe.get(c.id) ?? null;
      return {
        clientId: c.id,
        nome: c.nome_fantasia || c.name || "(sem nome)",
        gestor: c.assigned_traffic,
        leituraEm: conta?.last_synced_at ?? null,
        linha: montarLinhaMeta({
          hoje, periodo: { de, ate }, anterior, dias: snapsDe.get(c.id) ?? [], conta,
          frequencia7d: frequenciaDaConta(freqDe.get(c.id) ?? []),
        }),
      };
    });
    const resposta: RespostaCarteiraMeta = { periodo: { de, ate }, anterior, itens, falhas };
    return NextResponse.json(resposta);
  } catch (err) {
    console.error("[trafego/meta-carteira]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: `Não consegui montar a carteira da Meta (${err instanceof Error ? err.message : "erro"}).` }, { status: 500 });
  }
}
