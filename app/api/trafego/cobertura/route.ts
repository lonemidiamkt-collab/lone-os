export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireRole, type Papel } from "@/lib/api/require-role";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/clients/pausa";
import { temTrafego } from "@/lib/clients/servico";
import { janelaDeDias, montarCobertura, type ClienteCobertura, type RespostaCobertura } from "@/lib/trafego/cobertura";

// GET /api/trafego/cobertura[?dias=14|30] — Leva 7A (N7). Quais clientes e dias estão sem dado da
// Meta (conta e por anúncio). Só lê o que o servidor gravou. Regras em lib/trafego/cobertura.ts.

const TRAFEGO: Papel[] = ["admin", "manager", "traffic"];

/** Pares cliente+dia com gasto numa tabela (paginado — a API corta em 1000 linhas). */
async function diasPorCliente(tabela: "metric_snapshots" | "meta_entity_snapshots", desde: string, ate: string): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  for (let de = 0; de < 200_000; de += 1000) {
    let q = supabaseAdmin.from(tabela).select("client_id, metric_date").gte("metric_date", desde).lte("metric_date", ate);
    if (tabela === "meta_entity_snapshots") q = q.eq("nivel", "campaign").gt("spend", 0);
    const { data, error } = await q.order("metric_date").range(de, de + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    for (const r of data ?? []) {
      if (!r.client_id) continue;
      const s = out.get(r.client_id as string) ?? new Set<string>();
      s.add(String(r.metric_date).slice(0, 10));
      out.set(r.client_id as string, s);
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const gate = await requireRole(req, TRAFEGO);
  if (gate instanceof NextResponse) return gate;
  const n = Number(req.nextUrl.searchParams.get("dias")) === 30 ? 30 : 14;
  const ontem = (() => { const d = new Date(`${hojeSP()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
  const janela = janelaDeDias(ontem, n);
  try {
    const [{ data: clientes, error: eCli }, { data: contas, error: eContas }, diasConta, diasAnuncio] = await Promise.all([
      supabaseAdmin.from("clients").select("id, name, nome_fantasia, assigned_traffic, meta_ad_account_id, service_type, active, churned_at, draft_status"),
      supabaseAdmin.from("ad_accounts").select("client_id, meta_account_id, account_status, sync_error"),
      diasPorCliente("metric_snapshots", janela[0], ontem),
      diasPorCliente("meta_entity_snapshots", janela[0], ontem),
    ]);
    if (eCli || eContas) throw new Error((eCli ?? eContas)!.message);
    const contaDe = new Map((contas ?? []).map((a) => [a.client_id as string, a]));
    const lista: ClienteCobertura[] = (clientes ?? [])
      .filter((c) => c.active !== false && !c.churned_at && c.draft_status == null && temTrafego(c as never))
      .map((c) => {
        const a = contaDe.get(c.id as string);
        return {
          clientId: c.id as string,
          nome: ((c.nome_fantasia as string) || (c.name as string) || "(sem nome)"),
          gestor: (c.assigned_traffic as string) ?? null,
          metaAccountId: ((c.meta_ad_account_id as string) || (a?.meta_account_id as string) || null),
          statusConta: (a?.account_status as number | null) ?? null,
          syncErro: (a?.sync_error as string | null) ?? null,
        };
      });
    return NextResponse.json({ janela, linhas: montarCobertura(lista, diasConta, diasAnuncio, janela) } satisfies RespostaCobertura);
  } catch (e) {
    console.error("[trafego/cobertura]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Não consegui montar a cobertura agora." }, { status: 500 });
  }
}
