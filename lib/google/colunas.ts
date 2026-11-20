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

// O Google Analytics veio numa migração SEPARADA (20261119100000_google_analytics.sql): mesma pergunta, à parte —
// o Ads e o Perfil seguem funcionando num banco que ainda não tem as colunas do Analytics.
let sabidoGa: { tem: boolean; em: number } | null = null;

export async function temColunasAnalytics(): Promise<boolean> {
  if (sabidoGa && (sabidoGa.tem || Date.now() - sabidoGa.em < 5 * 60_000)) return sabidoGa.tem;
  try {
    const { data, error } = await supabaseAdmin.from("clients").select("*").limit(1);
    if (error) return false;
    const linha = (data ?? [])[0] as Record<string, unknown> | undefined;
    const tem = !!linha && "google_analytics_propriedade" in linha;
    sabidoGa = { tem, em: Date.now() };
    return tem;
  } catch {
    return false;
  }
}

// Tráfego › Google (20261119150000_trafego_google.sql): a verba do Google em `clients` e as tabelas do estado das
// campanhas e das avaliações. Mesma pergunta, à parte: o resto do Google segue funcionando sem elas.
let sabidoTrafego: { tem: boolean; em: number } | null = null;

export async function temTrafegoGoogle(): Promise<boolean> {
  if (sabidoTrafego && (sabidoTrafego.tem || Date.now() - sabidoTrafego.em < 5 * 60_000)) return sabidoTrafego.tem;
  try {
    const [cli, tab] = await Promise.all([
      supabaseAdmin.from("clients").select("*").limit(1),
      supabaseAdmin.from("google_perfil_resumo").select("local").limit(1),
    ]);
    if (cli.error) return false;
    const linha = (cli.data ?? [])[0] as Record<string, unknown> | undefined;
    const tem = !!linha && "google_ads_verba_mensal" in linha && !tab.error;
    sabidoTrafego = { tem, em: Date.now() };
    return tem;
  } catch {
    return false;
  }
}

/** Para os testes. */
export function _esquecerColunasGoogle() { sabido = null; sabidoGa = null; sabidoTrafego = null; }
