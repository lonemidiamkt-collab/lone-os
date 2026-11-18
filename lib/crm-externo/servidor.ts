// lib/crm-externo/servidor.ts — A CAMADA DE CRM DO LADO SERVIDOR: a conexão de cada cliente, a leitura no CRM certo
// (Âncora, Kommo ou API aberta), o cache curto e o bloco pronto para o relatório e o portal.
//
// Quem chama só pergunta "qual o bloco de atendimento e vendas deste cliente nesta janela?" (lerRelatorioCrm). Qual
// CRM, como assina, de onde vem o número — é tudo daqui para baixo. CRM novo = um `case` em `lerMetricas` e a
// tradução dele para MetricasCrm.
//
// SEGREDO: o token do Kommo mora CIFRADO (VAULT_KEY) e só é decifrado aqui, na hora de ler. Nenhuma função deste
// arquivo devolve segredo, hash de token ou config com segredo: a conexão sai por `conexaoPublica`.

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { decryptVault } from "@/lib/crypto/vault";
import { ancoraLigada, lerEstadosNoAncora, lerMetricasNoAncora } from "@/lib/integracoes/ancora-server";
import { janelaAnterior, somarDias, type Janela } from "@/lib/reports/relatorioCliente";
import { deAncora, dosEventos, TIPOS_EVENTO, type EventoCrm, type MetricasCrm, type ProvedorCrm, type TipoEvento } from "./metricas";
import { montarRelatorioCrm, type RelatorioCrm } from "./relatorio";
import { lerKommo } from "./kommo-server";

// ── A tabela existe? (o deploy não aplica migração — o mesmo cuidado de lib/google/colunas.ts) ──

let sabido: { tem: boolean; em: number } | null = null;
/**
 * false SÓ quando a tabela não existe (migração não aplicada). Qualquer outra falha (rede, timeout, 5xx) LANÇA:
 * "não consegui conferir" não pode virar "este cliente não tem CRM" — o relatório sairia sem a folha, calado.
 */
export async function temTabelasCrm(): Promise<boolean> {
  if (sabido && (sabido.tem || Date.now() - sabido.em < 5 * 60_000)) return sabido.tem;
  const { error } = await supabaseAdmin.from("crm_conexoes").select("id").limit(1);
  if (!error) { sabido = { tem: true, em: Date.now() }; return true; }
  if (/does not exist|schema cache|42P01|PGRST205/i.test(`${error.code ?? ""} ${error.message}`)) { sabido = { tem: false, em: Date.now() }; return false; }
  throw new Error(`Não consegui conferir as tabelas de CRM: ${error.message}`);
}
export function _esquecerTabelasCrm() { sabido = null; }

// ── Conexão ──

export interface ConfigCrm { subdominio?: string; funil_id?: number | null; etapa_orcamento_id?: number | null }

interface LinhaConexao {
  id: string;
  client_id: string;
  provedor: ProvedorCrm;
  ativa: boolean;
  config: ConfigCrm | null;
  segredo: string | null;
  token_prefixo: string | null;
  origem: "manual" | "automatica";
  criado_em: string;
  criado_por: string | null;
  ultima_leitura_em: string | null;
  ultimo_erro: string | null;
}

/** O que a tela pode ver: nada de segredo nem de hash. */
export interface ConexaoCrm {
  id: string;
  provedor: ProvedorCrm;
  ativa: boolean;
  config: ConfigCrm;
  tokenPrefixo: string | null;
  temSegredo: boolean;
  origem: "manual" | "automatica";
  criadoEm: string;
  criadoPor: string | null;
  ultimaLeituraEm: string | null;
  ultimoErro: string | null;
}

const COLUNAS = "id, client_id, provedor, ativa, config, segredo, token_prefixo, origem, criado_em, criado_por, ultima_leitura_em, ultimo_erro";

export function conexaoPublica(l: LinhaConexao): ConexaoCrm {
  return {
    id: l.id, provedor: l.provedor, ativa: l.ativa, config: l.config ?? {}, tokenPrefixo: l.token_prefixo,
    temSegredo: !!l.segredo, origem: l.origem, criadoEm: l.criado_em, criadoPor: l.criado_por,
    ultimaLeituraEm: l.ultima_leitura_em, ultimoErro: l.ultimo_erro,
  };
}

/** A conexão do cliente (ou null). Erro de banco LANÇA — "não consegui ler" não é "não tem CRM". */
export async function linhaDaConexao(clientId: string): Promise<LinhaConexao | null> {
  if (!(await temTabelasCrm())) return null;
  const { data, error } = await supabaseAdmin.from("crm_conexoes").select(COLUNAS).eq("client_id", clientId).maybeSingle();
  if (error) throw new Error(`Não consegui ler a conexão de CRM: ${error.message}`);
  return (data as LinhaConexao | null) ?? null;
}

/** Os ids dos clientes com CRM ativo (o portal decide a aba; o relatório decide a folha). */
export async function clientesComCrm(ids?: string[]): Promise<Set<string>> {
  if (!(await temTabelasCrm())) return new Set();
  let q = supabaseAdmin.from("crm_conexoes").select("client_id").eq("ativa", true);
  if (ids) q = q.in("client_id", ids);
  const { data, error } = await q;
  if (error) throw new Error(`Não consegui ler as conexões de CRM: ${error.message}`);
  return new Set((data ?? []).map((r) => (r as { client_id: string }).client_id));
}

// ── Token da API aberta ──

export const PREFIXO_TOKEN = "lcrm_";
export const hashDoToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
export function novoToken(): { token: string; hash: string; prefixo: string } {
  const token = `${PREFIXO_TOKEN}${randomBytes(24).toString("base64url")}`;
  return { token, hash: hashDoToken(token), prefixo: token.slice(0, PREFIXO_TOKEN.length + 6) };
}

/** A conexão dona do token (só API aberta). Compara pelo hash: o token nunca é guardado. */
export async function conexaoDoToken(token: string): Promise<{ id: string; client_id: string } | null> {
  if (!token.startsWith(PREFIXO_TOKEN) || token.length < 30 || token.length > 100) return null;
  const { data, error } = await supabaseAdmin.from("crm_conexoes").select("id, client_id, provedor, ativa")
    .eq("token_hash", hashDoToken(token)).maybeSingle();
  if (error) throw new Error(`Não consegui conferir o token: ${error.message}`);
  const c = data as { id: string; client_id: string; provedor: string; ativa: boolean } | null;
  // Pausada CONTINUA recebendo: pausar só tira do relatório. Recusar aqui deixaria buraco para sempre no período.
  return c && c.provedor === "api_aberta" ? { id: c.id, client_id: c.client_id } : null;
}

// ── Leitura ──

/** "2026-11-09" → início do dia em São Paulo; o fim é inclusivo até o último milissegundo. Brasil sem horário de verão desde 2019. */
export const inicioSP = (dia: string) => `${dia}T00:00:00.000-03:00`;
export const fimSP = (dia: string) => `${dia}T23:59:59.999-03:00`;

export type Leitura = { ok: true; metricas: MetricasCrm; avisos: string[]; doCache?: boolean } | { ok: false; motivo: string };

async function lerEventos(conexaoId: string, de: string, ate: string): Promise<Leitura> {
  // Período + 180 dias antes (o ciclo precisa do primeiro lead; o funil, da última etapa). Paginado: o PostgREST
  // devolve no máximo mil linhas por vez, e conta pela metade seria número errado com cara de certo.
  // INTEGRAÇÃO PARADA ≠ SEMANA SEM VENDA: se o CRM de lá não manda nada há mais de 7 dias do fim do período (token
  // trocado, fluxo do n8n desligado), o período é "não sei", nunca "0 leads, 0 vendas".
  const { data: ult, error: eUlt } = await supabaseAdmin.from("crm_eventos").select("recebido_em")
    .eq("conexao_id", conexaoId).order("recebido_em", { ascending: false }).limit(1);
  if (eUlt) return { ok: false, motivo: `Não consegui ler os eventos recebidos: ${eUlt.message}` };
  const ultimo = (ult ?? [])[0] as { recebido_em: string } | undefined;
  if (!ultimo) return { ok: false, motivo: "O CRM ainda não mandou nenhum evento para a API aberta." };
  if (Date.parse(ultimo.recebido_em) < Math.min(Date.parse(ate), Date.now()) - 7 * 86_400_000) {
    return { ok: false, motivo: `O CRM não manda eventos desde ${new Date(ultimo.recebido_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} — confira a integração (token, fluxo, endereço).` };
  }
  // O funil é o de AGORA (como no Âncora e no Kommo): os eventos vão até hoje; as contas do período filtram a janela.
  const desde = new Date(Date.parse(de) - 180 * 86_400_000).toISOString();
  const eventos: EventoCrm[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabaseAdmin.from("crm_eventos")
      .select("tipo, ocorreu_em, negocio_ref, valor_centavos, segundos, etapa")
      .eq("conexao_id", conexaoId).gte("ocorreu_em", desde)
      .order("ocorreu_em").order("id_externo").range(i, i + 999);
    if (error) return { ok: false, motivo: `Não consegui ler os eventos recebidos: ${error.message}` };
    eventos.push(...((data ?? []) as EventoCrm[]));
    if ((data ?? []).length < 1000) break;
    if (eventos.length >= 200_000) return { ok: false, motivo: "Eventos demais para contar inteiro." };
  }
  // Que tipos esta conexão já mandou alguma vez (tipo nunca mandado = "não oferece", não zero).
  const tipos = new Set<TipoEvento>();
  const conferidos = await Promise.all(TIPOS_EVENTO.map(async (t) => {
    const { data, error } = await supabaseAdmin.from("crm_eventos").select("id_externo").eq("conexao_id", conexaoId).eq("tipo", t).limit(1);
    if (!error && (data ?? []).length) tipos.add(t);
    return !error;
  }));
  if (conferidos.includes(false)) return { ok: false, motivo: "Não consegui conferir os tipos de evento recebidos." };
  return { ok: true, metricas: dosEventos(eventos, de, ate, tipos), avisos: [] };
}

/** As métricas de UMA janela (dias em São Paulo, fim inclusivo), no CRM da conexão. */
export async function lerMetricas(c: LinhaConexao, diaDe: string, diaAte: string): Promise<Leitura> {
  try {
    return await lerNoProvedor(c, inicioSP(diaDe), fimSP(diaAte));
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message.slice(0, 300) : "Falha ao ler o CRM." };
  }
}

async function lerNoProvedor(c: LinhaConexao, de: string, ate: string): Promise<Leitura> {
  switch (c.provedor) {
    case "ancora": {
      if (!ancoraLigada()) return { ok: false, motivo: "A integração com o Âncora está desligada neste servidor (ANCORA_PARCEIRO_SECRET)." };
      const r = await lerMetricasNoAncora(c.client_id, de, ate);
      if (!r.ok) return { ok: false, motivo: r.status === 404 ? "O cliente ainda não tem empresa no Âncora (o cadastro pelo link não foi feito)." : r.mensagem };
      return { ok: true, metricas: deAncora(r.data), avisos: [] };
    }
    case "kommo": {
      const host = c.config?.subdominio;
      if (!host) return { ok: false, motivo: "Conexão do Kommo sem subdomínio." };
      let token: string | null = null;
      try { token = decryptVault(c.segredo); } catch { return { ok: false, motivo: "Não consegui abrir o token do Kommo (VAULT_KEY trocada?). Cole o token de novo na ficha." }; }
      if (!token) return { ok: false, motivo: "Conexão do Kommo sem token." };
      const r = await lerKommo({ host, funilId: c.config?.funil_id ?? null, etapaOrcamentoId: c.config?.etapa_orcamento_id ?? null },
        token, Math.floor(Date.parse(de) / 1000), Math.floor(Date.parse(ate) / 1000));
      const tudoFalhou = r.metricas.indisponivel.length > 0 && r.metricas.leads == null && r.metricas.vendas == null && r.metricas.funil == null;
      if (tudoFalhou) return { ok: false, motivo: r.erros[0] ?? "O Kommo não respondeu." };
      return { ok: true, metricas: r.metricas, avisos: r.erros };
    }
    case "api_aberta":
      return lerEventos(c.id, de, ate);
  }
}

const TTL_CACHE_MS = 30 * 60_000;

/** Com cache de 30 min (portal público não bate no CRM a cada visita). `fresco` ignora o cache (relatório). */
async function lerComCache(c: LinhaConexao, de: string, ate: string, fresco: boolean): Promise<Leitura> {
  if (!fresco) {
    const { data } = await supabaseAdmin.from("crm_leituras").select("metricas, lido_em")
      .eq("conexao_id", c.id).eq("de", de).eq("ate", ate).maybeSingle();
    const linha = data as { metricas: MetricasCrm; lido_em: string } | null;
    if (linha && Date.now() - Date.parse(linha.lido_em) < TTL_CACHE_MS) return { ok: true, metricas: linha.metricas, avisos: [], doCache: true };
  }
  const r = await lerMetricas(c, de, ate);
  if (r.ok) {
    await supabaseAdmin.from("crm_leituras").upsert({ conexao_id: c.id, de, ate, metricas: r.metricas, lido_em: new Date().toISOString() },
      { onConflict: "conexao_id,de,ate" });
  }
  return r;
}

export interface BlocoCrmLido {
  relatorio: RelatorioCrm | null;
  /** o que o time precisa saber (nunca vai para o cliente) */
  avisos: string[];
  /** tem CRM ativo, mas o período atual não pôde ser lido */
  indisponivel: boolean;
}

/**
 * O bloco "Atendimento e vendas" do cliente na janela. null = sem CRM ativo (ou tabela ainda não criada).
 * `anterior` ausente = janelaAnterior(janela), a regra do relatório.
 */
export async function lerRelatorioCrm(clientId: string, janela: Janela, o: { anterior?: Janela | null; fresco?: boolean } = {}): Promise<BlocoCrmLido | null> {
  const c = await linhaDaConexao(clientId);
  if (!c || !c.ativa) return null;
  const ant = o.anterior === undefined ? janelaAnterior(janela) : o.anterior;
  // Kommo limita ~7 chamadas/s por conta: as duas janelas vão uma depois da outra. Os outros, juntas.
  const lerAnt = () => (ant ? lerComCache(c, ant.inicio, ant.fim, !!o.fresco) : Promise.resolve(null));
  const [atual, anterior] = c.provedor === "kommo"
    ? [await lerComCache(c, janela.inicio, janela.fim, !!o.fresco), await lerAnt()]
    : await Promise.all([lerComCache(c, janela.inicio, janela.fim, !!o.fresco), lerAnt()]);
  const nome = c.provedor === "ancora" ? "Âncora" : c.provedor === "kommo" ? "Kommo" : "CRM (API aberta)";
  // A ficha mostra a última leitura de verdade e a última falha (o portal com cache não conta como leitura).
  if (!(atual.ok && atual.doCache)) {
    // Leitura parcial (o Kommo leu os negócios mas não o orçamento) também fica na ficha: não é "tudo certo".
    const parcial = atual.ok ? (atual.avisos[0] ?? (atual.metricas.indisponivel.length ? `Sem ${atual.metricas.indisponivel.join(", ")}.` : null)) : null;
    await supabaseAdmin.from("crm_conexoes").update(atual.ok
      ? { ultima_leitura_em: new Date().toISOString(), ultimo_erro: parcial?.slice(0, 300) ?? null }
      : { ultimo_erro: atual.motivo.slice(0, 300) }).eq("id", c.id);
  }

  if (!atual.ok) return { relatorio: null, avisos: [`${nome} fora do relatório: ${atual.motivo}`], indisponivel: true };
  const r = montarRelatorioCrm({ provedor: c.provedor, janela, anterior: ant, atual: atual.metricas, doAnterior: anterior?.ok ? anterior.metricas : null });
  const avisos = [...atual.avisos.map((a) => `${nome}: ${a}`)];
  if (r.faltando.length) avisos.push(`${nome}: sem ${r.faltando.join(", ")} neste relatório (o CRM não respondeu essa parte).`);
  if (ant && anterior && !anterior.ok) avisos.push(`${nome}: sem comparação com o período anterior (${anterior.motivo}).`);
  return { relatorio: r, avisos, indisponivel: false };
}

// ── Âncora: a conexão nasce sozinha ──

/**
 * Cliente que se cadastrou no Âncora pelo link do Lone OS ganha a conexão sem ninguém precisar clicar — inclusive
 * quem se cadastrou depois. Não mexe em cliente que já tem outro CRM, nem em conexão pausada.
 * Roda antes do relatório (semanal e mensal) e quando a ficha abre a aba Integrações.
 */
export async function detectarAncora(clientIds?: string[]): Promise<{ criadas: number; erro: string | null }> {
  try {
    return await detectar(clientIds);
  } catch (e) {
    return { criadas: 0, erro: e instanceof Error ? e.message : "Falha na detecção do Âncora." };
  }
}

async function detectar(clientIds?: string[]): Promise<{ criadas: number; erro: string | null }> {
  if (!ancoraLigada() || !(await temTabelasCrm())) return { criadas: 0, erro: null };
  let ids = clientIds;
  if (!ids) {
    const { data, error } = await supabaseAdmin.from("clients").select("id").eq("active", true).limit(1000);
    if (error) return { criadas: 0, erro: `Não consegui ler os clientes: ${error.message}` };
    ids = (data ?? []).map((r) => (r as { id: string }).id);
  }
  if (!ids.length) return { criadas: 0, erro: null };
  const [estados, ja] = await Promise.all([lerEstadosNoAncora(ids), clientesComConexao(ids)]);
  if (!estados.ok) return { criadas: 0, erro: `Âncora: ${estados.mensagem}` };
  if (ja === null) return { criadas: 0, erro: "Não consegui ler as conexões de CRM." };
  const pedidos = new Set(ids);
  // Só ids que perguntamos: uma referência estranha vinda de lá derrubaria o lote inteiro na chave estrangeira.
  const novas = estados.data.filter((e) => e.estado === "cadastrou" && pedidos.has(e.ref_externa) && !ja.has(e.ref_externa)).map((e) => ({
    client_id: e.ref_externa, provedor: "ancora", ativa: true, origem: "automatica", criado_por: "detecção automática",
  }));
  if (!novas.length) return { criadas: 0, erro: null };
  // ignoreDuplicates: se alguém conectou outro CRM no meio do caminho, o dele vale.
  const { error } = await supabaseAdmin.from("crm_conexoes").upsert(novas, { onConflict: "client_id", ignoreDuplicates: true });
  return error ? { criadas: 0, erro: `Não consegui gravar a conexão do Âncora: ${error.message}` } : { criadas: novas.length, erro: null };
}

async function clientesComConexao(ids: string[]): Promise<Set<string> | null> {
  const out = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabaseAdmin.from("crm_conexoes").select("client_id").in("client_id", ids.slice(i, i + 200));
    if (error) return null;
    for (const r of data ?? []) out.add((r as { client_id: string }).client_id);
  }
  return out;
}

/** Para a prévia na ficha: os últimos `dias` dias até ontem. */
export function janelaDaPrevia(hoje: string, dias = 30): { inicio: string; fim: string } {
  const fim = somarDias(hoje, -1);
  return { inicio: somarDias(fim, -(dias - 1)), fim };
}
