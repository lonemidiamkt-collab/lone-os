// lib/google/sincronizar.ts — lê o Google Ads e o Perfil da Empresa de cada cliente vinculado e GRAVA DIA A DIA
// (tabelas google_* da migração 20261118120000). Só servidor. Chamado pela rotina diária
// (POST /api/system/google-sync, 7h) e pelo botão "Atualizar agora" da ficha.
//
// Janelas:
//   · Google Ads: relê os últimos 30 dias (a conversão chega dias depois do clique e o Google ainda corrige custo
//     inválido). Primeira leitura de uma conta: 120 dias — já dá relatório mensal com o mês anterior para comparar.
//   · Perfil da Empresa: relê os últimos 12 dias (o Google libera com 2–5 dias de atraso). Primeira leitura: 400 dias
//     (o Google guarda 18 meses). Só grava até o último dia que o Google já entregou: o resto não vira "zero".
//   · Termos de busca: os 2 últimos meses fechados (primeira leitura: 6).
//
// Idempotente: grava por chave (conta/campanha/dia, perfil/dia) e depois apaga, dentro da janela relida, as linhas que
// não vieram nesta leitura (campanha removida, ação de conversão renomeada). Rodar duas vezes dá o mesmo banco.
//
// Falha nunca vira zero (docs/ERRO_RECUPERAVEL.md): se a leitura falha, NADA é apagado; o motivo vai em frase para
// google_sincronia (a ficha e o relatório mostram) e o resultado volta com ok:false (a Central de Automações vê).

import { supabaseAdmin } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/clients/pausa";
import { somarDias } from "@/lib/reports/relatorioCliente";
import { normalizarIdAds } from "./marketing-auth";
import { lerContaAds } from "./ads-api";
import { lerMetricasDiarias, lerBuscasDoMes } from "./perfil-api";
import { lerPropriedade, PROPRIEDADE_VALIDA } from "./analytics-api";

const DIAS_ADS = 30;
const DIAS_ADS_PRIMEIRA = 120;
const DIAS_PERFIL = 12;
const DIAS_PERFIL_PRIMEIRA = 400;
// Google Analytics: o GA4 ainda ajusta os 2–3 últimos dias (sessão que atravessa a meia-noite, dado atrasado do app).
// Relê 7; a primeira leitura cobre 400 dias (dá o mês anterior e o mesmo mês do ano passado).
const DIAS_ANALYTICS = 7;
const DIAS_ANALYTICS_PRIMEIRA = 400;
const LOTE = 500;

export interface ClienteGoogle {
  id: string;
  name?: string | null;
  google_ads_customer_id: string | null;
  google_ads_login_id: string | null;
  google_perfil_local: string | null;
  /** Só existe depois da migração 20261119100000_google_analytics.sql. */
  google_analytics_propriedade?: string | null;
}

export interface ResultadoSincronia {
  clientId: string;
  ads: { ok: boolean; linhas?: number; de?: string; ate?: string; erro?: string; avisos?: string[] } | null;
  perfil: { ok: boolean; linhas?: number; ultimoDia?: string | null; termos?: number; erro?: string } | null;
  analytics?: { ok: boolean; linhas?: number; eventos?: number; de?: string; ate?: string; erro?: string } | null;
}

async function gravarEmLotes(tabela: string, linhas: Record<string, unknown>[], onConflict: string): Promise<string | null> {
  for (let i = 0; i < linhas.length; i += LOTE) {
    const { error } = await supabaseAdmin.from(tabela).upsert(linhas.slice(i, i + LOTE), { onConflict });
    if (error) return `${tabela}: ${error.message}`;
  }
  return null;
}

async function estadoAtual(clientId: string) {
  const { data } = await supabaseAdmin.from("google_sincronia")
    .select("*").eq("client_id", clientId).maybeSingle();
  return (data ?? null) as { ads_sincronizado_em: string | null; perfil_sincronizado_em: string | null; perfil_ultimo_dia: string | null; analytics_sincronizado_em?: string | null } | null;
}

async function anotar(clientId: string, campos: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from("google_sincronia")
    .upsert({ client_id: clientId, ...campos, atualizado_em: new Date().toISOString() }, { onConflict: "client_id" });
  if (error) console.error(`[google-sync] estado do cliente ${clientId} não gravado:`, error.message);
}

/** Primeiro dia do mês `n` meses antes do mês de `dia` ("2026-11-18", 1 → "2026-10-01"). */
function mesAntes(dia: string, n: number): string {
  const [y, m] = dia.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 - n, 1, 12));
  return t.toISOString().slice(0, 10);
}

async function sincronizarAds(c: ClienteGoogle, primeira: boolean, hoje: string): Promise<NonNullable<ResultadoSincronia["ads"]>> {
  const conta = normalizarIdAds(c.google_ads_customer_id);
  if (!conta) return { ok: false, erro: "ID da conta do Google Ads inválido na ficha (são 10 dígitos)." };
  const ate = somarDias(hoje, -1);
  const de = somarDias(ate, -((primeira ? DIAS_ADS_PRIMEIRA : DIAS_ADS) - 1));
  const r = await lerContaAds(conta, normalizarIdAds(c.google_ads_login_id), de, ate);
  if (!r.ok) return { ok: false, erro: r.erro, de, ate };

  const rodada = new Date().toISOString();
  const erroCamp = await gravarEmLotes("google_ads_campanha_dia",
    r.dados.campanhas.map((l) => ({ customer_id: conta, ...l, atualizado_em: rodada })), "customer_id,campaign_id,dia");
  if (erroCamp) return { ok: false, erro: `Li o Google Ads mas não consegui gravar (${erroCamp}).`, de, ate };
  const { error: errLimpa } = await supabaseAdmin.from("google_ads_campanha_dia").delete()
    .eq("customer_id", conta).gte("dia", de).lte("dia", ate).lt("atualizado_em", rodada);
  if (errLimpa) console.error("[google-sync] limpeza de campanhas:", errLimpa.message);

  const avisos = [...r.dados.avisos];
  if (r.dados.acoes) {
    const erroAcao = await gravarEmLotes("google_ads_acao_dia",
      r.dados.acoes.map((l) => ({ customer_id: conta, ...l, atualizado_em: rodada })), "customer_id,dia,categoria,acao");
    if (erroAcao) avisos.push(`ações de conversão não gravadas (${erroAcao})`);
    else {
      const { error } = await supabaseAdmin.from("google_ads_acao_dia").delete()
        .eq("customer_id", conta).gte("dia", de).lte("dia", ate).lt("atualizado_em", rodada);
      if (error) console.error("[google-sync] limpeza de ações:", error.message);
    }
  }
  await anotar(c.id, { ads_sincronizado_em: rodada, ads_erro: avisos.length ? `Parcial — ${avisos.join("; ")}` : null, ...(r.dados.moeda ? { ads_moeda: r.dados.moeda } : {}) });
  return { ok: true, linhas: r.dados.campanhas.length, de, ate, avisos };
}

async function sincronizarPerfil(c: ClienteGoogle, primeira: boolean, ultimoGravado: string | null, hoje: string): Promise<NonNullable<ResultadoSincronia["perfil"]>> {
  const local = c.google_perfil_local ?? "";
  const ate = somarDias(hoje, -1);
  const de = somarDias(ate, -((primeira ? DIAS_PERFIL_PRIMEIRA : DIAS_PERFIL) - 1));
  const r = await lerMetricasDiarias(local, de, ate);
  if (!r.ok) return { ok: false, erro: r.erro };

  const rodada = new Date().toISOString();
  const { linhas, ultimoDia } = r.dados;
  // Só até o último dia que o Google já entregou; antes dele, zero é zero de verdade.
  const validas = ultimoDia ? linhas.filter((l) => l.dia <= ultimoDia) : [];
  const erro = await gravarEmLotes("google_perfil_dia", validas.map((l) => ({ local, ...l, atualizado_em: rodada })), "local,dia");
  if (erro) return { ok: false, erro: `Li o Perfil da Empresa mas não consegui gravar (${erro}).` };

  // Termos de busca dos meses fechados (falha aqui não derruba os números do dia).
  let termos = 0;
  const avisos: string[] = [];
  for (let i = 1; i <= (primeira ? 6 : 2); i++) {
    const mes = mesAntes(hoje, i);
    const [ano, m] = mes.split("-").map(Number);
    const t = await lerBuscasDoMes(local, ano, m);
    if (!t.ok) { avisos.push(`termos de busca: ${t.erro}`); break; }
    if (!t.dados.length) continue; // o Google ainda não fechou o mês: não apaga o que havia
    const erroT = await gravarEmLotes("google_perfil_buscas",
      t.dados.map((x) => ({ local, mes, termo: x.termo, valor: x.valor, limiar: x.limiar, atualizado_em: rodada })), "local,mes,termo");
    if (erroT) { avisos.push(`termos de busca não gravados (${erroT})`); break; }
    await supabaseAdmin.from("google_perfil_buscas").delete().eq("local", local).eq("mes", mes).lt("atualizado_em", rodada);
    termos += t.dados.length;
  }

  const novoUltimo = [ultimoDia, ultimoGravado].filter((x): x is string => !!x).sort().pop() ?? null;
  await anotar(c.id, {
    perfil_sincronizado_em: rodada,
    perfil_ultimo_dia: novoUltimo,
    perfil_erro: !ultimoDia
      ? "O Google ainda não entregou números deste perfil nos últimos dias (perfil novo, suspenso ou sem verificação)."
      : avisos.length ? `Parcial — ${avisos.join("; ")}` : null,
  });
  return { ok: true, linhas: validas.length, ultimoDia, termos };
}

async function sincronizarAnalytics(c: ClienteGoogle, primeira: boolean, hoje: string): Promise<NonNullable<ResultadoSincronia["analytics"]>> {
  const prop = c.google_analytics_propriedade ?? "";
  if (!PROPRIEDADE_VALIDA.test(prop)) return { ok: false, erro: "Propriedade do Google Analytics inválida na ficha (esperado properties/<número>)." };
  const ate = somarDias(hoje, -1);
  const de = somarDias(ate, -((primeira ? DIAS_ANALYTICS_PRIMEIRA : DIAS_ANALYTICS) - 1));
  const r = await lerPropriedade(prop, de, ate);
  if (!r.ok) return { ok: false, erro: r.erro, de, ate };

  const rodada = new Date().toISOString();
  const erroDia = await gravarEmLotes("google_analytics_dia",
    r.dados.dias.map((l) => ({ propriedade: prop, ...l, atualizado_em: rodada })), "propriedade,dia,canal");
  if (erroDia) return { ok: false, erro: `Li o Google Analytics mas não consegui gravar (${erroDia}).`, de, ate };
  const erroEv = await gravarEmLotes("google_analytics_evento_dia",
    r.dados.eventos.map((l) => ({ propriedade: prop, ...l, atualizado_em: rodada })), "propriedade,dia,evento,link");
  if (erroEv) return { ok: false, erro: `Li o Google Analytics mas não consegui gravar os eventos (${erroEv}).`, de, ate };
  // O que não veio nesta leitura, dentro da janela relida, saiu do GA4 (canal reclassificado, evento renomeado).
  for (const tabela of ["google_analytics_dia", "google_analytics_evento_dia"]) {
    const { error } = await supabaseAdmin.from(tabela).delete().eq("propriedade", prop).gte("dia", de).lte("dia", ate).lt("atualizado_em", rodada);
    if (error) console.error(`[google-sync] limpeza de ${tabela}:`, error.message);
  }
  await anotar(c.id, { analytics_sincronizado_em: rodada, analytics_erro: null });
  return { ok: true, linhas: r.dados.dias.length, eventos: r.dados.eventos.length, de, ate };
}

/** Lê e grava um cliente. Nunca lança. */
export async function sincronizarCliente(c: ClienteGoogle, opcoes: { refazerTudo?: boolean } = {}): Promise<ResultadoSincronia> {
  const hoje = hojeSP();
  const estado = await estadoAtual(c.id);
  const out: ResultadoSincronia = { clientId: c.id, ads: null, perfil: null };
  try {
    if (c.google_ads_customer_id) {
      out.ads = await sincronizarAds(c, opcoes.refazerTudo || !estado?.ads_sincronizado_em, hoje);
      if (!out.ads.ok) await anotar(c.id, { ads_erro: out.ads.erro });
    }
  } catch (e) {
    out.ads = { ok: false, erro: `Falha inesperada ao ler o Google Ads: ${e instanceof Error ? e.message : String(e)}` };
    await anotar(c.id, { ads_erro: out.ads.erro });
  }
  try {
    if (c.google_perfil_local) {
      out.perfil = await sincronizarPerfil(c, opcoes.refazerTudo || !estado?.perfil_sincronizado_em, estado?.perfil_ultimo_dia ?? null, hoje);
      if (!out.perfil.ok) await anotar(c.id, { perfil_erro: out.perfil.erro });
    }
  } catch (e) {
    out.perfil = { ok: false, erro: `Falha inesperada ao ler o Perfil da Empresa: ${e instanceof Error ? e.message : String(e)}` };
    await anotar(c.id, { perfil_erro: out.perfil.erro });
  }
  try {
    if (c.google_analytics_propriedade) {
      out.analytics = await sincronizarAnalytics(c, opcoes.refazerTudo || !estado?.analytics_sincronizado_em, hoje);
      if (!out.analytics.ok) await anotar(c.id, { analytics_erro: out.analytics.erro });
    }
  } catch (e) {
    out.analytics = { ok: false, erro: `Falha inesperada ao ler o Google Analytics: ${e instanceof Error ? e.message : String(e)}` };
    await anotar(c.id, { analytics_erro: out.analytics.erro });
  }
  return out;
}

export const COLUNAS_CLIENTE_GOOGLE = "id, name, google_ads_customer_id, google_ads_login_id, google_perfil_local";

/** Todos os clientes ativos com Google Ads, Perfil ou Analytics vinculado. */
export async function clientesComGoogle(onlyClientId?: string | null): Promise<{ clientes: ClienteGoogle[]; erro: string | null }> {
  const { temColunasAnalytics } = await import("./colunas");
  const ga = await temColunasAnalytics();
  let q = supabaseAdmin.from("clients").select(`${COLUNAS_CLIENTE_GOOGLE}${ga ? ", google_analytics_propriedade" : ""}`)
    .or(`google_ads_customer_id.not.is.null,google_perfil_local.not.is.null${ga ? ",google_analytics_propriedade.not.is.null" : ""}`)
    .neq("active", false); // ex-cliente (encerramento grava active=false) não é mais lido
  if (onlyClientId) q = q.eq("id", onlyClientId);
  const { data, error } = await q;
  if (error) return { clientes: [], erro: error.message };
  return { clientes: (data ?? []) as unknown as ClienteGoogle[], erro: null };
}

// ── Vínculo automático (lib/google/detectar.ts) ──────────────────────────────────────────────────────

export interface ResultadoDeteccao {
  vinculados: { clientId: string; cliente: string; tipo: "ads" | "perfil" | "analytics"; nome: string; motivo: string }[];
  sugestoes: number;
  erros: string[];
}

/**
 * Procura, entre as contas e perfis que a Lone gerencia, os de cada cliente ainda sem vínculo. Vincula sozinho o que
 * é certo e único; grava o resto como sugestão. Nunca troca um vínculo que já existe. Nunca lança.
 */
export async function detectarVinculos(): Promise<ResultadoDeteccao> {
  const out: ResultadoDeteccao = { vinculados: [], sugestoes: 0, erros: [] };
  const { estadoMarketing } = await import("./marketing-auth");
  const { listarContasAds } = await import("./ads-api");
  const { listarPerfis } = await import("./perfil-api");
  const { listarPropriedades } = await import("./analytics-api");
  const { temColunasAnalytics } = await import("./colunas");
  const { casar } = await import("./detectar");
  const conexao = await estadoMarketing();
  if (!conexao.conectado) { out.erros.push("conexão do Google Ads e Perfil não está feita"); return out; }
  const ga = conexao.analytics && (await temColunasAnalytics());

  const { data, error } = await supabaseAdmin.from("clients")
    .select(`id, name, nome_fantasia, razao_social, phone, contact_phone, google_ads_customer_id, google_perfil_local${ga ? ", google_analytics_propriedade" : ""}`)
    .neq("active", false).is("draft_status", null);
  if (error) { out.erros.push(`clientes: ${error.message}`); return out; }
  const clientes = (data ?? []) as unknown as import("./detectar").ClienteParaCasar[];
  const nomeDe = new Map(clientes.map((c) => [c.id, c.nome_fantasia || c.name || c.id]));

  const sugestoes: Record<string, unknown>[] = [];
  const procurados = new Set<string>();

  if (conexao.ads) {
    const r = await listarContasAds();
    if (!r.ok) out.erros.push(`Google Ads: ${r.erro}`);
    else {
      const login = new Map(r.dados.map((x) => [x.id, x.loginId]));
      const { automaticos, sugestoes: s } = casar(clientes, r.dados.map((x) => ({ chave: x.id, nome: x.nome })), "ads");
      for (const m of automaticos) {
        // `.is(null)`: se alguém vinculou na mão entre a leitura e agora, não sobrescreve.
        const { data: feito, error: e } = await supabaseAdmin.from("clients")
          .update({ google_ads_customer_id: m.chave, google_ads_nome: m.nome, google_ads_login_id: login.get(m.chave) ?? null })
          .eq("id", m.clientId).is("google_ads_customer_id", null).select("id");
        if (e) out.erros.push(`${nomeDe.get(m.clientId)}: ${e.message}`);
        else if (feito?.length) out.vinculados.push({ clientId: m.clientId, cliente: nomeDe.get(m.clientId)!, tipo: "ads", nome: m.nome, motivo: m.motivo });
      }
      for (const m of s) sugestoes.push({ client_id: m.clientId, tipo: "ads", chave: m.chave, nome: m.nome, login_id: login.get(m.chave) ?? null, motivo: m.motivo });
      procurados.add("ads");
    }
  }
  if (conexao.perfil) {
    const r = await listarPerfis();
    if (!r.ok) out.erros.push(`Perfil da Empresa: ${r.erro}`);
    else {
      const { automaticos, sugestoes: s } = casar(clientes, r.dados.map((x) => ({ chave: x.local, nome: x.nome, telefone: x.telefone })), "perfil");
      for (const m of automaticos) {
        const { data: feito, error: e } = await supabaseAdmin.from("clients")
          .update({ google_perfil_local: m.chave, google_perfil_nome: m.nome })
          .eq("id", m.clientId).is("google_perfil_local", null).select("id");
        if (e) out.erros.push(`${nomeDe.get(m.clientId)}: ${e.message}`);
        else if (feito?.length) out.vinculados.push({ clientId: m.clientId, cliente: nomeDe.get(m.clientId)!, tipo: "perfil", nome: m.nome, motivo: m.motivo });
      }
      for (const m of s) sugestoes.push({ client_id: m.clientId, tipo: "perfil", chave: m.chave, nome: m.nome, login_id: null, motivo: m.motivo });
      procurados.add("perfil");
    }
  }

  if (ga) {
    const r = await listarPropriedades();
    if (!r.ok) out.erros.push(`Google Analytics: ${r.erro}`);
    else {
      const { automaticos, sugestoes: s } = casar(clientes, r.dados.map((x) => ({ chave: x.propriedade, nome: x.nome, outrosNomes: x.contaNome ? [x.contaNome] : [] })), "analytics");
      for (const m of automaticos) {
        const { data: feito, error: e } = await supabaseAdmin.from("clients")
          .update({ google_analytics_propriedade: m.chave, google_analytics_nome: m.nome })
          .eq("id", m.clientId).is("google_analytics_propriedade", null).select("id");
        if (e) out.erros.push(`${nomeDe.get(m.clientId)}: ${e.message}`);
        else if (feito?.length) out.vinculados.push({ clientId: m.clientId, cliente: nomeDe.get(m.clientId)!, tipo: "analytics", nome: m.nome, motivo: m.motivo });
      }
      for (const m of s) sugestoes.push({ client_id: m.clientId, tipo: "analytics", chave: m.chave, nome: m.nome, login_id: null, motivo: m.motivo });
      procurados.add("analytics");
    }
  }

  // Sugestões refeitas só do tipo que foi lido com sucesso (falha na leitura não apaga as de ontem).
  for (const tipo of procurados) {
    const { error: e } = await supabaseAdmin.from("google_sugestoes").delete().eq("tipo", tipo);
    if (e) { out.erros.push(`sugestões: ${e.message}`); continue; }
    const doTipo = sugestoes.filter((x) => x.tipo === tipo);
    for (let i = 0; i < doTipo.length; i += LOTE) {
      const { error: e2 } = await supabaseAdmin.from("google_sugestoes").insert(doTipo.slice(i, i + LOTE));
      if (e2) out.erros.push(`sugestões: ${e2.message}`);
    }
    out.sugestoes += doTipo.length;
  }
  return out;
}
