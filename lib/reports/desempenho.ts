// lib/reports/desempenho.ts — os números de desempenho da semana, por função e para o CEO.
//
// PRA QUE (Roberto, 31/08): "toda sexta um PDF pros funcionários e pra mim, mostrando o desempenho
// deles, personalizado de acordo com a função — existe OKR e métrica do social, do designer, do
// gestor de tráfego". E: "você envia muitas mensagens nos grupos, muito textão — algumas coisas
// podem ser PDF".
//
// SOBRE AS METAS: o Roberto não tinha metas escritas, então as daqui saem do que a operação JÁ
// faz hoje, medido em 60 dias. Meta que nasce longe da realidade não é meta, é decoração — estas
// ficam um degrau acima do atual, e são para ele revisar depois de ver a primeira rodada.

import { supabaseAdmin } from "@/lib/supabase/server";

export interface Meta {
  /** null = não houve base para medir nesta semana. NUNCA vira 0: ver `pct`. */
  valor: number | null;
  alvo: number;
  unidade: "%" | "un" | "dias";
  melhorQuando: "maior" | "menor";
  /** Métrica que se acompanha, mas por onde ninguém é cobrado (ex.: revisar arte é o trabalho). */
  informativa?: boolean;
  /** Por que não deu pra medir — aparece no lugar do número. */
  semBase?: string;
}
export interface BlocoFuncao {
  pessoa: string;
  funcao: "designer" | "social" | "trafego";
  metas: Record<string, Meta>;
  destaques: string[];
  atencao: string[];
  /** Quantos clientes diferentes essa pessoa atendeu na semana — carga espalhada ou concentrada. */
  clientes?: number;
  /** Variação do volume principal contra a semana anterior. Número solto não diz se melhorou. */
  variacao?: { rotulo: string; anterior: number; atual: number };
}

/**
 * Porcentagem, ou `null` quando não há denominador.
 *
 * Devolvia 0 quando d===0, e o PDF do Carlos saiu com "Pedidos do cliente decididos: 0% — fora da
 * meta" numa semana em que TODAS as demandas ainda estavam pendentes: não havia nada decidido nem
 * expirado, o denominador era zero. Zero por cento e "não houve o que decidir" são coisas
 * diferentes, e a primeira acusa alguém pela segunda. Nada dividido por nada não é nota.
 */
const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 100) : null);

/**
 * A semana que está FECHANDO, em horário de Brasília.
 *
 * O relatório sai na sexta à tarde, quando a semana corrente (seg→sex) acabou de acontecer — essa é
 * a janela certa ali. Mas rodando em qualquer outro dia, "esta semana" pode ser um pedaço vazio: o
 * primeiro teste, feito numa segunda de manhã, deu "31/08 a 06/09" e o PDF saiu com zero pessoas
 * porque a semana tinha acabado de começar. Sexta e sábado olham a semana corrente; qualquer outro
 * dia olha a última semana completa.
 *
 * Tudo aqui é aritmética de CALENDÁRIO (dia a dia), nunca de milissegundos: a máquina de
 * desenvolvimento roda em America/Santiago, que troca o relógio no começo de setembro, e um
 * `- 864e5` atravessando essa fronteira devolvia o dia errado. O fim da janela é montado com o
 * offset fixo de Brasília (−03:00, sem horário de verão desde 2019) em vez de `toISOString()` sobre
 * uma data local, que no VPS em UTC apontaria para as 21h do dia anterior.
 */
export function janelaSemana(agora = new Date()): { de: string; ate: string; rotulo: string } {
  const emSp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(agora);
  const parte = (t: string) => emSp.find((p) => p.type === t)!.value;
  const DIAS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const diaSem = DIAS.indexOf(parte("weekday"));

  // UTC como calendário puro: sem fuso, sem DST, só contas de dia.
  const hoje = new Date(Date.UTC(+parte("year"), +parte("month") - 1, +parte("day")));
  const recuo = ((diaSem + 6) % 7) + (diaSem === 5 || diaSem === 6 ? 0 : 7);
  const segunda = new Date(hoje); segunda.setUTCDate(hoje.getUTCDate() - recuo);
  const domingo = new Date(segunda); domingo.setUTCDate(segunda.getUTCDate() + 6);

  const iso = (d: Date, hora: string) => `${d.toISOString().slice(0, 10)}T${hora}-03:00`;
  const f = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return {
    de: new Date(iso(segunda, "00:00:00")).toISOString(),
    ate: new Date(iso(domingo, "23:59:59")).toISOString(),
    rotulo: `${f(segunda)} a ${f(domingo)}`,
  };
}


/**
 * Query que NÃO pode falhar calada.
 *
 * O bloco do designer saiu vazio na primeira rodada — nenhum designer no relatório — numa semana em
 * que 44 artes foram entregues. A causa: o select pedia a coluna `designer`, que não existe em
 * content_cards (o campo é `designer_delivered_by`). O PostgREST devolvia erro, `data` vinha null,
 * `cards ?? []` virava lista vazia e o relatório seguia dizendo que ninguém tinha entregado nada.
 * Um erro de digitação no nome de uma coluna apagava uma função inteira sem deixar rastro.
 */
async function exigir<T>(rotulo: string, p: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await p;
  if (error) throw new Error(`consulta "${rotulo}" falhou: ${error.message}`);
  return data ?? [];
}

// ── DESIGNER ────────────────────────────────────────────────────────────────
// O que dói hoje: 27% das artes voltam. O resto está saudável (1 dia de entrega, 85% no prazo).
export async function desempenhoDesigner(de: string, ate: string, anterior?: { de: string; ate: string }): Promise<BlocoFuncao[]> {
  const [cards, reworks, cardsAntes] = await Promise.all([
    exigir("designer: cards entregues", supabaseAdmin.from("content_cards")
      .select("id, designer_delivered_by, designer_delivered_at, due_date, created_at, client_name")
      .gte("designer_delivered_at", de).lt("designer_delivered_at", ate)),
    exigir("designer: retrabalho", supabaseAdmin.from("cs_rework_events")
      .select("card_id, client_name").gte("created_at", de).lt("created_at", ate)),
    // Semana anterior, só para dizer se subiu ou desceu. Volume sem comparação não informa nada.
    anterior
      ? exigir("designer: semana anterior", supabaseAdmin.from("content_cards")
          .select("id, designer_delivered_by")
          .gte("designer_delivered_at", anterior.de).lt("designer_delivered_at", anterior.ate))
      : Promise.resolve([] as { designer_delivered_by: string | null }[]),
  ]);

  const entreguesAntes = new Map<string, number>();
  for (const k of cardsAntes) {
    const n = (k.designer_delivered_by as string)?.trim() || "(sem designer)";
    entreguesAntes.set(n, (entreguesAntes.get(n) ?? 0) + 1);
  }

  const porPessoa = new Map<string, { entregues: number; noPrazo: number; voltaram: number; dias: number[]; clientes: Set<string> }>();
  const idsComRework = new Set((reworks ?? []).map((r) => r.card_id as string));

  for (const k of cards ?? []) {
    const nome = (k.designer_delivered_by as string)?.trim() || "(sem designer)";
    const g = porPessoa.get(nome) ?? { entregues: 0, noPrazo: 0, voltaram: 0, dias: [], clientes: new Set<string>() };
    if (k.client_name) g.clientes.add(k.client_name as string);
    g.entregues++;
    if (k.due_date && (k.designer_delivered_at as string)?.slice(0, 10) <= (k.due_date as string)) g.noPrazo++;
    if (idsComRework.has(k.id as string)) g.voltaram++;
    if (k.created_at) {
      const d = (new Date(k.designer_delivered_at as string).getTime() - new Date(k.created_at as string).getTime()) / 864e5;
      if (d >= 0 && d < 60) g.dias.push(d);
    }
    porPessoa.set(nome, g);
  }

  return [...porPessoa.entries()]
    // Quem não entregou nada como designer nesta semana não vira um cartão de designer zerado.
    .filter(([, g]) => g.entregues > 0)
    .map(([pessoa, g]) => {
    const retrabalho = pct(g.voltaram, g.entregues);
    const prazo = pct(g.noPrazo, g.entregues);
    // Sem entrega medida, o tempo médio é `null`, não zero: zero dia leria como entrega instantânea,
    // o melhor resultado possível, quando na verdade é ausência de dado.
    const media = g.dias.length ? g.dias.reduce((a, b) => a + b, 0) / g.dias.length : null;
    return {
      pessoa, funcao: "designer" as const,
      clientes: g.clientes.size,
      variacao: anterior
        ? { rotulo: "artes entregues", anterior: entreguesAntes.get(pessoa) ?? 0, atual: g.entregues }
        : undefined,
      metas: {
        "Artes entregues": { valor: g.entregues, alvo: 25, unidade: "un" as const, melhorQuando: "maior" as const },
        "Entregues no prazo": { valor: prazo, alvo: 90, unidade: "%" as const, melhorQuando: "maior" as const },
        "Voltaram pra refazer": { valor: retrabalho, alvo: 15, unidade: "%" as const, melhorQuando: "menor" as const },
        "Tempo médio de entrega": {
          valor: media === null ? null : Math.round(media * 10) / 10,
          alvo: 2, unidade: "dias" as const, melhorQuando: "menor" as const,
          semBase: media === null ? "sem entrega com data nesta semana" : undefined,
        },
      },
      // `prazo` e `retrabalho` são null quando não houve entrega medida. Sem base, não há elogio
      // nem cobrança a fazer — a linha simplesmente não aparece.
      destaques: [
        g.entregues > 0 ? `${g.entregues} artes entregues` : "",
        prazo !== null && prazo >= 90 ? `${prazo}% no prazo — acima da meta` : "",
        retrabalho !== null && retrabalho <= 15 && g.entregues > 3 ? `só ${retrabalho}% voltaram` : "",
      ].filter(Boolean),
      atencao: [
        retrabalho !== null && retrabalho > 15 ? `${retrabalho}% das artes voltaram pra refazer (meta: até 15%)` : "",
        prazo !== null && prazo < 90 && g.entregues > 3 ? `${prazo}% no prazo (meta: 90%)` : "",
      ].filter(Boolean),
    };
  });
}

// ── SOCIAL ──────────────────────────────────────────────────────────────────
// O que dói: sugestão do agente que expira sem decisão, e aprovação de cliente que não é registrada.
export async function desempenhoSocial(de: string, ate: string, anterior?: { de: string; ate: string }): Promise<BlocoFuncao[]> {
  const [cards, demandas, reworks, cardsAntes] = await Promise.all([
    exigir("social: cards criados", supabaseAdmin.from("content_cards")
      .select("id, social_media, created_at, client_approved_at, status, client_name")
      .gte("created_at", de).lt("created_at", ate)),
    exigir("social: demandas", supabaseAdmin.from("cs_demandas")
      .select("responsavel, status, created_at").gte("created_at", de).lt("created_at", ate)),
    exigir("social: revisões", supabaseAdmin.from("cs_rework_events")
      .select("reviewed_by").gte("created_at", de).lt("created_at", ate)),
    anterior
      ? exigir("social: semana anterior", supabaseAdmin.from("content_cards")
          .select("id, social_media").gte("created_at", anterior.de).lt("created_at", anterior.ate))
      : Promise.resolve([] as { social_media: string | null }[]),
  ]);

  const criadosAntes = new Map<string, number>();
  for (const k of cardsAntes) {
    const n = (k.social_media as string)?.trim(); if (!n) continue;
    criadosAntes.set(n, (criadosAntes.get(n) ?? 0) + 1);
  }

  const porPessoa = new Map<string, { criados: number; aprovados: number; decididas: number; expiradas: number; reprovou: number; clientes: Set<string> }>();
  const get = (n: string) => porPessoa.get(n) ?? { criados: 0, aprovados: 0, decididas: 0, expiradas: 0, reprovou: 0, clientes: new Set<string>() };

  for (const k of cards ?? []) {
    const nome = (k.social_media as string)?.trim(); if (!nome) continue;
    const g = get(nome); g.criados++; if (k.client_approved_at) g.aprovados++;
    if (k.client_name) g.clientes.add(k.client_name as string);
    porPessoa.set(nome, g);
  }
  for (const d of demandas ?? []) {
    const nome = (d.responsavel as string)?.trim(); if (!nome) continue;
    const g = get(nome);
    if (["confirmada", "descartada"].includes(d.status as string)) g.decididas++;
    if (d.status === "expirada") g.expiradas++;
    porPessoa.set(nome, g);
  }
  for (const r of reworks ?? []) {
    const nome = (r.reviewed_by as string)?.trim(); if (!nome) continue;
    const g = get(nome); g.reprovou++; porPessoa.set(nome, g);
  }

  // Quantos cards do histórico têm aprovação registrada. Se o campo quase não é usado, ele não mede
  // a pessoa — mede o preenchimento — e não pode virar meta. Ver o bloco de "Aprovações" abaixo.
  const { count: totalCards } = await supabaseAdmin
    .from("content_cards").select("id", { count: "exact", head: true });
  const { count: cardsComAprovacao } = await supabaseAdmin
    .from("content_cards").select("id", { count: "exact", head: true }).not("client_approved_at", "is", null);
  const registroDeAprovacaoEmUso = (totalCards ?? 0) > 0 && (cardsComAprovacao ?? 0) / (totalCards ?? 1) >= 0.5;

  return [...porPessoa.entries()]
    // Só entra no relatório de social quem PRODUZIU como social nesta semana. Sem isto, alguém com
    // uma demanda pendente entrava como "Social Media com 0 peças criadas, fora da meta" — o
    // Rodrigo e o Julio saíram assim na primeira rodada, e nem são dessa função.
    .filter(([, g]) => g.criados > 0)
    .map(([pessoa, g]) => {
    const decisao = pct(g.decididas, g.decididas + g.expiradas);
    const pendentesSemDesfecho = g.decididas + g.expiradas === 0;
    return {
      pessoa, funcao: "social" as const,
      clientes: g.clientes.size,
      variacao: anterior
        ? { rotulo: "peças criadas", anterior: criadosAntes.get(pessoa) ?? 0, atual: g.criados }
        : undefined,
      metas: {
        "Peças criadas": { valor: g.criados, alvo: 20, unidade: "un" as const, melhorQuando: "maior" as const },
        "Pedidos do cliente decididos": {
          valor: decisao, alvo: 90, unidade: "%" as const, melhorQuando: "maior" as const,
          // Pendente ainda dentro do prazo não é pedido ignorado. Sem desfecho, não há o que medir.
          semBase: pendentesSemDesfecho ? "nenhum pedido venceu nesta semana" : undefined,
        },
        // `client_approved_at` está preenchido em 36 de 529 cards do histórico. Cobrar "5 aprovações
        // por semana" é cobrar a pessoa por um campo que o fluxo real não preenche. Enquanto o
        // registro não for hábito, o número aparece como acompanhamento, não como meta.
        "Aprovações registradas": {
          valor: g.aprovados, alvo: 5, unidade: "un" as const, melhorQuando: "maior" as const,
          informativa: !registroDeAprovacaoEmUso,
          semBase: registroDeAprovacaoEmUso ? undefined : "o time ainda não registra aprovação no sistema",
        },
        // Reprovar arte É o trabalho de quem revisa. Tratar 6 revisões como "fora da meta" pune
        // justamente quem confere antes de mandar pro cliente. Acompanha-se o número; não se cobra.
        "Artes que você devolveu pra ajuste": {
          valor: g.reprovou, alvo: 5, unidade: "un" as const, melhorQuando: "menor" as const,
          informativa: true,
        },
      },
      destaques: [
        g.criados > 0 ? `${g.criados} peças criadas` : "",
        decisao !== null && decisao >= 90 && g.decididas > 0 ? "todos os pedidos do cliente decididos" : "",
      ].filter(Boolean),
      atencao: [
        g.expiradas > 0 ? `${g.expiradas} pedido(s) de cliente expiraram sem decisão` : "",
        g.reprovou > 8 ? `${g.reprovou} artes devolvidas — vale alinhar o padrão com o designer antes` : "",
      ].filter(Boolean),
    };
  });
}

// ── TRÁFEGO ─────────────────────────────────────────────────────────────────
// O sistema LÊ a Meta, não escreve nela. Então mede resultado e cobertura, não "otimizações feitas".
export async function desempenhoTrafego(de: string, ate: string) {
  const d0 = de.slice(0, 10), d1 = ate.slice(0, 10);
  const antes = new Date(new Date(de).getTime() - 7 * 864e5).toISOString().slice(0, 10);

  const { data: m } = await supabaseAdmin.from("metric_snapshots")
    .select("client_id, metric_date, spend, conversions").gte("metric_date", antes).lt("metric_date", d1);

  const sem = (ini: string, fim: string) => (m ?? []).filter((x) => (x.metric_date as string) >= ini && (x.metric_date as string) < fim);
  const soma = (rows: typeof m) => (rows ?? []).reduce((a, r) => ({
    gasto: a.gasto + (Number(r.spend) || 0), conversas: a.conversas + (Number(r.conversions) || 0),
  }), { gasto: 0, conversas: 0 });

  const atual = soma(sem(d0, d1)), anterior = soma(sem(antes, d0));
  const custoAtual = atual.conversas > 0 ? atual.gasto / atual.conversas : 0;
  const custoAntes = anterior.conversas > 0 ? anterior.gasto / anterior.conversas : 0;
  const contasAtivas = new Set(sem(d0, d1).filter((x) => Number(x.spend) > 0).map((x) => x.client_id)).size;

  return {
    contasAtivas, gasto: atual.gasto, conversas: atual.conversas,
    custoPorConversa: Math.round(custoAtual * 100) / 100,
    variacaoCusto: custoAntes > 0 ? Math.round(((custoAtual - custoAntes) / custoAntes) * 1000) / 10 : null,
    variacaoConversas: anterior.conversas > 0
      ? Math.round(((atual.conversas - anterior.conversas) / anterior.conversas) * 1000) / 10 : null,
  };
}

// ── CEO ─────────────────────────────────────────────────────────────────────
export interface VisaoCeo {
  rotulo: string;
  bom: { texto: string; numero: string }[];
  preocupa: { texto: string; numero: string }[];
  carteira: { ativos: number; semConteudo: number; pedidosAbertos: number };
}

export async function visaoCeo(de: string, ate: string, rotulo: string): Promise<VisaoCeo> {
  const [{ data: entregues }, { data: reworks }, { count: pendentes }, { count: expiradas }, { data: clientes }] =
    await Promise.all([
      supabaseAdmin.from("content_cards").select("id, due_date, designer_delivered_at")
        .gte("designer_delivered_at", de).lt("designer_delivered_at", ate),
      supabaseAdmin.from("cs_rework_events").select("card_id").gte("created_at", de).lt("created_at", ate),
      supabaseAdmin.from("cs_demandas").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      supabaseAdmin.from("cs_demandas").select("id", { count: "exact", head: true })
        .eq("status", "expirada").gte("updated_at", de).lt("updated_at", ate),
      supabaseAdmin.from("clients").select("id, name")
        .or("active.is.null,active.eq.true").is("draft_status", null),
    ]);

  const total = entregues?.length ?? 0;
  const noPrazo = (entregues ?? []).filter((k) => k.due_date && (k.designer_delivered_at as string)?.slice(0, 10) <= (k.due_date as string)).length;

  // "X% das artes voltaram" só faz sentido se numerador e denominador falarem do MESMO conjunto.
  // Contando todo evento de rework da semana dava 11 de 44 = 25%, mas 3 daqueles 11 eram artes
  // entregues em semanas ANTERIORES que voltaram agora — não estão entre as 44. O relatório do time
  // mostrava 25% no topo e 18% no cartão do designer, na mesma página, sobre as mesmas artes.
  const idsEntregues = new Set((entregues ?? []).map((k) => k.id as string));
  const voltaram = new Set((reworks ?? []).map((r) => r.card_id as string).filter((id) => idsEntregues.has(id))).size;
  const voltaramDeAntes = new Set((reworks ?? []).map((r) => r.card_id as string).filter((id) => !idsEntregues.has(id))).size;

  // Cliente ativo sem NENHUMA peça nas últimas 4 semanas — o sinal de churn que aparece cedo.
  const quatroSem = new Date(new Date(ate).getTime() - 28 * 864e5).toISOString();
  const { data: comCard } = await supabaseAdmin.from("content_cards")
    .select("client_id").gte("created_at", quatroSem);
  const ativosComCard = new Set((comCard ?? []).map((k) => k.client_id as string));
  const semConteudo = (clientes ?? []).filter((c) => !/\(teste\)/i.test(c.name as string) && !ativosComCard.has(c.id as string)).length;

  const bom: { texto: string; numero: string }[] = [];
  const preocupa: { texto: string; numero: string }[] = [];

  const pctPrazo = pct(noPrazo, total);
  const pctVoltaram = pct(voltaram, total);

  if (total > 0) bom.push({ numero: String(total), texto: "artes entregues na semana" });
  if (pctPrazo !== null && pctPrazo >= 85) bom.push({ numero: `${pctPrazo}%`, texto: "entregues no prazo" });
  if (pctVoltaram !== null && pctVoltaram <= 15) bom.push({ numero: `${pctVoltaram}%`, texto: "de retrabalho — dentro da meta" });

  if (pctVoltaram !== null && pctVoltaram > 15) preocupa.push({ numero: `${pctVoltaram}%`, texto: `das artes voltaram pra refazer (${voltaram} de ${total})` });
  // Retrabalho de arte antiga é outro problema: não entra na taxa da semana, mas custa hora do time.
  if (voltaramDeAntes > 0) preocupa.push({ numero: String(voltaramDeAntes), texto: "arte(s) de semanas anteriores voltaram pra ajuste nesta semana" });
  if (pctPrazo !== null && pctPrazo < 85) preocupa.push({ numero: `${pctPrazo}%`, texto: "no prazo — abaixo dos 85% habituais" });
  if ((expiradas ?? 0) > 0) preocupa.push({ numero: String(expiradas), texto: "pedidos de cliente expiraram sem ninguém decidir" });
  if ((pendentes ?? 0) > 15) preocupa.push({ numero: String(pendentes), texto: "pedidos ainda esperando decisão" });
  if (semConteudo > 0) preocupa.push({ numero: String(semConteudo), texto: "clientes sem nenhuma peça há 4 semanas" });

  return {
    rotulo, bom, preocupa,
    carteira: {
      ativos: (clientes ?? []).filter((c) => !/\(teste\)/i.test(c.name as string)).length,
      semConteudo, pedidosAbertos: pendentes ?? 0,
    },
  };
}

// ── RELATÓRIO DO TIME ───────────────────────────────────────────────────────
// Roberto (01/09): "eu queria tipo um PDF como se fosse um relatório de todo o time, com alguns
// dados a mais". A primeira versão mandava um documento por pessoa; para ler a operação inteira ele
// tinha que abrir quatro arquivos e comparar de cabeça. Aqui é um documento só, com todo mundo.

export interface RelatorioTime {
  rotulo: string;
  periodoAnterior: string;
  blocos: BlocoFuncao[];
  trafego: Awaited<ReturnType<typeof desempenhoTrafego>>;
  geral: {
    artesEntregues: number; pecasCriadas: number; clientesAtendidos: number;
    noPrazo: number | null; retrabalho: number | null;
    pedidosAbertos: number; pedidosExpirados: number;
  };
  /** Riscos que só aparecem olhando o time junto — não cabem em nenhum cartão individual. */
  estruturais: string[];
}

/** A semana anterior à janela dada, para as comparações. Calendário puro, como `janelaSemana`. */
export function janelaAnterior(de: string): { de: string; ate: string; rotulo: string } {
  const ini = new Date(de);
  const antes = new Date(ini.getTime()); antes.setUTCDate(antes.getUTCDate() - 7);
  const fim = new Date(ini.getTime());
  const f = (d: Date) => {
    const p = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
    return p.format(d);
  };
  const ultimoDia = new Date(fim.getTime() - 864e5);
  return { de: antes.toISOString(), ate: fim.toISOString(), rotulo: `${f(antes)} a ${f(ultimoDia)}` };
}

export async function relatorioTime(de: string, ate: string, rotulo: string): Promise<RelatorioTime> {
  const anterior = janelaAnterior(de);
  const [designers, socials, trafego, cards, demandas, reworks, atendidos] = await Promise.all([
    desempenhoDesigner(de, ate, anterior),
    desempenhoSocial(de, ate, anterior),
    desempenhoTrafego(de, ate),
    exigir("time: entregas", supabaseAdmin.from("content_cards")
      .select("id, due_date, designer_delivered_at, designer_delivered_by, client_name")
      .gte("designer_delivered_at", de).lt("designer_delivered_at", ate)),
    exigir("time: demandas", supabaseAdmin.from("cs_demandas").select("status").gte("created_at", de).lt("created_at", ate)),
    exigir("time: retrabalho", supabaseAdmin.from("cs_rework_events").select("card_id").gte("created_at", de).lt("created_at", ate)),
    // Clientes atendidos é a UNIÃO das funções: quem teve arte entregue OU peça criada na semana.
    exigir("time: clientes atendidos", supabaseAdmin.from("content_cards")
      .select("client_name, created_at, designer_delivered_at")
      .or(`and(designer_delivered_at.gte.${de},designer_delivered_at.lt.${ate}),and(created_at.gte.${de},created_at.lt.${ate})`)),
  ]);

  const blocos = [...designers, ...socials];
  const entregues = cards.length;
  const noPrazo = cards.filter((k) => k.due_date && (k.designer_delivered_at as string)?.slice(0, 10) <= (k.due_date as string)).length;
  const clientes = new Set(atendidos.map((k) => k.client_name).filter(Boolean));

  // Mesmo critério do cartão do designer: das artes DESTA semana, quantas voltaram.
  const idsEntregues = new Set(cards.map((k) => k.id as string));
  const voltaram = new Set(reworks.map((r) => r.card_id as string).filter((id) => idsEntregues.has(id))).size;
  const voltaramDeAntes = new Set(reworks.map((r) => r.card_id as string).filter((id) => !idsEntregues.has(id))).size;

  // Riscos que só aparecem no conjunto. Um cartão individual nunca mostra "o time inteiro depende
  // de uma pessoa" — pra quem entrega, aquilo é só uma semana produtiva.
  const estruturais: string[] = [];
  const porDesigner = new Map<string, number>();
  for (const k of cards) {
    const n = (k.designer_delivered_by as string)?.trim() || "(sem designer)";
    porDesigner.set(n, (porDesigner.get(n) ?? 0) + 1);
  }
  const maior = [...porDesigner.entries()].sort((a, b) => b[1] - a[1])[0];
  if (maior && entregues > 0 && maior[1] / entregues >= 0.9 && entregues >= 10) {
    estruturais.push(
      `${maior[0]} entregou ${maior[1]} das ${entregues} artes da semana. A produção inteira depende de uma pessoa: ` +
      `férias, atestado ou saída param a entrega de todos os clientes.`);
  }
  const semDono = porDesigner.get("(sem designer)") ?? 0;
  if (semDono > 0) estruturais.push(`${semDono} arte(s) entregue(s) sem registro de quem fez — não dá pra creditar nem cobrar.`);

  if (voltaramDeAntes > 0) {
    estruturais.push(`${voltaramDeAntes} arte(s) entregue(s) em semanas anteriores voltaram pra ajuste agora — não entram na taxa desta semana, mas consumiram hora do time.`);
  }

  // Queda que atinge TODO MUNDO não é desempenho individual: ou a demanda caiu, ou algo travou a
  // entrada de trabalho. Nenhum cartão individual consegue dizer isso.
  const comQueda = blocos.filter((b) => b.variacao && b.variacao.anterior > 0 &&
    (b.variacao.atual - b.variacao.anterior) / b.variacao.anterior <= -0.25);
  if (blocos.length >= 2 && comQueda.length === blocos.length) {
    estruturais.push(
      `Todo o time produziu menos que na semana anterior (${blocos.map((b) => b.pessoa).join(", ")}). ` +
      `Queda geral costuma ser entrada de trabalho, não ritmo de quem executa — vale olhar quantos pedidos chegaram.`);
  }

  const expiradas = demandas.filter((d) => d.status === "expirada").length;
  const abertas = demandas.filter((d) => d.status === "pendente").length;
  if (abertas > 0 && blocos.length > 0) {
    estruturais.push(`${abertas} pedido(s) de cliente da semana ainda sem decisão — é o funil da semana que vem.`);
  }

  return {
    rotulo, periodoAnterior: anterior.rotulo, blocos, trafego,
    geral: {
      artesEntregues: entregues,
      pecasCriadas: socials.reduce((a, b) => a + (Number(b.metas["Peças criadas"]?.valor) || 0), 0),
      clientesAtendidos: clientes.size,
      noPrazo: pct(noPrazo, entregues),
      retrabalho: pct(voltaram, entregues),
      pedidosAbertos: abertas, pedidosExpirados: expiradas,
    },
    estruturais,
  };
}
