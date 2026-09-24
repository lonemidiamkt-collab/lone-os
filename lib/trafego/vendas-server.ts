// lib/trafego/vendas-server.ts — leitura e gravação das vendas do cliente (Leva 7A, N9). Server-only.
// Regras em lib/trafego/vendas.ts. Antes da migração (tabela client_sales) tudo devolve
// `disponivel: false` — a tela avisa em vez de quebrar.

import { supabaseAdmin } from "@/lib/supabase/server";
import { faltaNoBanco } from "@/lib/trafego/anuncios-server";
import { lerMetricasJanela } from "@/lib/traffic/referencia-nicho-server";
import {
  resumoVendas, type LinhaVendasCarteira, type NovaVenda, type RespostaVendasCarteira, type RespostaVendasCliente, type VendaRegistro,
} from "@/lib/trafego/vendas";

const COLS = "id, client_id, sold_on, quantity, amount, channel, note, source, created_by, created_at";

const ontemDe = (hoje: string) => { const d = new Date(`${hoje}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

/** Investimento por cliente por dia (dias fechados; uma entrada por dia). */
async function gastoPorCliente(desde: string, ate: string, clientId?: string): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (ate < desde) return out;
  const linhas = await lerMetricasJanela(desde, ate);
  const porDia = new Map<string, number>();
  for (const l of linhas) {
    if (clientId && l.client_id !== clientId) continue;
    porDia.set(`${l.client_id}|${String(l.metric_date).slice(0, 10)}`, Number(l.spend) || 0);
  }
  for (const [chave, gasto] of porDia) {
    const id = chave.split("|")[0];
    const lista = out.get(id) ?? [];
    lista.push(gasto);
    out.set(id, lista);
  }
  return out;
}

export async function vendasDoCliente(clientId: string, desde: string, ate: string, hoje: string): Promise<RespostaVendasCliente> {
  const { data, error } = await supabaseAdmin.from("client_sales").select(COLS)
    .eq("client_id", clientId).is("deleted_at", null).gte("sold_on", desde).lte("sold_on", ate)
    .order("sold_on", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  if (error) {
    if (faltaNoBanco(error)) return { disponivel: false, desde, ate, vendas: [], resumo: resumoVendas([], null) };
    throw new Error(error.message);
  }
  const gasto = await gastoPorCliente(desde, ate < hoje ? ate : ontemDe(hoje), clientId);
  const vendas = (data ?? []) as unknown as VendaRegistro[];
  return { disponivel: true, desde, ate, vendas, resumo: resumoVendas(vendas, gasto.get(clientId) ?? []) };
}

export async function vendasDaCarteira(desde: string, ate: string, hoje: string): Promise<RespostaVendasCarteira> {
  const vendas: VendaRegistro[] = [];
  for (let de = 0; de < 20_000; de += 1000) {
    const { data, error } = await supabaseAdmin.from("client_sales").select(COLS)
      .is("deleted_at", null).gte("sold_on", desde).lte("sold_on", ate).order("sold_on").range(de, de + 999);
    if (error) {
      if (faltaNoBanco(error)) return { disponivel: false, desde, ate, linhas: [] };
      throw new Error(error.message);
    }
    vendas.push(...((data ?? []) as unknown as VendaRegistro[]));
    if (!data || data.length < 1000) break;
  }
  const ids = [...new Set(vendas.map((v) => v.client_id))];
  if (!ids.length) return { disponivel: true, desde, ate, linhas: [] };
  const [{ data: clientes }, gasto] = await Promise.all([
    supabaseAdmin.from("clients").select("id, name, nome_fantasia, assigned_traffic").in("id", ids),
    gastoPorCliente(desde, ate < hoje ? ate : ontemDe(hoje)),
  ]);
  const info = new Map((clientes ?? []).map((c) => [c.id as string, c]));
  const linhas: LinhaVendasCarteira[] = ids.map((id) => {
    const doCliente = vendas.filter((v) => v.client_id === id);
    const c = info.get(id);
    return {
      clientId: id,
      nome: ((c?.nome_fantasia as string) || (c?.name as string) || "(sem nome)"),
      gestor: (c?.assigned_traffic as string) ?? null,
      resumo: resumoVendas(doCliente, gasto.get(id) ?? []),
      ultimaVenda: doCliente.map((v) => v.sold_on).sort().pop() ?? null,
    };
  });
  linhas.sort((a, b) => b.resumo.vendas - a.resumo.vendas || a.nome.localeCompare(b.nome));
  return { disponivel: true, desde, ate, linhas };
}

export async function registrarVenda(clientId: string, v: NovaVenda, origem: "interno" | "portal", por: string | null): Promise<{ ok: true; id: string } | { ok: false; erro: string; indisponivel?: boolean }> {
  const { data, error } = await supabaseAdmin.from("client_sales").insert({
    client_id: clientId, sold_on: v.soldOn, quantity: v.quantity, amount: v.amount, channel: v.channel, note: v.note,
    source: origem, created_by: por,
  }).select("id").maybeSingle();
  if (error) {
    if (faltaNoBanco(error)) return { ok: false, erro: "O registro de vendas entra com a migração desta leva — ainda não está disponível.", indisponivel: true };
    return { ok: false, erro: error.message };
  }
  return { ok: true, id: data?.id as string };
}

/** Apaga (soft delete). No portal, só o que o próprio cliente lançou. */
export async function apagarVenda(id: string, clientId: string | null, soDoPortal: boolean): Promise<boolean> {
  let q = supabaseAdmin.from("client_sales").update({ deleted_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null);
  if (clientId) q = q.eq("client_id", clientId);
  if (soDoPortal) q = q.eq("source", "portal");
  const { data, error } = await q.select("id");
  return !error && (data?.length ?? 0) > 0;
}

/** Quantas vendas o portal deste cliente lançou hoje (freio contra abuso do link público). */
export async function lancamentosDoPortalHoje(clientId: string, hoje: string): Promise<number> {
  const { count } = await supabaseAdmin.from("client_sales").select("id", { count: "exact", head: true })
    .eq("client_id", clientId).eq("source", "portal").gte("created_at", `${hoje}T03:00:00Z`);
  return count ?? 0;
}
