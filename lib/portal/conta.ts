// lib/portal/conta.ts — qual conta de anúncio o painel do cliente lê. Separado do buildSnapshot para o
// cache (snapshotCache.ts) conferir, barato, se um "sem conta" guardado ainda é verdade.
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Conta de anúncio do cliente. `indefinida` = existe conta, mas não dá pra afirmar qual/ler agora
 * (consulta falhou, ou duas contas sem a principal marcada). Isso NÃO é "sem conta".
 */
export async function contaDoCliente(clientId: string): Promise<{ conta: string | null; indefinida: string | null }> {
  const [{ data: linhas, error }, { data: cli, error: errCli }] = await Promise.all([
    supabaseAdmin.from("ad_accounts").select("meta_account_id").eq("client_id", clientId),
    supabaseAdmin.from("clients").select("meta_ad_account_id").eq("id", clientId).maybeSingle(),
  ]);
  if (error || errCli) return { conta: null, indefinida: `consulta: ${(error ?? errCli)?.message}` };
  const principal = (cli?.meta_ad_account_id as string | null) || null;
  const contas = [...new Set((linhas ?? []).map((l) => l.meta_account_id as string).filter(Boolean))];
  if (contas.length === 1) return { conta: contas[0], indefinida: null };
  if (contas.length === 0) return { conta: principal, indefinida: null };
  // Duas contas: a do cadastro do cliente é a principal (é ela que o /clients mantém em ad_accounts).
  if (principal && contas.includes(principal)) return { conta: principal, indefinida: null };
  return { conta: null, indefinida: `${contas.length} contas sem principal` };
}

