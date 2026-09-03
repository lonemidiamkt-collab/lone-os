// FECHAMENTO MENSAL — os números concretos da operação, por pessoa e por cliente.
//
// PRA QUE (Roberto, 02/09): "o social media tem que entregar não sei quantas artes por mês, então
// tem que mostrar se teve um cliente que não recebeu artes… quantos clientes teve arte, quantos
// não teve, quanto foi tempo de atraso. O designer é a mesma coisa. Parece que você não está
// conseguindo acertar nessas métricas."
//
// Ele está certo: o que eu tinha construído eram SCORES (0..100), úteis para enxergar tendência,
// mas não respondem "quem ficou sem arte em agosto". Isto aqui responde, com nome.
//
// ── AS DUAS FONTES, E POR QUE AS DUAS APARECEM ───────────────────────────
//
// Publicação e produção são coisas diferentes e vêm de lugares diferentes:
//   • PUBLICADO  → `client_ig_posts`, lido do Instagram do cliente. É a verdade sobre o que foi ao
//                  ar. Em agosto: 361 posts.
//   • REGISTRADO → `content_cards.designer_delivered_at`. É o que o time marcou no sistema. Em
//                  agosto: 34 artes.
//
// A distância entre 361 e 34 não é erro de cálculo: é o registro do desfecho que não volta ao
// sistema. Mostrar só o primeiro esconderia o problema de processo; mostrar só o segundo acusaria
// o time de não ter feito o que fez. Por isso os dois saem lado a lado, sempre.

export interface ClienteMes {
  clientId: string;
  cliente: string;
  responsavelSocial: string | null;
  responsavelDesigner: string | null;
  /** Posts que foram ao ar, do Instagram. */
  publicados: number;
  /** Meta do cliente (clients.posts_goal, hoje 12 para todos). */
  meta: number;
  /** Artes com entrega registrada no sistema no mês. */
  artesRegistradas: number;
  /** Artes que passaram do prazo combinado. */
  atrasadas: number;
  /** Dias de atraso somados, para a média da pessoa. */
  diasAtrasoTotal: number;
  /** true quando o cliente não teve NENHUM post no mês — o caso que ele quer ver primeiro. */
  semNenhumPost: boolean;
  /** true quando o Instagram não pôde ser lido: não é ausência de trabalho, é cegueira nossa. */
  ilegivel: boolean;
}

export interface FechamentoSocial {
  pessoa: string;
  clientes: number;
  comPost: number;
  semPost: number;
  /** Nomeados: é o que permite agir hoje. */
  clientesSemPost: string[];
  clientesAbaixoDaMeta: { cliente: string; publicados: number; meta: number }[];
  publicados: number;
  metaTotal: number;
  /** % da meta do mês. */
  atingimento: number;
  artesRegistradas: number;
  /** Quantos clientes o sistema não conseguiu ler — sai à parte, nunca como falha da pessoa. */
  ilegiveis: number;
}

export interface FechamentoDesigner {
  pessoa: string;
  artesEntregues: number;
  noPrazo: number;
  atrasadas: number;
  /** % entregue dentro do prazo. */
  pontualidade: number;
  /** Média de dias de atraso, contando SÓ as atrasadas — diluir com as pontuais esconde o tamanho. */
  diasMediosDeAtraso: number | null;
  piorAtraso: { cliente: string; titulo: string; dias: number } | null;
  clientesAtendidos: number;
}

const DIAS = 86_400_000;

/** Dias entre a entrega e o prazo. Positivo = atrasou. */
export function diasDeAtraso(entregueEm: string, prazo: string | null): number | null {
  if (!prazo) return null;   // sem prazo combinado não existe atraso — só expectativa
  const e = new Date(`${entregueEm.slice(0, 10)}T12:00:00Z`).getTime();
  const p = new Date(`${prazo.slice(0, 10)}T12:00:00Z`).getTime();
  return Math.round((e - p) / DIAS);
}

export function fecharSocial(clientes: ClienteMes[]): FechamentoSocial[] {
  const porPessoa = new Map<string, ClienteMes[]>();
  for (const c of clientes) {
    const k = c.responsavelSocial?.trim() || "sem responsável";
    (porPessoa.get(k) ?? porPessoa.set(k, []).get(k)!).push(c);
  }

  return [...porPessoa.entries()].map(([pessoa, cs]) => {
    // Cliente que a gente não consegue ler sai da conta de "sem post": contá-lo como zero seria
    // acusar a pessoa por uma pendência de acesso na Meta.
    const legiveis = cs.filter((c) => !c.ilegivel);
    const semPost = legiveis.filter((c) => c.semNenhumPost);
    const abaixo = legiveis.filter((c) => !c.semNenhumPost && c.publicados < c.meta);
    const publicados = legiveis.reduce((s, c) => s + c.publicados, 0);
    const metaTotal = legiveis.reduce((s, c) => s + c.meta, 0);
    return {
      pessoa,
      clientes: cs.length,
      comPost: legiveis.length - semPost.length,
      semPost: semPost.length,
      clientesSemPost: semPost.map((c) => c.cliente),
      clientesAbaixoDaMeta: abaixo
        .sort((a, b) => a.publicados - b.publicados)
        .map((c) => ({ cliente: c.cliente, publicados: c.publicados, meta: c.meta })),
      publicados,
      metaTotal,
      atingimento: metaTotal > 0 ? Math.round((publicados / metaTotal) * 100) : 0,
      artesRegistradas: cs.reduce((s, c) => s + c.artesRegistradas, 0),
      ilegiveis: cs.length - legiveis.length,
    };
  }).sort((a, b) => b.semPost - a.semPost || a.atingimento - b.atingimento);
}

export interface ArteEntregue {
  cliente: string;
  titulo: string;
  designer: string | null;
  entregueEm: string;
  prazo: string | null;
}

export function fecharDesigner(artes: ArteEntregue[]): FechamentoDesigner[] {
  const porPessoa = new Map<string, ArteEntregue[]>();
  for (const a of artes) {
    const k = a.designer?.trim() || "sem responsável";
    (porPessoa.get(k) ?? porPessoa.set(k, []).get(k)!).push(a);
  }

  return [...porPessoa.entries()].map(([pessoa, as]) => {
    const comPrazo = as.map((a) => ({ a, d: diasDeAtraso(a.entregueEm, a.prazo) }))
      .filter((x) => x.d !== null) as { a: ArteEntregue; d: number }[];
    const atrasadas = comPrazo.filter((x) => x.d > 0);
    const pior = [...atrasadas].sort((x, y) => y.d - x.d)[0];
    return {
      pessoa,
      artesEntregues: as.length,
      noPrazo: comPrazo.length - atrasadas.length,
      atrasadas: atrasadas.length,
      // Só as com prazo entram: arte sem data combinada não é pontual nem atrasada.
      pontualidade: comPrazo.length ? Math.round(((comPrazo.length - atrasadas.length) / comPrazo.length) * 100) : 0,
      diasMediosDeAtraso: atrasadas.length
        ? Math.round(atrasadas.reduce((s, x) => s + x.d, 0) / atrasadas.length)
        : null,
      piorAtraso: pior ? { cliente: pior.a.cliente, titulo: pior.a.titulo, dias: pior.d } : null,
      clientesAtendidos: new Set(as.map((a) => a.cliente)).size,
    };
  }).sort((a, b) => a.pontualidade - b.pontualidade);
}

/** Rótulo do mês, para título de tela e de PDF. */
export function rotuloMes(ano: number, mes: number): string {
  return new Date(Date.UTC(ano, mes - 1, 15)).toLocaleDateString("pt-BR", {
    month: "long", year: "numeric", timeZone: "UTC",
  });
}
