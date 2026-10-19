// lib/diagnostico-mensal/analise.ts — o DIAGNÓSTICO MENSAL de um cliente, sem banco e sem fetch.
//
// Roberto (19/10/2026): "todo mês tem que ter diagnóstico de todos os clientes — bateu o dia 31, o
// diagnóstico do dia 1º ao 31, de crescimento de tudo", no modelo do Império dos Pisos
// (anúncios + Instagram + conteúdo + plano de ação).
//
// REGRA DA CASA: toda frase do PDF sai de um número que está aqui. Sem dado, a dimensão fica "não
// avaliada" e NÃO entra na nota — o modelo do Império faz o mesmo ("Atendimento fica sem nota até
// medirmos"). Nota inventada é pior que nota ausente.
//
// A coleta (dados.ts) monta DadosCliente; o PDF (pdf.ts) só desenha o que `analisar` devolve.

export interface Dia { data: string; invest: number; impressoes: number; cliques: number; resultados: number }

export interface Entidade {
  id: string;
  nome: string;
  campanha: string | null;
  invest: number;
  impressoes: number;
  cliques: number;
  resultados: number;
  /** Média da frequência ponderada pelas impressões. null quando a Meta não devolveu. */
  frequencia: number | null;
  /** Últimos 7 dias do período vs. o resto — é o que separa "sempre foi ruim" de "cansou agora". */
  recente: { invest: number; resultados: number };
  antigo: { invest: number; resultados: number };
  ativo: boolean;
}

export interface PostIg { tipo: string; alcance: number | null; engajamento: number; data: string | null; permalink: string | null }

export interface DadosCliente {
  nome: string;
  /** "tráfego + social" | "só tráfego" | "só social" — vem do contrato, não da conta. */
  servico: string;
  /** O cliente tem conta de anúncios vinculada? Sem ela, "zero investimento" não é achado, é cadastro. */
  comConta: boolean;
  periodo: { de: string; ate: string };
  anterior: { de: string; ate: string };
  /** Dias dos DOIS períodos (anterior + atual), ordem livre. */
  dias: Dia[];
  /** "conversas" | "leads" | "compras" — o que a conta chama de resultado. */
  rotulo: string;
  anuncios: Entidade[];
  campanhas: Entidade[];
  /** Meta de custo por resultado (client_traffic_policy). null quando não há. */
  metaCpl: number | null;
  ig: {
    usuario: string | null;
    seguidores: number | null;
    alcance: number | null;
    alcanceJanelaDias: number | null;
    seguidoresGanhos: number | null;
    engajamento: number;
    postsNoPeriodo: number;
    postsNoAnterior: number | null;
    posts: PostIg[];
    /** Só seguidores e posts (business_discovery): sem alcance, sem seguidores ganhos. */
    parcial: boolean;
  } | null;
}

export interface Totais { invest: number; resultados: number; impressoes: number; cliques: number; cpl: number | null; cpm: number | null; ctr: number | null }

export type Gravidade = "alta" | "media" | "info";
export interface Achado {
  area: "anuncios" | "instagram" | "conta";
  gravidade: Gravidade;
  titulo: string;
  evidencia: string;
  porque: string;
  acao: string;
}

export interface Dimensao { nome: string; peso: number; nota: number | null; motivo: string }

export interface Semana { rotulo: string; invest: number; resultados: number; cpl: number | null }

export interface Analise {
  atual: Totais;
  anterior: Totais;
  semanas: Semana[];
  achados: Achado[];
  campeoes: Entidade[];
  piores: Entidade[];
  dimensoes: Dimensao[];
  nota: number | null;
  veredito: string;
  plano: { seteDias: string[]; trintaDias: string[]; noventaDias: string[] };
  conteudo: string[];
}

const arred = (n: number, casas = 2) => Math.round(n * 10 ** casas) / 10 ** casas;
export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const dec = (n: number, casas = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
export const inteiro = (n: number) => Math.round(n).toLocaleString("pt-BR");
export const dm = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

export function somar(dias: Dia[], de: string, ate: string): Totais {
  const f = dias.filter((d) => d.data >= de && d.data <= ate);
  const invest = f.reduce((s, d) => s + d.invest, 0);
  const resultados = f.reduce((s, d) => s + d.resultados, 0);
  const impressoes = f.reduce((s, d) => s + d.impressoes, 0);
  const cliques = f.reduce((s, d) => s + d.cliques, 0);
  return {
    invest: arred(invest), resultados, impressoes, cliques,
    cpl: resultados > 0 ? arred(invest / resultados) : null,
    cpm: impressoes > 0 ? arred((invest / impressoes) * 1000) : null,
    ctr: impressoes > 0 ? arred((cliques / impressoes) * 100) : null,
  };
}

/** Variação percentual; null quando não há base para comparar (base zero não é "+∞%"). */
export function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual == null || anterior == null || anterior === 0) return null;
  return arred(((atual - anterior) / anterior) * 100, 1);
}

const somarDia = (iso: string, n: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);

/** Semanas de 7 dias a partir do início; as sobras de fim de mês entram na última semana. */
export function semanal(dias: Dia[], de: string, ate: string): Semana[] {
  const inicios: string[] = [];
  for (let d = de; d <= ate; d = somarDia(d, 7)) inicios.push(d);
  if (inicios.length > 1 && somarDia(inicios[inicios.length - 1], 0) > somarDia(ate, -3)) inicios.pop();
  return inicios.map((ini, i) => {
    const fim = i === inicios.length - 1 ? ate : somarDia(ini, 6);
    const t = somar(dias, ini, fim);
    return { rotulo: dm(ini), invest: t.invest, resultados: t.resultados, cpl: t.cpl };
  });
}

const cplDe = (e: { invest: number; resultados: number }) => (e.resultados > 0 ? e.invest / e.resultados : null);
const mediana = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Pisos para não gastar atenção à toa — os mesmos do diagnóstico diário (lib/traffic/diagnostico.ts). */
const PISO_DESPERDICIO = 40;
const PISO_FADIGA_GASTO = 30;
const FADIGA_FREQ = 3;
const MIN_RESULTADOS_RANKING = 5;
/** Playbook Social: segunda, quarta e sexta ≈ 13 posts em 30 dias. */
export const POSTS_ESPERADOS_MES = 13;

/** "Anúncio X — Cópia" é o mesmo criativo duplicado para outro conjunto: o gestor lê um só. */
const nomeBase = (n: string) => n.replace(/\s*[—–-]\s*(c[oó]pia|copy)(\s*\d+)?\s*$/i, "").trim() || n;
export function consolidar(lista: Entidade[]): Entidade[] {
  const por = new Map<string, Entidade[]>();
  for (const e of lista) por.set(nomeBase(e.nome), [...(por.get(nomeBase(e.nome)) ?? []), e]);
  return [...por.entries()].map(([nome, es]) => {
    const imp = es.reduce((s, e) => s + e.impressoes, 0);
    const freq = es.reduce((s, e) => s + (e.frequencia ?? 0) * e.impressoes, 0);
    const maior = [...es].sort((a, b) => b.invest - a.invest)[0];
    const soma = (f: (e: Entidade) => number) => es.reduce((s, e) => s + f(e), 0);
    return {
      id: maior.id, nome, campanha: es.length > 1 ? `${es.length} versões` : maior.campanha,
      invest: soma((e) => e.invest), impressoes: imp, cliques: soma((e) => e.cliques), resultados: soma((e) => e.resultados),
      frequencia: imp > 0 && freq > 0 ? freq / imp : null,
      recente: { invest: soma((e) => e.recente.invest), resultados: soma((e) => e.recente.resultados) },
      antigo: { invest: soma((e) => e.antigo.invest), resultados: soma((e) => e.antigo.resultados) },
      ativo: es.some((e) => e.ativo),
    };
  });
}

const nomeDe = (e: Entidade) => (e.nome.length > 52 ? `${e.nome.slice(0, 50)}…` : e.nome);

export function analisar(d: DadosCliente): Analise {
  const atual = somar(d.dias, d.periodo.de, d.periodo.ate);
  const anterior = somar(d.dias, d.anterior.de, d.anterior.ate);
  const semanas = semanal(d.dias, d.periodo.de, d.periodo.ate);
  const achados: Achado[] = [];
  const R = d.rotulo;
  const temAnuncio = atual.invest > 0;
  const anuncios = consolidar(d.anuncios);

  // ── Referência de custo: a meta cadastrada; sem ela, a mediana dos anúncios do próprio cliente ──
  const cplsAnuncios = anuncios.filter((a) => a.resultados >= MIN_RESULTADOS_RANKING).map((a) => cplDe(a)!).filter((x) => x > 0);
  const referencia = d.metaCpl ?? mediana(cplsAnuncios) ?? atual.cpl;

  // ── 0. Contrato com tráfego e nada rodando ───────────────────────────────────
  if (!d.comConta) {
    achados.push({
      area: "conta", gravidade: "media",
      titulo: "Sem conta de anúncios vinculada",
      evidencia: "O contrato inclui tráfego, mas não há conta de anúncios da Meta vinculada ao cliente no sistema.",
      porque: "Sem a conta, o sistema não mede nem alerta nada de anúncio deste cliente.",
      acao: "Vincular a conta de anúncios no cadastro ou confirmar com o cliente se o tráfego está de fato em andamento.",
    });
  } else if (atual.invest === 0 && anterior.invest > 0) {
    achados.push({
      area: "conta", gravidade: "alta",
      titulo: "Nenhum anúncio rodou no período",
      evidencia: `Investiu ${brl(anterior.invest)} no período anterior e ${brl(0)} neste.`,
      porque: "Sem anúncio no ar não entra pessoa nova; o resultado do mês anterior não se repete sozinho.",
      acao: "Conferir saldo, forma de pagamento, restrição da conta e se as campanhas foram pausadas de propósito.",
    });
  } else if (atual.invest === 0 && anterior.invest === 0) {
    achados.push({
      area: "conta", gravidade: "media",
      titulo: "Contrato com tráfego e nenhum anúncio nos últimos dois períodos",
      evidencia: "A conta de anúncios está vinculada, mas não houve gasto neste período nem no anterior.",
      porque: "O cliente paga por tráfego e nada está rodando.",
      acao: "Confirmar com o gestor se o cliente está em pausa de verba, aguardando criativo ou com a conta bloqueada.",
    });
  }

  // ── 1. Conta parou de entregar nos últimos 3 dias ────────────────────────────
  const ultimos3 = somar(d.dias, somarDia(d.periodo.ate, -2), d.periodo.ate);
  const antes3 = somar(d.dias, d.periodo.de, somarDia(d.periodo.ate, -3));
  const diasAntes = Math.max(1, (new Date(`${somarDia(d.periodo.ate, -3)}T12:00:00Z`).getTime() - new Date(`${d.periodo.de}T12:00:00Z`).getTime()) / 864e5 + 1);
  if (antes3.invest / diasAntes >= 10 && ultimos3.invest === 0) {
    achados.push({
      area: "conta", gravidade: "alta",
      titulo: "Conta parou de gastar",
      evidencia: `Nenhum gasto nos últimos 3 dias; antes vinha gastando ${brl(antes3.invest / diasAntes)} por dia.`,
      porque: "Cada dia parado é dia sem pessoa nova chegando — e o público esfria.",
      acao: "Conferir saldo, forma de pagamento, restrição da conta e se a campanha foi pausada.",
    });
  }

  // ── 2. Tendência: a última semana contra o resto do mês ──────────────────────
  if (semanas.length >= 3) {
    const ult = semanas[semanas.length - 1];
    const resto = semanas.slice(0, -1);
    const restoRes = resto.reduce((s, x) => s + x.resultados, 0);
    const restoInv = resto.reduce((s, x) => s + x.invest, 0);
    const mediaRes = restoRes / resto.length;
    const cplResto = restoRes > 0 ? restoInv / restoRes : null;
    if (mediaRes >= 8 && ult.resultados <= mediaRes * 0.7 && ult.invest > 0) {
      const subiu = ult.cpl != null && cplResto != null && ult.cpl > cplResto * 1.15;
      achados.push({
        area: "anuncios", gravidade: "alta",
        titulo: `A última semana esfriou`,
        evidencia: `${inteiro(ult.resultados)} ${R} na semana de ${ult.rotulo}, contra média de ${inteiro(mediaRes)} nas semanas anteriores${subiu ? `; o custo foi de ${brl(cplResto!)} para ${brl(ult.cpl!)}` : ""}.`,
        porque: "Queda de volume com verba parecida costuma ser criativo cansado ou público saturado, não falta de demanda.",
        acao: "Trocar os criativos que mais gastaram por variações novas e conferir a frequência por conjunto.",
      });
    }
  }

  // ── 3. Desperdício: gastou e não trouxe nada ─────────────────────────────────
  const limiteDesp = Math.max(PISO_DESPERDICIO, referencia ? referencia * 3 : 0);
  const queimando = anuncios.filter((a) => a.resultados === 0 && a.invest >= limiteDesp).sort((a, b) => b.invest - a.invest);
  if (queimando.length) {
    const total = queimando.reduce((s, a) => s + a.invest, 0);
    achados.push({
      area: "anuncios", gravidade: total >= atual.invest * 0.1 ? "alta" : "media",
      titulo: queimando.length > 1 ? `${queimando.length} anúncios gastaram e não trouxeram ${R}` : `1 anúncio gastou e não trouxe ${R}`,
      evidencia: `${brl(total)} no mês sem nenhum resultado. Maiores: ${queimando.slice(0, 3).map((a) => `“${nomeDe(a)}” (${brl(a.invest)})`).join(", ")}.`,
      porque: "É verba que poderia estar nos anúncios que convertem.",
      acao: "Pausar os que seguem ativos e redistribuir para o campeão do mês.",
    });
  }

  // ── 3b. Gastou bastante e trouxe pouco: custo várias vezes acima da referência ──
  const carissimos = referencia
    ? anuncios.filter((a) => a.resultados > 0 && a.invest >= Math.max(60, atual.invest * 0.01) && a.invest / a.resultados >= referencia * 4).sort((a, b) => b.invest - a.invest)
    : [];
  if (carissimos.length) {
    const total = carissimos.reduce((s, a) => s + a.invest, 0);
    const a0 = carissimos[0];
    achados.push({
      area: "anuncios", gravidade: total >= atual.invest * 0.1 ? "alta" : "media",
      titulo: `${carissimos.length} anúncio${carissimos.length > 1 ? "s" : ""} com custo muito acima do normal`,
      evidencia: `${brl(total)} no mês. “${nomeDe(a0)}”: ${brl(a0.invest)} para ${inteiro(a0.resultados)} ${R} (${brl(a0.invest / a0.resultados)} cada, referência da conta ${brl(referencia!)}).`,
      porque: "Custa mais de 4 vezes o que a conta paga normalmente por resultado.",
      acao: "Pausar ou trocar o criativo e conferir se não é publicação turbinada pelo botão do Instagram, que quase nunca vira conversa.",
    });
  }

  // ── 4. Criativo cansando: frequência alta E custo piorando dentro do mês ─────
  const cansando = anuncios.filter((a) => {
    if (!a.ativo || a.invest < PISO_FADIGA_GASTO || (a.frequencia ?? 0) < FADIGA_FREQ) return false;
    const c1 = cplDe(a.antigo), c2 = cplDe(a.recente);
    return c1 != null && c2 != null && a.antigo.resultados >= 3 && a.recente.resultados >= 2 && c2 > c1 * 1.3;
  }).sort((a, b) => b.invest - a.invest);
  if (cansando.length) {
    const a = cansando[0];
    achados.push({
      area: "anuncios", gravidade: "media",
      titulo: cansando.length > 1 ? `${cansando.length} criativos cansando` : "1 criativo cansando",
      evidencia: `“${nomeDe(a)}”: frequência ${dec(a.frequencia!)} e custo de ${brl(cplDe(a.antigo)!)} para ${brl(cplDe(a.recente)!)} na última semana.${cansando.length > 1 ? ` Mais ${cansando.length - 1} no mesmo caminho.` : ""}`,
      porque: "Quando a mesma pessoa vê o mesmo anúncio várias vezes, o custo sobe antes de o volume cair.",
      acao: "Subir 2 ou 3 variações com abertura nova mantendo a oferta que funciona.",
    });
  }

  // ── 5. Custo acima da meta / acima do mês anterior ───────────────────────────
  if (d.metaCpl && atual.cpl && atual.resultados >= 10 && atual.cpl > d.metaCpl * 1.4) {
    achados.push({
      area: "anuncios", gravidade: atual.cpl > d.metaCpl * 2 ? "alta" : "media",
      titulo: "Custo acima da meta",
      evidencia: `${brl(atual.cpl)} por ${R.replace(/s$/, "")} contra meta de ${brl(d.metaCpl)}.`,
      porque: "A verba está comprando menos resultado do que o combinado para esta conta.",
      acao: "Revisar públicos e criativos com pior custo e concentrar verba no que está abaixo da meta.",
    });
  } else {
    const v = variacao(atual.cpl, anterior.cpl);
    if (v != null && v >= 25 && atual.resultados >= 10 && anterior.resultados >= 10) {
      achados.push({
        area: "anuncios", gravidade: v >= 40 ? "alta" : "media",
        titulo: "Custo por resultado subiu",
        evidencia: `${brl(atual.cpl!)} contra ${brl(anterior.cpl!)} no mês anterior (+${inteiro(v)}%).`,
        porque: "Pagar mais por cada resultado com a mesma verba reduz o volume do mês seguinte.",
        acao: "Comparar criativos e públicos do mês e retirar o que encareceu.",
      });
    }
  }

  // ── 6. Verba mal distribuída entre campanhas ─────────────────────────────────
  const campRel = d.campanhas.filter((c) => c.resultados >= MIN_RESULTADOS_RANKING && c.invest >= 100)
    .map((c) => ({ c, cpl: cplDe(c)! })).sort((a, b) => a.cpl - b.cpl);
  if (campRel.length >= 2) {
    const melhor = campRel[0], pior = campRel[campRel.length - 1];
    if (pior.cpl >= melhor.cpl * 2 && pior.c.invest >= atual.invest * 0.15) {
      achados.push({
        area: "anuncios", gravidade: "media",
        titulo: "Verba pesada em campanha cara",
        evidencia: `“${nomeDe(pior.c)}” custa ${brl(pior.cpl)} por resultado (${brl(pior.c.invest)} no mês); “${nomeDe(melhor.c)}” custa ${brl(melhor.cpl)}.`,
        porque: "Uma campanha custando o dobro da melhor está segurando o custo médio da conta.",
        acao: "Mover parte da verba da cara para a barata e testar o criativo da melhor na outra.",
      });
    }
  }

  // ── Campeões e piores do mês ─────────────────────────────────────────────────
  // Ranking só de anúncio que gastou o bastante: 6 conversas com R$ 7 não é campeão, é amostra.
  const pisoRanking = Math.max(50, atual.invest * 0.02);
  const ranking = anuncios.filter((a) => a.resultados >= MIN_RESULTADOS_RANKING && a.invest >= pisoRanking).sort((a, b) => cplDe(a)! - cplDe(b)!);
  const campeoes = ranking.slice(0, 3);
  const piores = ranking.length > 3 ? ranking.slice(-3).reverse() : [];

  // ── Instagram ────────────────────────────────────────────────────────────────
  const ig = d.ig;
  let notaIg: number | null = null;
  let motivoIg = "Instagram não vinculado ou sem leitura no período.";
  if (ig) {
    const porSemana = ig.postsNoPeriodo / 4.3;
    if (ig.postsNoPeriodo < POSTS_ESPERADOS_MES * 0.6) {
      achados.push({
        area: "instagram", gravidade: ig.postsNoPeriodo < POSTS_ESPERADOS_MES * 0.3 ? "alta" : "media",
        titulo: "Ritmo de publicação abaixo do combinado",
        evidencia: `${ig.postsNoPeriodo} posts em 30 dias (${dec(porSemana)} por semana)${ig.postsNoAnterior != null ? `; no mês anterior foram ${ig.postsNoAnterior}` : ""}. O playbook é segunda, quarta e sexta: cerca de ${POSTS_ESPERADOS_MES} no mês.`,
        porque: "Perfil que publica pouco perde alcance e dá menos matéria-prima para o anúncio.",
        acao: "Fechar o calendário do mês seguinte antes do dia 25 e cobrar a entrega pela data do post.",
      });
    } else if (ig.postsNoAnterior != null && ig.postsNoAnterior >= 8 && ig.postsNoPeriodo <= ig.postsNoAnterior * 0.7) {
      achados.push({
        area: "instagram", gravidade: "media",
        titulo: "Publicação caiu em relação ao mês anterior",
        evidencia: `${ig.postsNoPeriodo} posts contra ${ig.postsNoAnterior} no mês anterior.`,
        porque: "Queda de cadência costuma vir antes da queda de alcance.",
        acao: "Rever o que travou a produção e recompor o ritmo no calendário.",
      });
    }
    // Engajamento = curtidas+comentários dos POSTS sobre o alcance dos POSTS. O alcance da conta
    // inclui o que veio de anúncio (no Império, 96% do alcance de um reel era pago), e dividir por ele
    // acusaria "pouco engajamento" num perfil que só é muito anunciado.
    const comAlc = ig.posts.filter((p) => p.alcance != null && p.alcance > 0);
    const alcPosts = comAlc.reduce((s, p) => s + (p.alcance ?? 0), 0);
    const engPosts = comAlc.reduce((s, p) => s + p.engajamento, 0);
    if (!ig.parcial && comAlc.length >= 3 && alcPosts > 0) {
      const taxa = (engPosts / alcPosts) * 100;
      if (taxa < 1.5) {
        achados.push({
          area: "instagram", gravidade: "media",
          titulo: "Pouco engajamento nos posts",
          evidencia: `${dec(taxa)}% de curtidas e comentários sobre o alcance de ${comAlc.length} posts (${inteiro(alcPosts)} contas alcançadas, orgânico e anúncio somados).`,
          porque: "Quem vê e não reage indica conteúdo que não está dando motivo para parar.",
          acao: "Abrir reels e carrosséis com pergunta ou promessa clara nos 3 primeiros segundos e fechar com chamada para comentar.",
        });
      }
    }

    // Subnotas do Instagram: cadência e engajamento (as duas coisas que a agência controla).
    const cad = Math.min(10, Math.round((ig.postsNoPeriodo / POSTS_ESPERADOS_MES) * 10));
    const partes = [cad];
    const motivos = [`${ig.postsNoPeriodo} posts (esperado ~${POSTS_ESPERADOS_MES})`];
    if (!ig.parcial && comAlc.length >= 3 && alcPosts > 0) {
      const taxa = (engPosts / alcPosts) * 100;
      partes.push(taxa >= 5 ? 9 : taxa >= 3 ? 7 : taxa >= 1.5 ? 5 : 3);
      motivos.push(`${dec(taxa)}% de engajamento`);
    }
    notaIg = Math.round(partes.reduce((s, x) => s + x, 0) / partes.length);
    motivoIg = motivos.join(" · ");
  }

  // ── Dimensões e nota ─────────────────────────────────────────────────────────
  const dimensoes: Dimensao[] = [];
  // Custo
  {
    let nota: number | null = null; let motivo = "Poucos resultados no mês (mínimo 10) para avaliar custo.";
    if (atual.resultados >= 10 && atual.invest >= 100 && atual.cpl) {
      if (d.metaCpl) {
        const r = atual.cpl / d.metaCpl;
        nota = r <= 0.8 ? 9 : r <= 1 ? 8 : r <= 1.2 ? 6 : r <= 1.5 ? 4 : r <= 2 ? 2 : 1;
        motivo = `${brl(atual.cpl)} contra meta de ${brl(d.metaCpl)}`;
      } else {
        const v = variacao(atual.cpl, anterior.cpl);
        if (v != null && anterior.resultados >= 10) {
          nota = v <= -10 ? 8 : v <= 10 ? 6 : v <= 30 ? 4 : 2;
          motivo = `${brl(atual.cpl)} (${v > 0 ? "+" : ""}${inteiro(v)}% vs. mês anterior)`;
        } else motivo = "Sem meta cadastrada nem mês anterior comparável.";
      }
    }
    dimensoes.push({ nome: "Custo por resultado", peso: 30, nota, motivo });
  }
  // Volume
  {
    let nota: number | null = null; let motivo = "Sem mês anterior comparável (mínimo 10 resultados).";
    const v = variacao(atual.resultados, anterior.resultados);
    if (v != null && anterior.resultados >= 10) {
      nota = v >= 15 ? 9 : v >= 0 ? 7 : v >= -15 ? 5 : v >= -30 ? 3 : 2;
      motivo = `${inteiro(atual.resultados)} ${R} (${v > 0 ? "+" : ""}${inteiro(v)}% vs. mês anterior)`;
    }
    dimensoes.push({ nome: "Volume de resultados", peso: 20, nota, motivo });
  }
  // Higiene
  {
    let nota: number | null = null; let motivo = "Sem anúncio no período.";
    if (temAnuncio) {
      nota = 10 - Math.min(5, queimando.length * 2) - Math.min(3, cansando.length * 2) - (achados.some((a) => a.titulo === "Conta parou de gastar") ? 3 : 0);
      nota = Math.max(1, nota);
      motivo = nota === 10 ? "Nenhum anúncio queimando verba nem cansado" : `${queimando.length} sem resultado · ${cansando.length} cansando`;
    }
    dimensoes.push({ nome: "Saúde da conta", peso: 20, nota, motivo });
  }
  dimensoes.push({ nome: "Instagram e conteúdo", peso: 30, nota: notaIg, motivo: motivoIg });

  const avaliadas = dimensoes.filter((x) => x.nota != null);
  const pesoTotal = avaliadas.reduce((s, x) => s + x.peso, 0);
  const nota = pesoTotal > 0 ? Math.round((avaliadas.reduce((s, x) => s + x.nota! * x.peso, 0) / pesoTotal) * 10) : null;
  const veredito = nota == null ? "Sem dado suficiente para nota"
    : nota >= 80 ? "Operação saudável"
    : nota >= 65 ? "Base boa, ajustes necessários"
    : nota >= 50 ? "Atenção: vários pontos pedem ação"
    : "Intervenção necessária";

  // ── Plano de ação: sai dos achados, ordenado por gravidade ───────────────────
  const ordem: Record<Gravidade, number> = { alta: 0, media: 1, info: 2 };
  const ordenados = [...achados].sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade]);
  const seteDias = ordenados.filter((a) => a.gravidade === "alta").slice(0, 4).map((a) => a.acao);
  const trintaDias = ordenados.filter((a) => a.gravidade === "media").slice(0, 4).map((a) => a.acao);
  if (campeoes[0]) seteDias.push(`Criar 3 variações de “${nomeDe(campeoes[0])}” (${brl(cplDe(campeoes[0])!)} por resultado), mesma oferta com abertura nova.`);
  if (!seteDias.length) seteDias.push("Manter a rotina: nenhum ponto urgente no mês. Subir uma variação do melhor anúncio por semana para não deixar cansar.");
  if (!trintaDias.length) trintaDias.push("Testar um público ou formato novo com 10% da verba e comparar o custo ao fim do mês.");
  const noventaDias = [
    "Registrar quantas conversas viraram venda e o ticket médio para medir retorno, não só custo por resultado.",
    "Fechar o calendário de conteúdo com um mês de antecedência e medir salvamentos e compartilhamentos, não só curtidas.",
  ];

  // ── Conteúdo e crescimento do Instagram (a parte que complementa o social media) ──
  const conteudo: string[] = [];
  if (ig) {
    const comAlcance = ig.posts.filter((p) => p.alcance != null);
    const grupos = new Map<string, { n: number; alcance: number; eng: number }>();
    for (const p of comAlcance) {
      const t = /VIDEO|REEL/i.test(p.tipo) ? "Reels" : /CAROUSEL/i.test(p.tipo) ? "Carrosséis" : "Imagens";
      const g = grupos.get(t) ?? { n: 0, alcance: 0, eng: 0 };
      g.n++; g.alcance += p.alcance ?? 0; g.eng += p.engajamento;
      grupos.set(t, g);
    }
    const formatos = [...grupos.entries()].filter(([, g]) => g.n >= 2).map(([t, g]) => ({ t, media: g.alcance / g.n, n: g.n }))
      .sort((a, b) => b.media - a.media);
    if (formatos.length >= 2) {
      conteudo.push(`${formatos[0].t} alcançam em média ${inteiro(formatos[0].media)} contas por post, contra ${inteiro(formatos[formatos.length - 1].media)} de ${formatos[formatos.length - 1].t.toLowerCase()}. Priorizar o formato que mais alcança no calendário.`);
    } else if (formatos.length === 1) {
      conteudo.push(`Todos os posts medidos foram ${formatos[0].t.toLowerCase()}. Testar um segundo formato no mês para descobrir o que alcança mais.`);
    }
    const melhor = [...comAlcance].sort((a, b) => (b.alcance ?? 0) - (a.alcance ?? 0))[0];
    if (melhor?.alcance) conteudo.push(`Post de maior alcance: ${inteiro(melhor.alcance)} contas${melhor.data ? ` em ${dm(melhor.data.slice(0, 10))}` : ""}. Repetir o tema e o formato em duas variações no mês seguinte.`);
    if (!ig.parcial && ig.seguidoresGanhos != null) {
      conteudo.push(ig.seguidoresGanhos > 0
        ? `Ganho de ${inteiro(ig.seguidoresGanhos)} seguidores no mês${ig.seguidores ? ` (base de ${inteiro(ig.seguidores)})` : ""}. Para acelerar: colaboração com perfil da região e reel de bastidor com a pessoa da marca falando.`
        : `Sem ganho líquido de seguidores no mês. Crescer exige alcance fora da base: priorizar reels com tema que interessa a quem ainda não conhece a marca.`);
    }
    if (ig.parcial) conteudo.push("Leitura parcial do Instagram (conta sem permissão completa): alcance e seguidores ganhos ficam de fora até a conta ser vinculada ao Business.");
  }
  conteudo.push(
    "Funil semanal sugerido: 1 vídeo de apresentação (quem somos / onde estamos), 1 de dúvida real do cliente respondida, 1 de produto ou serviço em uso e 1 de oferta com prazo. Pessoa da marca falando e a chamada nos 3 primeiros segundos.",
    "O que o anúncio campeão do mês mostra deve virar post orgânico na semana seguinte: o que já converte paga menos para ser testado.",
  );

  return { atual, anterior, semanas, achados: ordenados, campeoes, piores, dimensoes, nota, veredito, plano: { seteDias, trintaDias, noventaDias }, conteudo };
}
