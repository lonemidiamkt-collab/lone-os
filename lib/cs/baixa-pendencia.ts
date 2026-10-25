// lib/cs/baixa-pendencia.ts — "Lone, o X já mandou as fotos": QUAL pendência sai. PURO
// (tests/cs-baixa-pendencia.test.ts); o inbound lê e grava client_journey.
//
// POR QUE (25/10/2026, auditoria de erro recuperável, 11.11). A baixa casava qualquer palavra de 4+
// letras da mensagem com qualquer palavra da pendência — "mandou", "cliente", o próprio nome do cliente
// — e tirava várias de uma vez, sem perguntar. O upsert não era conferido e a resposta dizia "✅ Baixa
// dada" mesmo quando não gravou; a leitura que falhava virava "não tem pendência registrada 👍". E não
// havia volta.
//
// Agora: só conta palavra que diz O QUE foi entregue (sem as do comando e sem o nome do cliente); uma
// pendência clara sai; duas ou mais empatadas → pergunta qual; "todas" tira todas. A confirmação diz
// como desfazer.

export interface Pendencia { item: string; desde?: string; impacto?: string }

const norm = (x: string) => (x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const palavras = (x: string) => norm(x).split(/[^a-z0-9]+/).filter(Boolean);

// Palavras do PEDIDO de baixa — aparecem em toda mensagem, não dizem qual pendência é.
const DO_COMANDO = new Set([
  "lone", "loninho", "pendencia", "pendencias", "tira", "tirar", "remove", "remover", "baixa", "dar", "deu", "dei",
  "resolvido", "resolvida", "resolveu", "entregou", "mandou", "enviou", "chegou", "recebi", "recebemos", "cliente",
  "ja", "pode", "favor", "obrigado", "agora", "hoje", "ontem", "isso", "essa", "esse", "dele", "dela", "deles",
  "pra", "para", "com", "que", "nos", "nao", "tudo", "todas", "todos", "sobre", "aqui", "certo", "beleza", "mais",
]);

export type EscolhaBaixa =
  | { tipo: "uma"; pendencia: Pendencia }
  | { tipo: "todas" }
  | { tipo: "varias"; candidatas: Pendencia[] }
  | { tipo: "nenhuma" };

/** Qual pendência a mensagem tira. `nomeCliente` sai da conta (o nome não diz o que foi entregue). */
export function escolherPendencia(texto: string, pendencias: Pendencia[], nomeCliente: string): EscolhaBaixa {
  if (!pendencias.length) return { tipo: "nenhuma" };
  const doNome = new Set(palavras(nomeCliente));
  const tokens = palavras(texto).filter((w) => w.length >= 4 && !DO_COMANDO.has(w) && !doNome.has(w));
  if (/\b(todas|tudo|todos os itens|todas as pend)/.test(norm(texto))) return { tipo: "todas" };

  const casa = (w: string) => tokens.some((t) => t === w || (t.length >= 4 && w.length >= 4 && (t.startsWith(w) || w.startsWith(t))));
  const pontos = pendencias.map((p) => ({
    p, n: palavras(p.item).filter((w) => w.length >= 4 && !DO_COMANDO.has(w) && !doNome.has(w) && casa(w)).length,
  })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);

  if (!pontos.length) return pendencias.length === 1 ? { tipo: "uma", pendencia: pendencias[0] } : { tipo: "nenhuma" };
  if (pontos.length === 1 || pontos[0].n > pontos[1].n) return { tipo: "uma", pendencia: pontos[0].p };
  return { tipo: "varias", candidatas: pontos.filter((x) => x.n === pontos[0].n).map((x) => x.p) };
}

/** Pergunta qual — com a lista para a pessoa responder pelo nome. */
export function textoQualPendencia(cliente: string, lista: Pendencia[], todas: Pendencia[]): string {
  const opcoes = lista.length ? lista : todas;
  return `Qual pendência do *${cliente}* eu tiro?\n${opcoes.map((p, i) => `${i + 1}. ${p.item}`).join("\n")}\n\nResponde "Lone, o ${cliente} já mandou <a pendência>" (ou "…todas").`;
}

export function textoBaixaDada(cliente: string, baixadas: Pendencia[], restantes: Pendencia[]): string {
  return `✅ Baixa dada nas pendências do *${cliente}*: ${baixadas.map((p) => `*${p.item}*`).join(", ")}.`
    + (restantes.length ? `\nAinda falta: ${restantes.map((p) => p.item).join(" · ")}` : `\nO *${cliente}* está sem pendências agora. 🎯`)
    + "\nErrei? Responde *desfaz* citando esta mensagem que eu volto.";
}

/** Desfazer: devolve as que saíram, sem duplicar o que alguém já tinha posto de volta. */
export function devolverPendencias(atuais: Pendencia[], baixadas: Pendencia[]): Pendencia[] {
  const tem = new Set(atuais.map((p) => norm(p.item).trim()));
  return [...atuais, ...baixadas.filter((p) => !tem.has(norm(p.item).trim()))];
}
