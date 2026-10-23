// lib/clients/conta-meta-server.ts — leitura e gravação do dono da conta de anúncio. Server-only.
// Regras em lib/clients/conta-meta.ts (21/10/2026). Toda leitura que falha LANÇA: "não consegui
// ler de quem é" nunca pode virar "a conta está livre" e deixar vincular por cima de outro cliente.

import { supabaseAdmin } from "@/lib/supabase/server";
import { mapearDonos, type DonoConta, type LinhaClienteConta, type LinhaEspelhoConta } from "@/lib/clients/conta-meta";

const COLS = "id, name, nome_fantasia, active, churned_at, meta_ad_account_id, meta_ad_account_name";
const grafias = (conta: string) => [...new Set([conta, conta.replace(/^act_/, "")])];

/** Todas as contas que têm dono (ficha + carteira de tráfego) — para a lista da ficha mostrar de quem é cada uma. */
export async function lerDonosDasContas(): Promise<Map<string, DonoConta[]>> {
  const [cli, esp] = await Promise.all([
    supabaseAdmin.from("clients").select(COLS).not("meta_ad_account_id", "is", null),
    supabaseAdmin.from("ad_accounts").select("client_id, meta_account_id"),
  ]);
  if (cli.error) throw new Error(cli.error.message);
  if (esp.error) throw new Error(esp.error.message);
  const espelho = (esp.data ?? []) as LinhaEspelhoConta[];
  // Quem só aparece na carteira de tráfego (a ficha aponta para outra conta) também precisa de nome.
  const conhecidos = new Set((cli.data ?? []).map((c) => c.id as string));
  const faltam = [...new Set(espelho.map((e) => e.client_id).filter((id) => id && !conhecidos.has(id)))];
  let extras: LinhaClienteConta[] = [];
  if (faltam.length) {
    const r = await supabaseAdmin.from("clients").select(COLS).in("id", faltam);
    if (r.error) throw new Error(r.error.message);
    extras = (r.data ?? []) as LinhaClienteConta[];
  }
  return mapearDonos([...((cli.data ?? []) as LinhaClienteConta[]), ...extras], espelho);
}

/** Quem tem esta conta (normalizada `act_…`), na ficha ou na carteira de tráfego. */
export async function donosDaConta(conta: string): Promise<DonoConta[]> {
  const g = grafias(conta);
  const esp = await supabaseAdmin.from("ad_accounts").select("client_id, meta_account_id").in("meta_account_id", g);
  if (esp.error) throw new Error(esp.error.message);
  const espelho = (esp.data ?? []) as LinhaEspelhoConta[];
  const ids = [...new Set(espelho.map((e) => e.client_id).filter(Boolean))];
  const [porConta, porEspelho] = await Promise.all([
    supabaseAdmin.from("clients").select(COLS).in("meta_ad_account_id", g),
    ids.length ? supabaseAdmin.from("clients").select(COLS).in("id", ids) : Promise.resolve({ data: [], error: null }),
  ]);
  if (porConta.error) throw new Error(porConta.error.message);
  if (porEspelho.error) throw new Error(porEspelho.error.message);
  const clientes = new Map<string, LinhaClienteConta>();
  for (const c of [...(porConta.data ?? []), ...(porEspelho.data ?? [])] as LinhaClienteConta[]) clientes.set(c.id, c);
  return mapearDonos([...clientes.values()], espelho).get(conta) ?? [];
}

/** Transferência confirmada: tira a conta da ficha dos donos anteriores (antes de gravar no novo). */
export async function soltarConta(conta: string, de: DonoConta[]): Promise<string | null> {
  const ids = de.filter((d) => d.naFicha).map((d) => d.clientId);
  if (!ids.length) return null;
  const { error } = await supabaseAdmin.from("clients")
    .update({ meta_ad_account_id: null, meta_ad_account_name: null })
    .in("id", ids).in("meta_ad_account_id", grafias(conta));
  return error ? error.message : null;
}

/** Desfaz `soltarConta` quando a gravação no cliente novo falhou: ninguém fica sem a conta à toa. */
export async function devolverConta(de: DonoConta[]): Promise<void> {
  for (const d of de) {
    if (!d.naFicha || !d.contaNaFicha) continue;
    const { error } = await supabaseAdmin.from("clients")
      .update({ meta_ad_account_id: d.contaNaFicha, meta_ad_account_name: d.nomeContaNaFicha })
      .eq("id", d.clientId).is("meta_ad_account_id", null);
    if (error) console.error(`[conta-meta] não devolvi a conta ${d.contaNaFicha} a ${d.nome}: ${error.message}`);
  }
}

/**
 * Espelho em `ad_accounts` (alerta de verba, digest, portal): sai a linha antiga deste cliente e a
 * conta fica com ele. Só chamar DEPOIS de `decidirVinculo` liberar — o upsert por meta_account_id
 * passa a linha de quem quer que a tenha. Devolve a frase do erro, ou null.
 */
export async function espelharConta(clientId: string, conta: string, nomeConta?: string | null): Promise<string | null> {
  const antigas = await supabaseAdmin.from("ad_accounts").delete().eq("client_id", clientId).neq("meta_account_id", conta);
  if (antigas.error) return antigas.error.message;
  const linha: Record<string, unknown> = { client_id: clientId, meta_account_id: conta };
  if (nomeConta) linha.account_name = nomeConta;
  const { error } = await supabaseAdmin.from("ad_accounts").upsert(linha, { onConflict: "meta_account_id" });
  return error ? error.message : null;
}
