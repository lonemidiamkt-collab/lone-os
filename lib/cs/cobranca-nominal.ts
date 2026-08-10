// lib/cs/cobranca-nominal.ts — o bom-dia deixa de ser mural e passa a ter destinatário.
//
// O PROBLEMA (Roberto, 03/08): "tudo tem o mesmo peso e nada tem dono". O digest dizia
// "✅ 50 arte(s) PRONTA(S) do designer só esperando vocês postarem" — para o grupo inteiro, todo
// dia, no mesmo tom. Ninguém se sente dono de um número. As 55 vencidas com arte pronta estavam
// lá havia semanas justamente por isso.
//
// A MUDANÇA: os mesmos fatos, agrupados por QUEM resolve, com o item mais velho primeiro. Cada um
// lê o próprio nome e vê três coisas concretas, não um total.
//
// DUAS DECISÕES QUE IMPORTAM:
//
// 1. SEM DONO É SEÇÃO, NÃO É SILÊNCIO. Item sem responsável não pode sumir do digest — é
//    exatamente o que apodrece, porque cada um assume que é do outro. Aparece com nome próprio:
//    "sem dono".
//
// 2. ESCALAR É POR TEMPO, NÃO POR VOLUME. Dez itens de 2 dias é operação normal; um item de 18
//    dias é problema. Só o que passa do limite sobe pro Roberto — senão a escalada vira o mesmo
//    ruído que ela veio resolver.

import type { SnapshotCS } from "@/lib/cs/snapshot";

/** A partir daqui não é fila, é problema: sobe pra gestão junto com o nome de quem está com ele. */
export const DIAS_PRA_ESCALAR = 10;

/** Quantos itens mostrar por pessoa. Mais que isso a pessoa lê como lista e não como tarefa. */
const POR_PESSOA = 3;

export interface ItemCobranca {
  dono: string | null;
  cliente: string;
  /** O que fazer, já em verbo — "postar", "mandar pro cliente", "dar um oi". */
  acao: string;
  dias: number;
}

export interface BlocoDono {
  dono: string;
  itens: ItemCobranca[];
  /** Quantos ficaram de fora do corte (aparece como "+N"). */
  resto: number;
  /** O mais velho dele — usado pra ordenar as pessoas e pra decidir escalada. */
  maiorEspera: number;
}

const SEM_DONO = "sem dono";

/**
 * Mesma pessoa, grafias diferentes. O snapshot encurta o dono dos CARDS pro primeiro nome
 * (primeiroNome(social_media)) e mantém o nome completo nas PENDÊNCIAS — então "Carlos" e
 * "Carlos Augusto" viravam dois blocos no digest, com o mesmo sujeito cobrado duas vezes.
 *
 * Não dá pra só cortar no primeiro nome: existe "Carlos Melo" nos cards antigos, que colidiria
 * com o Carlos Augusto e juntaria trabalho de duas pessoas. Por isso a canonização casa contra
 * o TIME REAL, e só encurta quando o primeiro nome pertence a exatamente um integrante.
 */
/**
 * Quem saiu, e quem herdou a carteira. Item antigo continua marcado com o nome de quem estava
 * na cadeira — a cobrança tem que ir pra quem está nela HOJE, senão o agente cobra um fantasma
 * e o trabalho fica sem dono.
 *
 * Não é o mesmo que reescrever o histórico: o registro do que a pessoa fez continua com o nome
 * dela. Isto aqui é só pra onde a cobrança de hoje deve chegar.
 */
const SUCESSAO: Record<string, string> = {
  "pedro henrique": "Thiago",   // saiu em 10/08/2026; Thiago assumiu os 17 clientes
};

export function canonizarDono(nome: string | null, time: string[]): string | null {
  const n = (nome ?? "").trim();
  if (!n) return null;
  const herdeiro = SUCESSAO[n.toLowerCase()];
  if (herdeiro) return herdeiro;
  const igual = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  // Já é alguém do time, escrito por extenso.
  const exato = time.find((t) => igual(t, n));
  if (exato) return exato;
  // É o primeiro nome de alguém — só vale se não houver dois com o mesmo primeiro nome.
  const candidatos = time.filter((t) => igual(t.split(/\s+/)[0], n));
  if (candidatos.length === 1) return candidatos[0];
  // Nome que não é do time (ex.: "Carlos Melo", que saiu) fica como veio — some seria pior.
  return n;
}

/** Junta o que precisa de ação HOJE, de todas as origens, com o verbo já decidido. */
export function coletarItens(snap: SnapshotCS): ItemCobranca[] {
  const itens: ItemCobranca[] = [];

  // Arte pronta parada: o designer entregou e o social não postou. É o maior volume hoje.
  for (const p of snap.prontasPraPostar) {
    itens.push({ dono: p.responsavel, cliente: p.cliente, acao: "confirmar e postar a arte", dias: p.dias });
  }
  // Prazo vencido COM arte pronta — mesma ação, mas já estourou o prazo.
  for (const a of snap.atrasados) {
    if (!a.designerEntregou) continue; // sem arte é fila do designer, não cobrança do social
    itens.push({ dono: a.responsavel, cliente: a.cliente, acao: "postar (prazo vencido)", dias: a.dias });
  }
  // Pendência esperando ok/não. Sem resposta ela não vira card e o agente não aprende.
  for (const p of snap.pendentes) {
    itens.push({ dono: p.responsavel, cliente: p.cliente, acao: `responder ok/não — ${p.tipo}`, dias: p.dias });
  }
  // Cliente que sumiu do grupo.
  for (const e of snap.esfriando) {
    itens.push({ dono: null, cliente: e.cliente, acao: 'dar um "oi" — sumiu do grupo', dias: e.dias });
  }

  return itens;
}

/** Remove o duplicado: o mesmo cliente pode aparecer como "pronta" e como "vencida". Fica o pior. */
function semRepetir(itens: ItemCobranca[]): ItemCobranca[] {
  const melhor = new Map<string, ItemCobranca>();
  for (const i of itens) {
    const k = `${i.dono ?? SEM_DONO}|${i.cliente.toLowerCase()}`;
    const atual = melhor.get(k);
    if (!atual || i.dias > atual.dias) melhor.set(k, i);
  }
  return [...melhor.values()];
}

/** Agrupa por dono, o mais velho primeiro — dentro da pessoa e entre pessoas. */
export function agruparPorDono(itens: ItemCobranca[], time: string[] = []): BlocoDono[] {
  const canonizados = itens.map((i) => ({ ...i, dono: canonizarDono(i.dono, time) }));
  const mapa = new Map<string, ItemCobranca[]>();
  for (const i of semRepetir(canonizados)) {
    const k = i.dono?.trim() || SEM_DONO;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k)!.push(i);
  }

  const blocos: BlocoDono[] = [];
  for (const [dono, lista] of mapa) {
    lista.sort((a, b) => b.dias - a.dias);
    blocos.push({
      dono,
      itens: lista.slice(0, POR_PESSOA),
      resto: Math.max(0, lista.length - POR_PESSOA),
      maiorEspera: lista[0]?.dias ?? 0,
    });
  }
  // Quem tem o item mais velho aparece primeiro. "sem dono" vai pro fim: é recado pro time todo,
  // não cobrança de alguém — mas continua visível.
  blocos.sort((a, b) => {
    if ((a.dono === SEM_DONO) !== (b.dono === SEM_DONO)) return a.dono === SEM_DONO ? 1 : -1;
    return b.maiorEspera - a.maiorEspera;
  });
  return blocos;
}

/** O que passou do limite — vai num aviso separado pra gestão, com o nome de quem está segurando. */
export function paraEscalar(blocos: BlocoDono[]): { dono: string; cliente: string; dias: number }[] {
  const fora: { dono: string; cliente: string; dias: number }[] = [];
  for (const b of blocos) {
    for (const i of b.itens) {
      if (i.dias >= DIAS_PRA_ESCALAR) fora.push({ dono: b.dono, cliente: i.cliente, dias: i.dias });
    }
  }
  return fora.sort((a, b) => b.dias - a.dias);
}

/** A seção do bom-dia. "" quando não há nada — digest sem cobrança é digest bom. */
export function textoPorDono(blocos: BlocoDono[]): string {
  if (!blocos.length) return "";
  const l: string[] = ["", "*O que é de cada um hoje:*"];
  for (const b of blocos) {
    const titulo = b.dono === SEM_DONO ? "_sem dono_" : `*${b.dono}*`;
    l.push("", `👤 ${titulo}`);
    for (const i of b.itens) {
      // 🔴 só no que passou do limite: se tudo é urgente, nada é.
      const marca = i.dias >= DIAS_PRA_ESCALAR ? "🔴" : "•";
      l.push(`${marca} ${i.cliente} — ${i.acao} (${i.dias}d)`);
    }
    if (b.resto) l.push(`_+${b.resto} outro(s)_`);
  }
  return l.join("\n");
}

/** Aviso curto pra gestão. "" quando nada passou do limite. */
export function textoEscalada(fora: { dono: string; cliente: string; dias: number }[]): string {
  if (!fora.length) return "";
  const l = [`⚠️ *Passou de ${DIAS_PRA_ESCALAR} dias* — ${fora.length} item(ns):`];
  for (const f of fora.slice(0, 8)) l.push(`• ${f.cliente} — ${f.dias}d (${f.dono})`);
  if (fora.length > 8) l.push(`_…e mais ${fora.length - 8}._`);
  return l.join("\n");
}
