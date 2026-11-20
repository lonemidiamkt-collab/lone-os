// lib/google/carteira.ts — regras PURAS das telas Tráfego › Google Ads e Tráfego › Google Meu Negócio (19/11/2026).
//
// Uma linha por cliente, como Contas & Verba faz com a Meta: o gestor bate o olho e sabe quem precisa dele hoje.
// Tudo aqui é cálculo sobre o que a rotina google-sync já gravou no banco (nunca o Google ao vivo). Testado em
// tests/google-carteira.test.ts.
//
// Pesquisa que guiou os sinais (nov/2026):
//   · Google Ads: o Google pode gastar até 2× o orçamento do dia, mas no mês o teto é 30,4× — o ritmo se mede no mês.
//     Parcela PERDIDA por orçamento alta com custo por contato bom = argumento para pedir mais verba ao cliente;
//     perdida por classificação alta = lance, Índice de Qualidade ou anúncio. Campanha ativa sem impressão = travada.
//   · Perfil da Empresa (BrightLocal 2026): 89% esperam resposta do dono; 68% só vão a negócio com nota 4+ (31% pedem
//     4,5+); 47% evitam negócio com menos de 20 avaliações; 74% olham só as dos últimos 3 meses. Meta da agência:
//     100% respondidas, em até 48 h. A Q&A do Google acabou (03/11/2025) e não entra aqui.

import { ritmoDoMes, lerRitmo, foraDoRitmo, type RitmoMes, type LeituraRitmo } from "@/lib/trafego/contas-verba";
import { somarDias } from "@/lib/reports/relatorioCliente";

export type Gravidade = "critico" | "atencao" | "info";
export interface Sinal { gravidade: Gravidade; titulo: string; detalhe?: string }

const ordemGravidade: Record<Gravidade, number> = { critico: 0, atencao: 1, info: 2 };
export const pior = (s: readonly Sinal[]): Gravidade | null =>
  s.length ? [...s].sort((a, b) => ordemGravidade[a.gravidade] - ordemGravidade[b.gravidade])[0].gravidade : null;

const brl0 = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (v: number) => `${Math.round(v * 100)}%`;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Variação % (null quando não há base para comparar). */
export function variacao(atual: number, anterior: number | null | undefined): number | null {
  if (anterior == null || anterior <= 0) return null;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

// ── Google Ads ───────────────────────────────────────────────────────────────────────────────────────

export interface DiaAds { dia: string; custo: number; cliques: number; impressoes: number; conversoes: number; ligacoes: number | null }

export interface EstadoCampanha {
  campaign_id: string;
  campanha: string | null;
  canal: string | null;
  status: string | null;
  status_principal: string | null;
  motivos_status: string[] | null;
  orcamento_diario: number | null;
  impressoes_7d: number | null;
  custo_7d: number | null;
  parcela_impressoes: number | null;
  perdida_orcamento: number | null;
  perdida_classificacao: number | null;
}

export interface Totais { custo: number; cliques: number; impressoes: number; conversoes: number; ligacoes: number | null }

export function somar(dias: readonly DiaAds[]): Totais {
  let custo = 0, cliques = 0, impressoes = 0, conversoes = 0, ligacoes: number | null = null;
  for (const d of dias) {
    custo += d.custo; cliques += d.cliques; impressoes += d.impressoes; conversoes += d.conversoes;
    if (d.ligacoes != null) ligacoes = (ligacoes ?? 0) + d.ligacoes;
  }
  return { custo: r2(custo), cliques, impressoes, conversoes: r2(conversoes), ligacoes };
}

export interface EntradaLinhaAds {
  hoje: string;                         // "YYYY-MM-DD" (São Paulo)
  verba: number | null;                 // verba mensal do Google (clients.google_ads_verba_mensal)
  dias: readonly DiaAds[];              // campanha somada por dia, dos últimos ~60 dias (até ontem)
  estados: readonly EstadoCampanha[];
  sincronizadoEm: string | null;
  erro: string | null;
  agora: number;                        // Date.now()
}

export interface LinhaAds {
  ritmo: RitmoMes;
  leitura: LeituraRitmo;
  mes: Totais;
  semana: Totais;                       // últimos 7 dias até ontem
  semanaAnterior: Totais;
  custoPorConversao7d: number | null;
  custoPorConversao30d: number | null;
  ctr7d: number | null;
  /** Média ponderada pelas impressões das campanhas de Pesquisa (null sem campanha de Pesquisa com número). */
  perdidaOrcamento: number | null;
  perdidaClassificacao: number | null;
  orcamentoDiarioAtivo: number | null;  // soma dos orçamentos das campanhas ativas
  ativas: number;
  sinais: Sinal[];
}

/** Média de `campo` ponderada pelas impressões de 7 dias — só campanhas que o Google informa. */
function ponderada(estados: readonly EstadoCampanha[], campo: "perdida_orcamento" | "perdida_classificacao"): number | null {
  let soma = 0, peso = 0;
  for (const e of estados) {
    const v = e[campo];
    if (v == null || e.status !== "ENABLED") continue;
    const p = Math.max(1, e.impressoes_7d ?? 0);
    soma += v * p; peso += p;
  }
  return peso ? Math.round((soma / peso) * 10_000) / 10_000 : null;
}

/** Leitura vale até "ontem" — mais de 36 h sem leitura boa é atraso. */
export function leituraAtrasada(sincronizadoEm: string | null, agora: number): boolean {
  if (!sincronizadoEm) return true;
  return agora - Date.parse(sincronizadoEm) > 36 * 3_600_000;
}

export function montarLinhaAds(e: EntradaLinhaAds): LinhaAds {
  const ontem = somarDias(e.hoje, -1);
  const iniMes = `${e.hoje.slice(0, 8)}01`;
  const naJanela = (de: string, ate: string) => e.dias.filter((d) => d.dia >= de && d.dia <= ate);

  const mes = somar(naJanela(iniMes, ontem));
  const semana = somar(naJanela(somarDias(ontem, -6), ontem));
  const semanaAnterior = somar(naJanela(somarDias(ontem, -13), somarDias(ontem, -7)));
  const trinta = somar(naJanela(somarDias(ontem, -29), ontem));
  const tres = somar(naJanela(somarDias(ontem, -2), ontem));

  const semDado = !e.sincronizadoEm;
  // O Google é lido até ONTEM: o ritmo se mede no dia de ontem (senão todo mundo aparece "abaixo" por um dia a menos).
  // No dia 1º, ontem é o mês passado — aí vale hoje, com gasto zero (que não é "travada" antes do dia 3).
  const refRitmo = e.hoje.slice(8) === "01" ? e.hoje : ontem;
  const ritmo = ritmoDoMes({ verba: e.verba, gasto: semDado ? null : mes.custo, hoje: refRitmo });
  const leitura = lerRitmo(ritmo, semDado ? null : tres.custo / 3);

  const cpa7 = semana.conversoes > 0 ? r2(semana.custo / semana.conversoes) : null;
  const cpa30 = trinta.conversoes > 0 ? r2(trinta.custo / trinta.conversoes) : null;
  const ativasLista = e.estados.filter((x) => x.status === "ENABLED");
  const perdidaOrcamento = ponderada(e.estados, "perdida_orcamento");
  const perdidaClassificacao = ponderada(e.estados, "perdida_classificacao");
  const orcamentos = ativasLista.map((x) => x.orcamento_diario).filter((x): x is number => x != null);

  const sinais: Sinal[] = [];
  if (e.erro && !e.erro.startsWith("Parcial")) sinais.push({ gravidade: "critico", titulo: "Leitura do Google falhou", detalhe: e.erro });
  else if (leituraAtrasada(e.sincronizadoEm, e.agora)) sinais.push({ gravidade: "atencao", titulo: "Leitura atrasada", detalhe: e.sincronizadoEm ? "A última leitura boa tem mais de 36 h." : "A conta ainda não foi lida." });

  const reprovadas = ativasLista.filter((x) => (x.motivos_status ?? []).some((m) => /DISAPPROVED/.test(m)));
  if (reprovadas.length) sinais.push({ gravidade: "critico", titulo: "Anúncio reprovado", detalhe: reprovadas.map((x) => x.campanha ?? x.campaign_id).join(", ") });

  const travadas = ativasLista.filter((x) => x.impressoes_7d === 0);
  if (travadas.length) sinais.push({ gravidade: "critico", titulo: travadas.length === 1 ? "Campanha ativa sem impressão" : `${travadas.length} campanhas ativas sem impressão`, detalhe: `7 dias sem aparecer: ${travadas.map((x) => x.campanha ?? x.campaign_id).join(", ")}` });
  else if (!ativasLista.length && e.estados.length) sinais.push({ gravidade: "atencao", titulo: "Todas as campanhas pausadas" });

  if (leitura.tom === "travada" || leitura.tom === "acima") sinais.push({ gravidade: leitura.tom === "travada" ? "critico" : "atencao", titulo: leitura.titulo, detalhe: leitura.detalhe ?? undefined });
  else if (leitura.tom === "abaixo") sinais.push({ gravidade: "info", titulo: "Abaixo do ritmo", detalhe: leitura.detalhe ?? undefined });
  if (leitura.tom === "sem_verba" && !semDado) sinais.push({ gravidade: "info", titulo: "Defina a verba do mês", detalhe: "Sem verba não dá para medir o ritmo." });

  if (semana.custo >= 30 && semana.conversoes === 0) sinais.push({ gravidade: "atencao", titulo: "Sem conversão em 7 dias", detalhe: `${brl0(semana.custo)} gastos na semana sem ligação, rota ou contato registrado.` });
  else if (cpa7 != null && cpa30 != null && semana.conversoes >= 2 && cpa7 > cpa30 * 1.5) {
    sinais.push({ gravidade: "atencao", titulo: "Custo por conversão subiu", detalhe: `${brl0(cpa7)} na semana contra ${brl0(cpa30)} nos 30 dias.` });
  }
  if (perdidaOrcamento != null && perdidaOrcamento >= 0.3) {
    sinais.push({
      gravidade: "info",
      titulo: `Perdendo ${pct(perdidaOrcamento)} das buscas por verba`,
      detalhe: cpa30 != null && (cpa7 == null || cpa7 <= cpa30 * 1.2)
        ? "O custo por conversão está bom: dá argumento para pedir mais verba ao cliente."
        : "Antes de pedir verba, melhore o custo por conversão.",
    });
  }
  if (perdidaClassificacao != null && perdidaClassificacao >= 0.5) sinais.push({ gravidade: "info", titulo: `Perdendo ${pct(perdidaClassificacao)} das buscas por classificação`, detalhe: "Revise lance, Índice de Qualidade e anúncio." });

  return {
    ritmo, leitura, mes, semana, semanaAnterior,
    custoPorConversao7d: cpa7, custoPorConversao30d: cpa30,
    ctr7d: semana.impressoes > 0 ? Math.round((semana.cliques / semana.impressoes) * 10_000) / 100 : null,
    perdidaOrcamento, perdidaClassificacao,
    orcamentoDiarioAtivo: orcamentos.length ? r2(orcamentos.reduce((a, b) => a + b, 0)) : null,
    ativas: ativasLista.length,
    sinais: sinais.sort((a, b) => ordemGravidade[a.gravidade] - ordemGravidade[b.gravidade]),
  };
}

export { foraDoRitmo };

// ── Perfil da Empresa (Google Meu Negócio) ───────────────────────────────────────────────────────────

export interface DiaPerfil {
  dia: string;
  impressoes_busca_celular: number; impressoes_busca_computador: number;
  impressoes_mapas_celular: number; impressoes_mapas_computador: number;
  ligacoes: number; rotas: number; cliques_site: number; conversas: number; reservas: number;
}

export interface Avaliacao {
  review_id: string; nota: number | null; comentario: string | null; autor: string | null;
  criada_em: string | null; resposta: string | null; respondida_em: string | null;
}

export interface TotaisPerfil { ligacoes: number; rotas: number; site: number; conversas: number; busca: number; mapas: number; contatos: number }

export function somarPerfil(dias: readonly DiaPerfil[]): TotaisPerfil {
  const t: TotaisPerfil = { ligacoes: 0, rotas: 0, site: 0, conversas: 0, busca: 0, mapas: 0, contatos: 0 };
  for (const d of dias) {
    t.ligacoes += d.ligacoes; t.rotas += d.rotas; t.site += d.cliques_site; t.conversas += d.conversas;
    t.busca += d.impressoes_busca_celular + d.impressoes_busca_computador;
    t.mapas += d.impressoes_mapas_celular + d.impressoes_mapas_computador;
  }
  t.contatos = t.ligacoes + t.rotas + t.site + t.conversas;
  return t;
}

export interface EntradaLinhaPerfil {
  hoje: string;
  agora: number;
  dias: readonly DiaPerfil[];          // gravados até o último dia entregue
  ultimoDia: string | null;            // google_sincronia.perfil_ultimo_dia
  sincronizadoEm: string | null;
  erro: string | null;
  nota: number | null;
  total: number | null;
  avaliacoes: readonly Avaliacao[];    // as mais recentes (até 100)
  avaliacoesLidas: boolean;            // false = a migração ou a leitura das avaliações ainda não rodou
  erroAvaliacoes: string | null;
}

export interface LinhaPerfil {
  /** Janela de 28 dias que termina no último dia entregue (o Google atrasa 2–5 dias). */
  janela: { de: string; ate: string } | null;
  atual: TotaisPerfil;
  anterior: TotaisPerfil;
  variacaoContatos: number | null;
  semResposta: Avaliacao[];            // da mais antiga para a mais nova (fila)
  negativasSemResposta: number;        // nota ≤ 3
  novasNoMes: number;
  ultimaAvaliacaoDias: number | null;
  taxaResposta90d: number | null;      // 0–1, das avaliações dos últimos 90 dias
  sinais: Sinal[];
}

const diasDesde = (iso: string | null, agora: number) => (iso ? Math.floor((agora - Date.parse(iso)) / 86_400_000) : null);

export function montarLinhaPerfil(e: EntradaLinhaPerfil): LinhaPerfil {
  const sinais: Sinal[] = [];
  const ate = e.ultimoDia;
  const janela = ate ? { de: somarDias(ate, -27), ate } : null;
  const em = (de: string, a: string) => e.dias.filter((d) => d.dia >= de && d.dia <= a);
  const atual = janela ? somarPerfil(em(janela.de, janela.ate)) : somarPerfil([]);
  const anterior = janela ? somarPerfil(em(somarDias(janela.de, -28), somarDias(janela.de, -1))) : somarPerfil([]);
  const variacaoContatos = janela ? variacao(atual.contatos, anterior.contatos) : null;

  if (e.erro && !e.erro.startsWith("Parcial")) sinais.push({ gravidade: "critico", titulo: "Leitura do perfil falhou", detalhe: e.erro });
  else if (!e.sincronizadoEm) sinais.push({ gravidade: "atencao", titulo: "Perfil ainda não lido" });
  else if (ate && diasDesde(`${ate}T12:00:00Z`, e.agora)! > 8) sinais.push({ gravidade: "atencao", titulo: "Google sem números novos", detalhe: `Último dia entregue: ${ate.split("-").reverse().join("/")}. Perfil suspenso ou sem verificação?` });

  if (variacaoContatos != null && variacaoContatos <= -30 && anterior.contatos >= 10) {
    sinais.push({ gravidade: "atencao", titulo: `Contatos caíram ${Math.abs(Math.round(variacaoContatos))}%`, detalhe: "Ligações, rotas, site e conversas nos últimos 28 dias contra os 28 anteriores." });
  }

  const ordenadas = [...e.avaliacoes].sort((a, b) => (a.criada_em ?? "").localeCompare(b.criada_em ?? ""));
  const semResposta = ordenadas.filter((a) => !a.resposta);
  const negativasSemResposta = semResposta.filter((a) => a.nota != null && a.nota <= 3).length;
  const iniMes = `${e.hoje.slice(0, 8)}01`;
  const novasNoMes = e.avaliacoes.filter((a) => (a.criada_em ?? "").slice(0, 10) >= iniMes).length;
  const maisNova = ordenadas.length ? ordenadas[ordenadas.length - 1].criada_em : null;
  const ultimaAvaliacaoDias = diasDesde(maisNova, e.agora);
  const recentes = e.avaliacoes.filter((a) => { const d = diasDesde(a.criada_em, e.agora); return d != null && d <= 90; });
  const taxaResposta90d = recentes.length ? Math.round((recentes.filter((a) => !!a.resposta).length / recentes.length) * 100) / 100 : null;

  if (e.erroAvaliacoes) sinais.push({ gravidade: "atencao", titulo: "Avaliações não lidas", detalhe: e.erroAvaliacoes });
  if (e.avaliacoesLidas) {
    if (negativasSemResposta) sinais.push({ gravidade: "critico", titulo: negativasSemResposta === 1 ? "Avaliação negativa sem resposta" : `${negativasSemResposta} avaliações negativas sem resposta`, detalhe: "Nota 3 ou menos — responda primeiro." });
    const atrasadas = semResposta.filter((a) => (diasDesde(a.criada_em, e.agora) ?? 0) >= 2).length;
    if (atrasadas > negativasSemResposta) sinais.push({ gravidade: "atencao", titulo: `${atrasadas} sem resposta há mais de 48 h`, detalhe: "Meta: 100% respondidas em até 48 h." });
    if (e.nota != null && e.nota < 4.5) sinais.push({ gravidade: e.nota < 4 ? "atencao" : "info", titulo: `Nota ${e.nota.toFixed(1).replace(".", ",")}`, detalhe: e.nota < 4 ? "68% das pessoas só vão a negócio com nota 4 ou mais." : "Abaixo de 4,5 — peça avaliação aos clientes satisfeitos." });
    if (e.total != null && e.total < 20) sinais.push({ gravidade: "info", titulo: `Só ${e.total} avaliações`, detalhe: "Quase metade das pessoas evita negócio com menos de 20." });
    if (ultimaAvaliacaoDias != null && ultimaAvaliacaoDias > 60) sinais.push({ gravidade: "info", titulo: `Sem avaliação nova há ${ultimaAvaliacaoDias} dias`, detalhe: "74% olham só as avaliações dos últimos 3 meses." });
  }

  return {
    janela, atual, anterior, variacaoContatos,
    semResposta, negativasSemResposta, novasNoMes, ultimaAvaliacaoDias, taxaResposta90d,
    sinais: sinais.sort((a, b) => ordemGravidade[a.gravidade] - ordemGravidade[b.gravidade]),
  };
}
