// lib/cs/digest.ts — DOIS BLOCOS por dia, no lugar da enxurrada.
//
// O que a varredura achou: 17 crons postam no MESMO grupo interno. Numa segunda de manhã o time
// recebe ~12 mensagens antes do almoço — bom-dia, postagem, datas, pendências, tarefas (×2),
// roteiro, esfriando, autoavaliação, risco, saúde… cada uma um template fixo, várias listando
// 33-37 nomes de cliente. Alerta que dispara pra quase toda a carteira não é sinal, é ruído: a
// taxa de decisão das sugestões é 36% e o time aprendeu a ignorar.
//
// Aqui a lógica vira: junta tudo em ITENS DE AÇÃO, agrupa por QUEM precisa agir, e corta o
// excedente ("+N no painel") em vez de despejar a carteira inteira.
//
//   Manhã       → o que fazer hoje
//   Fim de tarde → o que ficou pendente + o que preparar pra amanhã
//
// Módulo PURO (sem banco, sem IA, sem rede) — a rota junta os dados e chama daqui.

export type Bloco = "manha" | "tarde";

export interface ItemAcao {
  /** Quem precisa agir. null = ninguém atribuído (cai em "sem dono", que é um problema por si só). */
  responsavel: string | null;
  cliente?: string;
  /** A frase da ação, já pronta. Curta: o time lê no celular. */
  texto: string;
  /** Quanto pesa. Ordena dentro da pessoa e decide quem sobrevive ao corte. */
  peso: number;
}

/** Acima disso vira "+N no painel" — a parede de nomes era o principal motivo do time desligar. */
const MAX_POR_PESSOA = 5;
const SEM_DONO = "Sem responsável";

const plural = (n: number, um: string, muitos: string) => (n === 1 ? um : muitos);

function agrupar(itens: ItemAcao[]): Map<string, ItemAcao[]> {
  const por = new Map<string, ItemAcao[]>();
  for (const it of itens) {
    const k = it.responsavel?.trim() || SEM_DONO;
    const arr = por.get(k) ?? [];
    arr.push(it);
    por.set(k, arr);
  }
  for (const [, arr] of por) arr.sort((a, b) => b.peso - a.peso);
  return por;
}

/** Ordena as pessoas pelo item mais pesado que cada uma tem (quem tem fogo aparece primeiro). */
function ordenarPessoas(por: Map<string, ItemAcao[]>): string[] {
  return [...por.keys()].sort((a, b) => {
    if (a === SEM_DONO) return 1; // "sem dono" fecha a lista
    if (b === SEM_DONO) return -1;
    return (por.get(b)![0]?.peso ?? 0) - (por.get(a)![0]?.peso ?? 0);
  });
}

function blocoPorPessoa(itens: ItemAcao[]): string[] {
  const por = agrupar(itens);
  const linhas: string[] = [];
  for (const pessoa of ordenarPessoas(por)) {
    const lista = por.get(pessoa)!;
    const n = lista.length;
    linhas.push(`*${pessoa}* — ${n} ${plural(n, "coisa", "coisas")}`);
    for (const it of lista.slice(0, MAX_POR_PESSOA)) {
      linhas.push(`• ${it.cliente ? `_${it.cliente}_ — ` : ""}${it.texto}`);
    }
    if (n > MAX_POR_PESSOA) linhas.push(`• _…e mais ${n - MAX_POR_PESSOA} — tá tudo no painel_`);
    linhas.push("");
  }
  return linhas;
}

export interface DigestInput {
  /** O que precisa de ação. Já vem montado pela rota a partir do snapshot. */
  itens: ItemAcao[];
  /** Números de contexto — viram UMA linha, não uma seção cada. */
  contexto?: { emProducao?: number; aguardandoAprovacao?: number; encalhados?: number; novosHoje?: number };
  /** Datas comemorativas próximas (o radar continua, só deixa de ser mensagem separada). */
  datas?: string[];
  /** Só no bloco da tarde: o que preparar pra amanhã. */
  amanha?: string[];
}

const saudacao = (bloco: Bloco, dia: string) =>
  bloco === "manha" ? `☀️ *Bom dia, time!* — ${dia}` : `🌙 *Fechando o dia* — ${dia}`;

/**
 * Monta a mensagem do bloco. Devolve string vazia quando não há NADA a dizer — dia limpo não
 * merece mensagem. (Antes, cada um dos 12 crons mandava a sua mesmo sem novidade.)
 */
export function montarDigest(bloco: Bloco, dia: string, inp: DigestInput): string {
  const { itens, contexto, datas, amanha } = inp;
  const temItem = itens.length > 0;
  const temAmanha = bloco === "tarde" && !!amanha?.length;
  const temData = !!datas?.length;
  if (!temItem && !temAmanha && !temData) return "";

  const l: string[] = [saudacao(bloco, dia), ""];

  if (temItem) {
    l.push(bloco === "manha" ? "*Pra hoje:*" : "*Ficou pendente:*", "");
    l.push(...blocoPorPessoa(itens));
  } else {
    l.push(bloco === "manha" ? "Nada pegando fogo hoje. 🙌" : "Nada ficou pendente hoje. 🙌", "");
  }

  // Contexto vira UMA linha — antes cada número desses era uma mensagem inteira.
  if (contexto) {
    const partes: string[] = [];
    if (contexto.emProducao) partes.push(`*${contexto.emProducao}* em produção`);
    if (contexto.aguardandoAprovacao) partes.push(`*${contexto.aguardandoAprovacao}* aguardando aprovação`);
    if (contexto.novosHoje) partes.push(`*${contexto.novosHoje}* ${plural(contexto.novosHoje, "card novo", "cards novos")} hoje`);
    if (contexto.encalhados) partes.push(`*${contexto.encalhados}* encalhados (+30d)`);
    if (partes.length) l.push(`📊 ${partes.join(" · ")}`, "");
  }

  if (temAmanha) {
    l.push("*Pra amanhã:*");
    for (const a of amanha!.slice(0, 6)) l.push(`• ${a}`);
    if (amanha!.length > 6) l.push(`• _…e mais ${amanha!.length - 6}_`);
    l.push("");
  }

  if (temData) {
    for (const d of datas!.slice(0, 2)) l.push(`📅 ${d}`);
    l.push("");
  }

  l.push(bloco === "manha" ? "Bora que hoje rende! 🤝" : "Valeu, time. Amanhã a gente continua. 🤝");
  return l.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
