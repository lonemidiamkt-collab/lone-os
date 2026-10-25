// lib/tarefas/auto-marcar.ts — qual tarefa fechar quando alguém avisa no grupo que terminou. Módulo PURO.
//
// 25/10/2026 (auditoria de erro recuperável, 13.1). Antes bastava o NOME DO CLIENTE aparecer no aviso: "já fiz a
// arte da Imperio" fechava qualquer tarefa aberta da Imperio — até a de outra pessoa, sem palavra em comum — e o
// empate pegava a primeira de uma lista sem ordem. A tarefa saía da cobrança e o dono nem ficava sabendo.
//
// A regra agora:
//   • tarefa DE QUEM AVISOU: basta o cliente citado ou uma palavra do título;
//   • tarefa de OUTRA pessoa: só se o aviso CITA a tarefa — 2+ palavras do título além do nome do cliente
//     (palavra genérica como "arte" ou "post" não conta);
//   • o aviso cita outro cliente → aquela tarefa está fora;
//   • duas ou mais empatadas → pergunta qual foi, não marca nenhuma.
// O texto que vai para o grupo também mora aqui: sempre diz o título e o dono, e ensina a desfazer ("reabre").

export interface TarefaAberta {
  id: string;
  titulo: string;
  cliente: string | null;
  /** Pessoa responsável (papel genérico já resolvido pelo cliente). null = sem dono. */
  dono: string | null;
}

export type DecisaoTarefa =
  | { tipo: "marcar"; tarefa: TarefaAberta; porque: "do_autor" | "citou_a_tarefa" }
  | { tipo: "perguntar"; candidatas: TarefaAberta[] }
  | { tipo: "nada" };

const norm = (s: string | null | undefined) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const palavras = (s: string | null | undefined) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

// Palavras de trabalho que aparecem em quase todo título: sozinhas não identificam tarefa nenhuma.
const GENERICAS = new Set([
  "arte", "artes", "post", "posts", "card", "cards", "tarefa", "tarefas", "criar", "fazer", "feito", "feita",
  "pronto", "pronta", "para", "cliente", "demanda", "demandas", "conteudo", "conteudos", "terminei", "acabei",
]);

/** Mesma pessoa? Nome completo igual, ou o primeiro nome quando um dos lados só tem o primeiro nome. */
export function mesmaPessoa(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = palavras(a), pb = palavras(b);
  if (!pa.length || !pb.length) return false;
  if (pa.join(" ") === pb.join(" ")) return true;
  if ((pa.length === 1 || pb.length === 1) && pa[0] === pb[0]) return true;
  return false;
}

// Palavras de ramo que se repetem entre clientes ("Farmácia A", "Farmácia B"): sozinhas não dizem qual é o cliente.
const RAMO = new Set([
  "ltda", "comercio", "materiais", "construcao", "distribuidora", "loja", "lojas", "grupo", "group", "store", "studio",
  "clinica", "farmacia", "restaurante", "academia", "center", "centro", "servicos", "solucoes", "industria", "empresa",
  "oficial", "casa", "nova", "novo",
]);

/** O texto cita o cliente? O nome inteiro, ou uma palavra própria dele ("Imperio" em "Imperio Pisos"). */
function clienteNoTexto(cliente: string | null, texto: string): boolean {
  const c = palavras(cliente);
  if (!c.length) return false;
  const t = ` ${palavras(texto).join(" ")} `;
  if (c.join("").length >= 3 && t.includes(` ${c.join(" ")} `)) return true;
  return c.some((w) => w.length >= 4 && !RAMO.has(w) && !GENERICAS.has(w) && t.includes(` ${w} `));
}

export function escolherTarefaFeita(autor: string | null | undefined, referencia: string, abertas: readonly TarefaAberta[]): DecisaoTarefa {
  const ref = norm(referencia);
  if (ref.replace(/\s+/g, "").length < 3 || !abertas.length) return { tipo: "nada" };
  const refPalavras = new Set(palavras(ref).filter((w) => w.length >= 4 && !GENERICAS.has(w)));
  const clientesCitados = new Set(abertas.map((t) => t.cliente).filter((c): c is string => !!c && clienteNoTexto(c, ref)).map(norm));

  const pontuadas: { t: TarefaAberta; score: number; porque: "do_autor" | "citou_a_tarefa" }[] = [];
  for (const t of abertas) {
    const doAutor = !!autor && mesmaPessoa(autor, t.dono);
    const clienteCitado = clienteNoTexto(t.cliente, ref);
    // O aviso fala de OUTRO cliente: esta não é, por mais palavras que o título tenha em comum.
    if (!clienteCitado && clientesCitados.size > 0 && t.cliente) continue;
    const doCliente = new Set(palavras(t.cliente));
    let emComum = 0;
    for (const w of new Set(palavras(t.titulo))) {
      if (w.length >= 4 && !GENERICAS.has(w) && !doCliente.has(w) && refPalavras.has(w)) emComum++;
    }
    const citou = emComum >= 2;
    const doAutorBate = doAutor && (clienteCitado || emComum >= 1);
    if (!citou && !doAutorBate) continue;
    pontuadas.push({
      t,
      score: emComum * 2 + (clienteCitado ? 3 : 0) + (doAutor ? 2 : 0),
      porque: doAutorBate ? "do_autor" : "citou_a_tarefa",
    });
  }
  if (!pontuadas.length) return { tipo: "nada" };
  pontuadas.sort((a, b) => b.score - a.score);
  const topo = pontuadas.filter((p) => p.score === pontuadas[0].score);
  if (topo.length > 1) return { tipo: "perguntar", candidatas: topo.slice(0, 5).map((p) => p.t) };
  return { tipo: "marcar", tarefa: pontuadas[0].t, porque: pontuadas[0].porque };
}

// ─── O que vai para o grupo ────────────────────────────────────────────────

const deQuem = (t: TarefaAberta) => (t.dono ? ` (de ${t.dono})` : " (sem dono)");

/** Confirmação de que marcou. O título entre aspas é o que o "reabre" usa para achar a tarefa depois de um restart. */
export function textoMarquei(t: TarefaAberta): string {
  return `✅ Marquei *"${t.titulo}"*${deQuem(t)} como feita no sistema.\nNão era essa? Responda *reabre* citando esta mensagem.`;
}

export function textoPergunta(candidatas: readonly TarefaAberta[]): string {
  return [
    `Achei ${candidatas.length} tarefas abertas que podem ser essa — não marquei nenhuma:`,
    ...candidatas.map((t, i) => `${i + 1}) *"${t.titulo}"*${deQuem(t)}${t.cliente ? ` · ${t.cliente}` : ""}`),
    "Qual foi? Responda com o número citando esta mensagem.",
  ].join("\n");
}

export function textoReaberta(titulo: string, dono: string | null): string {
  return `↩️ Reabri *"${titulo}"*${dono ? ` (de ${dono})` : ""}. Ela volta para a cobrança.`;
}

/** Quem avisou não tem autoridade (ou a lista da equipe não carregou): diz por que não marcou. */
export function textoSemPermissao(naoConferi: boolean): string {
  return naoConferi
    ? "Não marquei a tarefa: não consegui conferir agora quem está falando (a lista da equipe não carregou). Tenta de novo em um minuto ou marque em Tarefas."
    : "Não marquei a tarefa: só quem está na Gestão da Equipe, com o WhatsApp cadastrado, mexe em tarefa por aqui. Marque em Tarefas.";
}

/** Não achou tarefa aberta que bata com o aviso. Só sai quando chamaram o agente pelo nome. */
export function textoNaoAchei(referencia: string): string {
  return `Não achei tarefa aberta que bata com "${referencia.slice(0, 80)}" — não marquei nada. Se for de outra pessoa, diga o nome da tarefa; ou marque em Tarefas.`;
}

/** A IA respondeu "vou marcar como feita"? Sem marcação de verdade, essa frase não pode sair. */
export function respostaPrometeMarcar(resposta: string): boolean {
  return /marc|feita|conclu/i.test(resposta || "");
}

// ─── Respostas citando a mensagem do agente ────────────────────────────────

export function ehPedidoReabrir(texto: string): boolean {
  return /^\s*(reabr[aei]\w*|desfa[zç]\w*|desmarc\w*|n[aã]o\s+era\s+essa)\b/i.test(texto || "");
}

/** "2", "a 2", "é a 2", "opção 2" → 2. Texto longo não é escolha. */
export function numeroEscolhido(texto: string): number | null {
  const t = (texto || "").trim();
  if (t.length > 20) return null;
  const m = t.match(/^(?:[ée]\s+)?(?:a\s+|op[cç][aã]o\s+)?(\d{1,2})\s*[.)!]?\s*$/i);
  return m ? Number(m[1]) : null;
}

/** Título da confirmação citada ("✅ Marquei *"X"* …"). */
export function tituloDaConfirmacao(citado: string | null | undefined): string | null {
  const m = (citado || "").match(/Marquei \*?"([^"]+)"\*?/);
  return m ? m[1] : null;
}

/** Opções da pergunta citada ("1) *"X"* (de Fulano)…"), na ordem. */
export function opcoesDaPergunta(citado: string | null | undefined): string[] {
  const out: string[] = [];
  for (const linha of (citado || "").split("\n")) {
    const m = linha.match(/^\s*(\d{1,2})\)\s*\*?"([^"]+)"/);
    if (m) out[Number(m[1]) - 1] = m[2];
  }
  return out.filter((x) => typeof x === "string");
}

export function ehPerguntaDeTarefa(citado: string | null | undefined): boolean {
  return /tarefas abertas que podem ser essa/.test(citado || "");
}
