// lib/cs/mensagem-cliente.ts — a mensagem de qua/sex no grupo do CLIENTE deixa de ser sorteio.
//
// Como era: `pick()` de 5 textos fixos (lib/traffic/support-message.ts), 3×/semana, 508 envios em
// 30 dias. O mesmo "tem alguma novidade?" ia pro cliente que aprovou 4 artes hoje e pro que sumiu
// há 20 dias. O sistema sabia tudo sobre os dois e não usava nada — é isso que soa robô.
//
// Como fica: junta os SINAIS REAIS do cliente e escreve a partir deles. Sem sinal nenhum, cai no
// texto neutro de antes — melhor genérico do que forçar assunto.
//
// GUARDA-CORPOS (o cliente é quem lê; erro aqui custa caro):
//   • número só sai se estiver nos sinais — a IA não calcula, não estima, não arredonda
//   • nunca promete data/hora ("amanhã fica pronto", "até sexta")
//   • nunca fala de dinheiro (preço, verba, investimento, resultado financeiro)
//   • nunca cobra o cliente nem sugere que ele está devendo algo
//   • falhou a IA? cai no texto neutro. Nunca deixa o cliente sem mensagem nem manda meia-frase.

import { chatJson } from "@/lib/ai/openai";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getEstiloCliente } from "./estilo";

export interface SinaisCliente {
  /** Artes REALMENTE esperando o OK dele: status de aprovação E sem carimbo de aprovado.
   *  Só o status não basta — ele atrasa em relação à realidade (o cliente aprova no grupo e o
   *  card fica pra trás). Cobrar aprovação de quem já aprovou é o pior erro possível aqui. */
  aguardandoAprovacao: number;
  /** Aprovou alguma arte nos últimos 7 dias — sinal de que ele está presente e respondendo. */
  aprovouRecentemente: boolean;
  /** Desde quando a arte mais antiga está esperando ele. Sem isso não dá pra separar resposta
   *  à arte de conversa anterior. */
  esperandoDesde: string | null;
  /** Artes entregues nos últimos 7 dias (a gente produziu). */
  entreguesNaSemana: number;
  /** Dias desde a última mensagem do cliente no grupo. null = nunca falou / sem registro. */
  diasSemFalar: number | null;
  /** Recebeu a pergunta da promoção do mês e não respondeu depois disso. */
  promoDoMesSemResposta: boolean;
  /** Post do período com mais engajamento (só se houver número real no snapshot). */
  destaqueIg: { curtidas: number; comentarios: number } | null;
  /** Posts publicados no Instagram nos últimos 7 dias (do snapshot). */
  postsNaSemana: number | null;
  /** Loja de construção/varejo E hoje é segunda: o assunto da semana é produto/preço novo. */
  pedirProdutosHoje: boolean;
}

/** Engajamento mínimo (curtidas + comentários) pra um post virar "destaque da semana". */
const DESTAQUE_MINIMO = 10;

const VAZIO: SinaisCliente = {
  aguardandoAprovacao: 0, aprovouRecentemente: false, esperandoDesde: null, entreguesNaSemana: 0, diasSemFalar: null,
  promoDoMesSemResposta: false, destaqueIg: null, postsNaSemana: null, pedirProdutosHoje: false,
};

/** Junta os sinais de UM cliente. Nunca lança — sem sinal, a mensagem cai no texto neutro. */
export async function coletarSinais(clientId: string): Promise<SinaisCliente> {
  try {
    const seteDias = new Date(Date.now() - 7 * 86400000).toISOString();
    const [cards, cli, igRow, calendario] = await Promise.all([
      supabaseAdmin.from("content_cards")
        .select("status, designer_delivered_at, client_approved_at, status_changed_at")
        .eq("client_id", clientId).is("archived_at", null),
      supabaseAdmin.from("clients").select("last_client_msg_at, pergunta_produtos_semana").eq("id", clientId).maybeSingle(),
      supabaseAdmin.from("client_ig_snapshots").select("data").eq("client_id", clientId).eq("period_kind", "7d").maybeSingle(),
      supabaseAdmin.from("client_group_message_log")
        .select("sent_at").eq("client_id", clientId).eq("kind", "calendar").eq("status", "sent")
        .order("sent_at", { ascending: false }).limit(1),
    ]);

    const linhas = (cards.data ?? []) as { status: string; designer_delivered_at: string | null; client_approved_at: string | null; status_changed_at: string | null }[];
    // CONFERE SE ELE REALMENTE NÃO APROVOU. Card pode estar em "aguardando aprovação" e já ter o
    // carimbo de aprovado — o cliente respondeu no grupo e ninguém moveu o card. Cobrar aprovação
    // de quem já aprovou passa a impressão de que a gente não presta atenção nele.
    const aguardandoAprovacao = linhas.filter((c) => c.status === "client_approval" && !c.client_approved_at).length;
    const aprovouRecentemente = linhas.some((c) => c.client_approved_at && c.client_approved_at >= seteDias);
    // Quando a arte mais antiga entrou em "esperando o cliente" — marco pra ler a conversa depois.
    const esperando = linhas
      .filter((c) => c.status === "client_approval" && !c.client_approved_at && c.status_changed_at)
      .map((c) => c.status_changed_at as string).sort();
    const esperandoDesde = esperando[0] ?? null;
    const entreguesNaSemana = linhas.filter((c) => c.designer_delivered_at && c.designer_delivered_at >= seteDias).length;

    const ultimaMsg = (cli.data?.last_client_msg_at as string | null) ?? null;
    const diasSemFalar = ultimaMsg ? Math.floor((Date.now() - new Date(ultimaMsg).getTime()) / 86400000) : null;

    // Promoção do mês: mandamos o calendário e o cliente não falou NADA depois disso.
    const enviadoEm = (calendario.data?.[0]?.sent_at as string | undefined) ?? null;
    const promoDoMesSemResposta = !!enviadoEm && (!ultimaMsg || ultimaMsg < enviadoEm);

    // Instagram: só entra se o número existir de verdade no snapshot.
    const ig = igRow.data?.data as {
      resumo?: { postsNoPeriodo?: number | null };
      posts?: { curtidas: number | null; comentarios: number | null }[];
    } | undefined;
    const topo = ig?.posts?.[0]; // o snapshot já vem ordenado por engajamento
    // PISO DE DESTAQUE. Na primeira revisão a IA escreveu "o post que mais bombou teve 1 curtida,
    // que legal!" pra quatro clientes. Comemorar número pequeno faz a agência parecer que não
    // entende do próprio trabalho — pior que não falar nada. Abaixo do piso, o post não é destaque.
    const engajamento = (topo?.curtidas ?? 0) + (topo?.comentarios ?? 0);
    const destaqueIg = topo && engajamento >= DESTAQUE_MINIMO
      ? { curtidas: topo.curtidas ?? 0, comentarios: topo.comentarios ?? 0 }
      : null;

    // Segunda-feira em SP — o servidor roda em UTC e à noite viraria o dia errado.
    const ehSegunda = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}T12:00:00Z`).getUTCDay() === 1;

    return {
      aguardandoAprovacao, aprovouRecentemente, esperandoDesde, entreguesNaSemana, diasSemFalar, promoDoMesSemResposta, destaqueIg,
      postsNaSemana: ig?.resumo?.postsNoPeriodo ?? null,
      pedirProdutosHoje: ehSegunda && !!cli.data?.pergunta_produtos_semana,
    };
  } catch {
    return VAZIO;
  }
}

/** Tem alguma coisa concreta pra dizer? Se não, nem chama a IA. */
export function temAssunto(s: SinaisCliente): boolean {
  return s.aguardandoAprovacao > 0
    || s.entreguesNaSemana > 0
    || s.promoDoMesSemResposta
    || !!s.destaqueIg
    || (s.diasSemFalar !== null && s.diasSemFalar >= 10);
}

/** Vira as linhas de contexto que a IA pode usar. SÓ o que está aqui pode virar número na mensagem. */
export function descreverSinais(s: SinaisCliente): string[] {
  const l: string[] = [];
  if (s.aguardandoAprovacao > 0) l.push(`${s.aguardandoAprovacao} arte(s) esperando o OK dele pra poder publicar`);
  if (s.entreguesNaSemana > 0) l.push(`${s.entreguesNaSemana} arte(s) que a gente entregou nos últimos 7 dias`);
  if (s.postsNaSemana != null && s.postsNaSemana > 0) l.push(`${s.postsNaSemana} post(s) publicados no Instagram dele nos últimos 7 dias`);
  if (s.destaqueIg) l.push(`o post que mais engajou na semana teve ${s.destaqueIg.curtidas} curtidas e ${s.destaqueIg.comentarios} comentários`);
  if (s.promoDoMesSemResposta) l.push("a gente perguntou a promoção do mês e ele ainda não respondeu");
  if (s.diasSemFalar !== null && s.diasSemFalar >= 10) l.push(`ele não fala no grupo há ${s.diasSemFalar} dias`);
  return l;
}

const SCHEMA: Record<string, unknown> = {
  type: "object", additionalProperties: false, required: ["mensagem"],
  properties: { mensagem: { type: "string" } },
};

const SYSTEM = `Você é o social media da Lone Mídia mandando a mensagem do dia no grupo de WhatsApp
de um CLIENTE (uma loja/comércio do interior do Rio). Escreve como gente: caloroso, próximo, tom
brasileiro de agência. Curto: 2 a 4 frases, no máximo 2 emojis.

# O que fazer
Você recebe UMA MISSÃO e os fatos dela. A mensagem inteira serve àquela missão — nada mais.

Estrutura: cumprimento curto · o assunto em uma ou duas frases · uma pergunta de verdade.
2 a 4 frases no total. Máximo 2 emojis.

NÃO acrescente outro assunto. NÃO liste o que aconteceu na semana. Se um fato não serve à
missão, ele não entra — mesmo que seja verdade.

# PROIBIDO (o cliente lê isso; errar aqui custa a relação)
- Inventar QUALQUER número. Só use os números que te derem, exatamente como vieram.
- Prometer data ou hora ("amanhã fica pronto", "até sexta", "em 2 dias").
- Falar de dinheiro: preço, orçamento, verba, investimento, faturamento, resultado em R$.
- Cobrar, culpar ou dar a entender que ele está devendo/atrasado com a gente.
- Dizer que "os resultados melhoraram/pioraram" sem número que comprove.
- Falar de assunto interno (designer, card, board, prazo da equipe, sistema).
- Escrever o nome cadastrado da loja — cumprimente com "Oi, pessoal!" ou parecido.
- Afirmar QUALQUER coisa que não esteja nos fatos. Se não te disseram que tem arte esperando o OK
  dele, NÃO diga que tem. "Entregamos uma arte" e "tem arte esperando seu OK" são coisas
  DIFERENTES — não troque uma pela outra.
- Comemorar número pequeno. Se o desempenho foi modesto, não elogie e não cite — puxe outro
  assunto. Elogio falso queima a confiança mais rápido que silêncio.
- A FÓRMULA "vamos/bora + verbo + juntos". Nada de "vamos juntos fazer acontecer", "vamos fazer
  barulho juntos", "vamos nessa", "bora fazer algo incrível". Em qualquer ordem das palavras.
  Fecha com uma pergunta de verdade sobre o negócio dele, não com incentivo genérico.
- COLAR ASSUNTOS COM "mas", "e também", "além disso", "aproveitando". Se você precisou de um
  conector pra emendar dois temas, a mensagem tem dois temas — e devia ter um.
- Pergunta vaga que não pede resposta ("o que acham de compartilhar algo especial?"). Pergunte a
  coisa concreta que a missão precisa saber.
- Frase de efeito sem significado ("como está a procura por novidades na loja?").
- Repetir a mensagem de outro cliente. Dois clientes com os mesmos números NÃO podem receber o
  mesmo texto — siga o ângulo de abertura que te derem.
- Inventar gíria. Escreva português normal do dia a dia; na dúvida, seja simples.

Responda APENAS no JSON do schema (campo "mensagem").`;

// Sinais de que a IA escorregou num guarda-corpo. Se bater, joga fora e usa o texto neutro —
// mensagem errada pro cliente é pior que mensagem genérica.
const PROIBIDO = [
  /R\$\s*\d/i,
  // Sem \b no FIM: o \b do JS é ASCII e não enxerga "ã"/"á" como letra, então "amanhã." não
  // fechava fronteira e a promessa de prazo passava batido. A âncora fica só na abertura.
  /(\bamanh[ãa]|\bhoje ainda|\bat[ée] (segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)|\bem \d+ dias?\b)/i,
  /\b(or[çc]amento|verba|investimento|faturamento|fatura|pre[çc]o|valor do plano|mensalidade)\b/i,
  /\b(voc[êe]s? (est[ãa]o|t[áa]) devendo|cobran[çc]a|atrasad[oa])\b/i,
];

/** Números que a IA pode citar — qualquer outro é invenção. */
function numerosPermitidos(s: SinaisCliente): Set<string> {
  const ok = new Set<string>();
  const add = (n: number | null | undefined) => { if (n != null) ok.add(String(n)); };
  add(s.aguardandoAprovacao); add(s.entreguesNaSemana); add(s.postsNaSemana);
  add(s.destaqueIg?.curtidas); add(s.destaqueIg?.comentarios); add(s.diasSemFalar);
  return ok;
}

// ═══ UM OBJETIVO POR MENSAGEM ═══════════════════════════════════════════════
//
// A revisão do Roberto derrubou a versão anterior. A mensagem que saiu pro Body Skin:
//
//   "Como está a procura por novidades na loja? A gente entregou uma arte essa semana e já
//    publicamos 2 posts no Instagram, MAS ainda estamos curiosos sobre a promoção do mês..."
//
// Ele leu e disse: "não entendi o sentido". Com razão — é colagem de fatos, não mensagem.
// Entregar 4 sinais e pedir pra "puxar assunto com todos" produz frankenstein: a IA costura
// coisas sem relação com "mas"/"e" e nenhuma frase tem propósito. O "como está a procura por
// novidades" veio de um ÂNGULO que eu tinha inventado pra dar variedade — variedade às custas
// de sentido.
//
// Agora o CÓDIGO escolhe um objetivo, e a IA recebe SÓ os dados daquele objetivo. Os outros
// sinais nem entram no prompt. Assim é estruturalmente impossível colar fatos soltos.

export type Objetivo =
  | "aprovar_arte"      // tem arte parada esperando o OK dele
  | "promo_do_mes"      // perguntamos a promoção e ele não respondeu
  | "reengajar"         // sumiu do grupo
  | "comemorar_post"    // um post foi bem de verdade
  | "oferecer_proximo"  // a semana rendeu; puxa o que vem agora
  | "produtos_semana"   // SEGUNDA, loja de construção/varejo: o que chegou de novo e a que preço
  | "presenca";         // nada pendente: mostra que a gente está de olho e disponível

/**
 * VARIAÇÕES por objetivo. A missão (o SENTIDO) é sempre a mesma; muda só o jeito de dizer.
 *
 * Foi assim que o Roberto pediu: "crie variações sempre em cima de conversas que são repetitivas
 * pra não ficar robótica, mas ter um padrão de sentido". A tentativa anterior variava o ÂNGULO e
 * quebrava o sentido ("como está a procura por novidades na loja?"). Aqui o objetivo é fixo e a
 * variação é de forma — o cliente que recebe a mesma conversa três semanas seguidas não lê a
 * mesma frase, mas continua entendendo a mesma coisa.
 */
const VARIACOES: Record<Objetivo, string[]> = {
  // SEGUNDA DE LOJA. Em construção e varejo a semana começa com produto novo chegando e preço
  // mudando — é a matéria-prima do conteúdo da semana, e é o dono da loja quem tem. Perguntar na
  // segunda é chegar antes de a semana virar improviso (foi a falta de assunto que deixou os dois
  // Bazar parados). Pergunta ABERTA e curta: pedir tabela inteira vira tarefa e ninguém responde.
  produtos_semana: [
    "Pergunte se chegou produto novo essa semana e se tem preço pra divulgar.",
    "Pergunte o que tem de novidade na loja essa semana pra vocês já montarem o conteúdo.",
    "Pergunte se tem produto novo ou preço especial que valha divulgar nos próximos dias.",
    "Pergunte o que ele quer destacar essa semana — produto novo, oferta, o que estiver saindo mais.",
    "Pergunte se entrou mercadoria nova ou se algum preço mudou, pra vocês aproveitarem no conteúdo.",
  ],
  aprovar_arte: [
    "Pergunte direto se ele conseguiu dar uma olhada na arte.",
    "Diga que a arte está pronta esperando o retorno dele pra subir.",
    "Pergunte se está tudo certo com a arte ou se ele quer ajustar algo antes.",
  ],
  promo_do_mes: [
    "Retome a pergunta da promoção lembrando que dá tempo de preparar com calma.",
    "Pergunte se já definiram a oferta, dizendo que a equipe pode ir adiantando as artes.",
    "Pergunte o que vai ser destaque no mês, pra já entrar no planejamento.",
  ],
  reengajar: [
    "Pergunte como está o movimento na loja.",
    "Pergunte se tem alguma novidade por aí que valha divulgar.",
    "Diga que faz um tempo que não conversam e pergunte como estão as coisas.",
  ],
  comemorar_post: [
    "Comemore o resultado e pergunte se ele quer mais conteúdo nessa linha.",
    "Conte o número e pergunte o que ele acha de repetir o formato.",
    "Destaque que esse tipo de post conversou com o público e pergunte a opinião dele.",
  ],
  oferecer_proximo: [
    "Reconheça o movimento da semana e pergunte o que ele quer divulgar na próxima.",
    "Diga que a semana rendeu e pergunte se tem novidade chegando.",
    "Pergunte o que ele quer colocar no ar em seguida.",
  ],
  presenca: [
    "Reforce que a equipe está acompanhando de perto e se coloque à disposição.",
    "Diga que está tudo sendo monitorado por aqui e pergunte se ele precisa de algo.",
    "Mostre que a gente segue de olho nos resultados e abra espaço pra qualquer pedido.",
  ],
};

/**
 * Varia por cliente, por semana E POR DIA DA SEMANA.
 *
 * O Roberto: "tomar cuidado com as variações das mensagens sendo segunda, quarta e sexta."
 * Estava errado: a chave era só cliente+semana, então quarta e sexta do MESMO cliente na MESMA
 * semana recebiam a MESMA frase. O cliente leria a mesma coisa duas vezes em três dias — o
 * oposto do que a variação existe pra resolver.
 */
export function variacaoPara(objetivo: Objetivo, clientId: string, dia: "quarta" | "sexta", agora = new Date()): string {
  const opcoes = VARIACOES[objetivo];
  const semana = Math.floor(agora.getTime() / (7 * 86400000));
  let h = semana;
  for (let i = 0; i < clientId.length; i++) h = (h * 31 + clientId.charCodeAt(i)) >>> 0;
  // O deslocamento do dia vai DEPOIS do hash. Antes ele entrava na semente e sumia na conta:
  // multiplicar por 31 a cada caractere fazia a diferença virar múltiplo do nº de opções, e
  // quarta e sexta caíam na MESMA frase. O teste pegou; o cálculo estava elegante e errado.
  return opcoes[(h + (dia === "sexta" ? 1 : 0)) % opcoes.length];
}

export interface Foco {
  objetivo: Objetivo;
  /** SÓ os fatos deste objetivo. É o que a IA vai ver. */
  fatos: string[];
  /** O que a mensagem tem que conseguir. */
  missao: string;
}

/**
 * Escolhe o assunto pela urgência real, não por quantidade de sinal.
 * Ordem: o que TRAVA o trabalho vem antes do que é conversa.
 */
export async function escolherFoco(s: SinaisCliente, clientId?: string): Promise<Foco> {
  // 1. Arte parada é o que mais custa: trabalho feito, esperando ele.
  //    ANTES DE COBRAR, lê o que ele falou no grupo desde que a arte foi pro lado dele. Se ele já
  //    respondeu (aprovou ou pediu ajuste) e ninguém mexeu no card, perguntar "deu uma olhada?"
  //    mostra que a gente não lê o que ele escreve. Na dúvida, não cobra.
  if (s.aguardandoAprovacao > 0) {
    let cobra = true;
    if (clientId && s.esperandoDesde) {
      const { clienteFalouDaArte } = await import("./leu-a-arte");
      const leitura = await clienteFalouDaArte(clientId, s.esperandoDesde);
      cobra = leitura.podeCobrar;
    }
    if (cobra) {
      return {
        objetivo: "aprovar_arte",
        fatos: [`${s.aguardandoAprovacao} arte(s) esperando o OK dele pra poder publicar`],
        missao: "Lembrar com leveza que tem arte esperando o retorno dele, e perguntar se pode publicar.",
      };
    }
    // Ele já se manifestou: segue pros outros objetivos, sem tocar no assunto da arte.
  }
  // 2. SEGUNDA DE LOJA. Vem antes de promoção/presença porque é o assunto que gera o conteúdo da
  //    semana inteira — perguntar na quinta já é tarde. Fica DEPOIS de arte parada (trabalho feito
  //    esperando ele custa mais) e depois do silêncio longo (não se pede nada a quem sumiu antes
  //    de reatar).
  if (s.pedirProdutosHoje && (s.diasSemFalar === null || s.diasSemFalar < 10)) {
    return {
      objetivo: "produtos_semana",
      fatos: [],
      missao: "Perguntar, de forma curta e aberta, o que chegou de novo na loja essa semana e se tem preço pra divulgar.",
    };
  }

  // 3. Silêncio longo: antes de pedir qualquer coisa, reatar contato.
  if (s.diasSemFalar !== null && s.diasSemFalar >= 10) {
    return {
      objetivo: "reengajar",
      fatos: [`ele não fala no grupo há ${s.diasSemFalar} dias`],
      missao: "Puxar conversa com carinho e perguntar como está o movimento da loja. SEM cobrar, sem citar os dias.",
    };
  }
  // 3. Post que foi bem de verdade (o piso de destaque já filtrou os fracos).
  if (s.destaqueIg) {
    return {
      objetivo: "comemorar_post",
      fatos: [`o post que mais engajou na semana teve ${s.destaqueIg.curtidas} curtidas e ${s.destaqueIg.comentarios} comentários`],
      missao: "Comemorar esse resultado e perguntar se ele quer explorar mais esse tipo de conteúdo.",
    };
  }
  // 4. Promoção do mês sem resposta — pergunta que a gente precisa da resposta.
  if (s.promoDoMesSemResposta) {
    return {
      objetivo: "promo_do_mes",
      fatos: ["a gente perguntou qual seria a promoção/oferta do mês e ele ainda não respondeu"],
      missao: "Retomar a pergunta da promoção do mês, uma vez, com jeito. É a única coisa da mensagem.",
    };
  }
  // 5. Rendeu a semana: reconhece e oferece o próximo.
  if (s.entreguesNaSemana > 0 || (s.postsNaSemana ?? 0) > 0) {
    const f: string[] = [];
    if (s.entreguesNaSemana > 0) f.push(`${s.entreguesNaSemana} arte(s) entregue(s) nos últimos 7 dias`);
    if ((s.postsNaSemana ?? 0) > 0) f.push(`${s.postsNaSemana} post(s) publicados no Instagram dele`);
    return {
      objetivo: "oferecer_proximo",
      fatos: f,
      missao: "Reconhecer o movimento da semana em UMA frase e perguntar o que ele quer divulgar na próxima.",
    };
  }
  // 6. PRESENÇA — nada pendente e ele está respondendo. Em vez do texto genérico de antes, a
  // mensagem mostra que a equipe está de olho e disponível. Foi o que o Roberto pediu pra quem
  // JÁ APROVOU: não citar arte, dar bom dia, falar do fechamento da semana, reforçar que a gente
  // acompanha a campanha e que estamos aqui pro que precisar.
  return {
    objetivo: "presenca",
    fatos: [],
    missao:
      "Mostrar presença: a equipe está acompanhando de perto e disponível. NÃO cite arte, número " +
      "nem pendência — não há nenhuma. Fale do momento da semana e se coloque à disposição.",
  };
}

export interface RevisaoMensagem {
  ok: boolean;
  motivo?: string;
}

/** Passa a mensagem pelos guarda-corpos. Exportado pra ser testável sem chamar a IA. */
export function revisarMensagem(texto: string, s: SinaisCliente): RevisaoMensagem {
  const t = (texto || "").trim();
  if (t.length < 20) return { ok: false, motivo: "curta demais" };
  if (t.length > 700) return { ok: false, motivo: "longa demais" };
  for (const re of PROIBIDO) {
    const m = t.match(re);
    if (m) return { ok: false, motivo: `assunto proibido: "${m[0]}"` };
  }
  const permitidos = numerosPermitidos(s);
  for (const n of t.match(/\d+/g) ?? []) {
    if (!permitidos.has(n)) return { ok: false, motivo: `número sem fonte: ${n}` };
  }

  // AFIRMAÇÃO sem fonte. Na primeira revisão a IA escreveu "temos uma arte esperando seu OK" pra
  // um cliente que NÃO tinha nenhuma, e chamou de "esperando o OK" duas artes que estavam
  // ENTREGUES. Checar número não pega isso — a frase inteira era falsa. Cada afirmação que o
  // cliente pode conferir precisa do sinal correspondente.
  const afirmaEsperandoOk = /(esperando|aguardando|falta).{0,24}(ok|aprova|seu aval)|(ok|aprova\w*).{0,20}(de voc[êe]s|seu)/i.test(t);
  if (afirmaEsperandoOk && s.aguardandoAprovacao === 0) {
    return { ok: false, motivo: "diz que tem arte esperando aprovação e não tem" };
  }
  const afirmaEntrega = /(entregam|entregue|arte nova|ficou pronta|prontinha)/i.test(t);
  if (afirmaEntrega && s.entreguesNaSemana === 0 && s.aguardandoAprovacao === 0) {
    return { ok: false, motivo: "fala de arte entregue e não houve entrega na semana" };
  }
  // O número pode ser LEGÍTIMO e a frase ainda ser falsa: "1 arte entregue" libera o "1", e a IA
  // usou esse mesmo "1" pra escrever "o post que mais bombou teve 1 curtida, que legal!". Se não
  // há destaque, a mensagem não fala de curtida/comentário — com número nenhum.
  if (!s.destaqueIg && /\d+\s*(curtida|like|coment|engajamento)/i.test(t)) {
    return { ok: false, motivo: "cita engajamento sem post em destaque" };
  }
  const afirmaPost = /(post\w*|publica\w+)/i.test(t);
  if (afirmaPost && !s.postsNaSemana && !s.destaqueIg && s.entreguesNaSemana === 0 && s.aguardandoAprovacao === 0) {
    return { ok: false, motivo: "fala de post publicado sem sinal de publicação" };
  }
  return { ok: true };
}

export interface MensagemCliente {
  texto: string;
  /** "ia" = escrita a partir dos sinais; "neutro" = caiu no texto padrão. */
  origem: "ia" | "neutro";
  motivoNeutro?: string;
  sinaisUsados: string[];
}

/**
 * Monta a mensagem do dia pro grupo do cliente.
 * `textoNeutro` é o fallback (o texto fixo de hoje) — usado quando não há assunto, a IA falha,
 * ou a mensagem não passa nos guarda-corpos.
 */
export async function montarMensagemCliente(
  clientId: string,
  textoNeutro: string,
  diaDaSemana: "quarta" | "sexta",
): Promise<MensagemCliente> {
  const sinais = await coletarSinais(clientId);
  const foco = await escolherFoco(sinais, clientId);

  if (!foco) {
    return { texto: textoNeutro, origem: "neutro", motivoNeutro: "sem assunto concreto", sinaisUsados: [] };
  }

  const estilo = await getEstiloCliente(clientId);
  const contexto = [
    `Dia: ${diaDaSemana}-feira.`,
    diaDaSemana === "quarta" ? "Meio de semana." : "Fechando a semana, fim de semana chegando.",
    "",
    `MISSÃO DESTA MENSAGEM: ${foco.missao}`,
    `JEITO DE DIZER (siga este, é o que evita repetir a mesma frase toda semana): ${variacaoPara(foco.objetivo, clientId, diaDaSemana)}`,
    "",
    foco.fatos.length
      ? "FATOS que você pode usar (não há outros; qualquer número fora daqui é invenção):"
      : "SEM FATOS pra citar: não invente número, entrega nem pendência. A mensagem é de relacionamento.",
    ...foco.fatos.map((f) => `- ${f}`),
    "",
    // O CONTEXTO DO DIA NÃO PODE SER A ABERTURA DE TODO MUNDO. Quando eu mandava "é sexta, fale
    // do fim de semana", a IA repetia quase literal: "Sexta-feira chegou e o fim de semana está
    // batendo à porta" saiu em 4 de 6 mensagens. Agora o dia é informação de fundo, e citar é
    // exceção — a abertura tem que vir do assunto do cliente, não do calendário.
    `Hoje é ${diaDaSemana}-feira. Isso é só contexto: NÃO comece a mensagem falando do dia nem do ` +
    `fim de semana — abra pelo assunto. Só mencione o dia se ele fizer diferença pro que você tem a dizer.`,
    "",
    "Escreva SÓ sobre a missão. Nenhum outro assunto entra.",
    estilo ? `\nComo o cliente costuma falar (use SÓ pra calibrar formalidade — não copie gírias): ${estilo.slice(0, 300)}` : "",
  ].filter(Boolean).join("\n");

  const r = await chatJson<{ mensagem: string }>({
    model: "gpt-4o-mini", system: SYSTEM, user: contexto,
    schema: SCHEMA, schemaName: "mensagem_cliente", maxTokens: 300,
  });
  if (!r.ok || !r.data?.mensagem) {
    return { texto: textoNeutro, origem: "neutro", motivoNeutro: r.ok ? "IA devolveu vazio" : `IA falhou: ${r.error}`, sinaisUsados: foco.fatos };
  }

  const rev = revisarMensagem(r.data.mensagem, sinais);
  if (!rev.ok) {
    return { texto: textoNeutro, origem: "neutro", motivoNeutro: rev.motivo, sinaisUsados: foco.fatos };
  }
  return { texto: r.data.mensagem.trim(), origem: "ia", sinaisUsados: foco.fatos };
}
