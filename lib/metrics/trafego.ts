// lib/metrics/trafego.ts — a ponte do TRÁFEGO com o resto do sistema.
//
// O tráfego era o setor mais ilhado: verba e resultado não chegavam à ficha do cliente, e o agente CS
// não lia NADA de anúncio — podia cobrar produção de conteúdo de um cliente cuja conta estava zerada
// ou pausada. Aqui o dado vira algo que qualquer setor consegue consumir.
//
// DEDUP OBRIGATÓRIO: metric_snapshots captura ~95x/dia. Somar cru infla ~95×; pega-se o MAIOR valor
// por (cliente, conta, dia) — que é o acumulado final daquele dia.

import { supabaseAdmin } from "@/lib/supabase/server";
import { spNow, ymd } from "@/lib/cs/vigilancia";

export interface TrafegoCliente {
  clientId: string;
  gasto7d: number;
  leads7d: number;
  diasSemGastar: number | null;   // null = nunca gastou / sem dado
  verbaMes: number | null;        // monthly_budget da conta
  gastoMes: number | null;        // current_month_spend
  saldo: number | null;           // last_balance (conta pré-paga)
  contaAtiva: boolean;
}

export async function trafegoPorCliente(): Promise<Map<string, TrafegoCliente>> {
  const desde = ymd(new Date(Date.now() - 8 * 86400000));

  const [{ data: snaps }, { data: contas }] = await Promise.all([
    supabaseAdmin.from("metric_snapshots")
      .select("client_id, meta_ad_account_id, metric_date, spend, conversions")
      .gte("metric_date", desde),
    supabaseAdmin.from("ad_accounts")
      .select("client_id, monthly_budget, current_month_spend, last_balance, account_status")
      .not("client_id", "is", null),
  ]);

  // Dedup: maior valor por (cliente, conta, dia).
  const porDia = new Map<string, { spend: number; conv: number }>();
  for (const s of snaps ?? []) {
    const k = `${s.client_id}|${s.meta_ad_account_id}|${s.metric_date}`;
    const atual = porDia.get(k);
    const spend = Number(s.spend) || 0, conv = Number(s.conversions) || 0;
    if (!atual || spend > atual.spend) porDia.set(k, { spend, conv });
  }

  const hoje = ymd(spNow());
  const agg = new Map<string, { gasto: number; leads: number; ultimoDiaComGasto: string | null }>();
  for (const [k, v] of porDia) {
    const [clientId, , dia] = k.split("|");
    if (!clientId) continue;
    const a = agg.get(clientId) ?? { gasto: 0, leads: 0, ultimoDiaComGasto: null };
    a.gasto += v.spend;
    a.leads += v.conv;
    if (v.spend > 0 && (!a.ultimoDiaComGasto || dia > a.ultimoDiaComGasto)) a.ultimoDiaComGasto = dia;
    agg.set(clientId, a);
  }

  const contaDe = new Map<string, { verba: number | null; gastoMes: number | null; saldo: number | null; ativa: boolean }>();
  for (const c of contas ?? []) {
    contaDe.set(c.client_id as string, {
      verba: (c.monthly_budget as number) ?? null,
      gastoMes: (c.current_month_spend as number) ?? null,
      saldo: (c.last_balance as number) ?? null,
      ativa: ((c.account_status as string) ?? "").toUpperCase() !== "PAUSED",
    });
  }

  const out = new Map<string, TrafegoCliente>();
  const ids = new Set([...agg.keys(), ...contaDe.keys()]);
  for (const id of ids) {
    const a = agg.get(id);
    const c = contaDe.get(id);
    const dias = a?.ultimoDiaComGasto
      ? Math.max(0, Math.floor((new Date(`${hoje}T12:00:00-03:00`).getTime() - new Date(`${a.ultimoDiaComGasto}T12:00:00-03:00`).getTime()) / 86400000))
      : null;
    out.set(id, {
      clientId: id,
      gasto7d: Math.round((a?.gasto ?? 0) * 100) / 100,
      leads7d: a?.leads ?? 0,
      diasSemGastar: dias,
      verbaMes: c?.verba ?? null,
      gastoMes: c?.gastoMes ?? null,
      saldo: c?.saldo ?? null,
      contaAtiva: c?.ativa ?? false,
    });
  }
  return out;
}

/** Linha curta pro raio-x do cliente no WhatsApp. null = cliente sem tráfego. */
export function linhaTrafego(t?: TrafegoCliente | null): string | null {
  if (!t) return null;
  const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
  const partes = [`${brl(t.gasto7d)} em 7d`];
  if (t.leads7d > 0) partes.push(`${t.leads7d} resultados`);
  if (t.verbaMes && t.gastoMes != null) partes.push(`mês: ${brl(t.gastoMes)}/${brl(t.verbaMes)}`);
  if (t.diasSemGastar != null && t.diasSemGastar >= 3) partes.push(`⚠️ parado há ${t.diasSemGastar}d`);
  else if (t.diasSemGastar == null) partes.push("⚠️ sem gasto registrado");
  return `📈 *Tráfego:* ${partes.join(" · ")}`;
}
