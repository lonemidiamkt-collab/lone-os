// lib/google/colunas.ts — as colunas do Google em `clients` já existem neste banco?
//
// O deploy (deploy.sh) NÃO aplica migração. Se o código subir antes da 20261118120000_google_relatorios.sql, pedir
// `google_ads_customer_id` no select dá 400 — e a consulta que quebra é a do PORTAL de todo cliente e a da lista do
// relatório de segunda. Por isso quem pede essas colunas pergunta antes (o mesmo jeito de lib/conteudo/dados.ts,
// temColunasIg): `select *` de uma linha e olha as chaves. Sim fica guardado; não é perguntado de novo em 5 min.

import { supabaseAdmin } from "@/lib/supabase/server";

let sabido: { tem: boolean; em: number } | null = null;

export async function temColunasGoogle(): Promise<boolean> {
  if (sabido && (sabido.tem || Date.now() - sabido.em < 5 * 60_000)) return sabido.tem;
  try {
    const { data, error } = await supabaseAdmin.from("clients").select("*").limit(1);
    if (error) return false; // não grava: a próxima pergunta tenta de novo
    const linha = (data ?? [])[0] as Record<string, unknown> | undefined;
    const tem = !!linha && "google_ads_customer_id" in linha && "google_perfil_local" in linha;
    sabido = { tem, em: Date.now() };
    return tem;
  } catch {
    return false;
  }
}

/** Para os testes. */
export function _esquecerColunasGoogle() { sabido = null; }
