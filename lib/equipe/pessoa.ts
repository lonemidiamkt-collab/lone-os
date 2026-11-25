// lib/equipe/pessoa.ts — "é a mesma pessoa?" num lugar só. Puro (tests/equipe-pessoa.test.ts).
//
// Cliente, card, pedido de arte e tarefa guardam o NOME de quem cuida. As telas comparavam com ===: um
// acento, um espaço no fim ou uma maiúscula a mais e a pessoa sumia do próprio quadro, sem erro na tela
// (25/11/2026, Onda 1.2). Aqui a comparação ignora acento, caixa e espaço. "Mateus" e "Matheus" NÃO são
// iguais de propósito: grafia diferente se resolve renomeando em Equipe, que propaga para os registros.

export function chaveDaPessoa(nome: string | null | undefined): string {
  return (nome ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Vazio não é igual a vazio: "ninguém" não é uma pessoa. */
export function mesmaPessoa(a: string | null | undefined, b: string | null | undefined): boolean {
  const k = chaveDaPessoa(a);
  return !!k && k === chaveDaPessoa(b);
}

/**
 * Quem da equipe é este nome gravado: o nome por extenso ou, se for uma palavra só, o primeiro nome quando
 * só UMA pessoa tem esse primeiro nome ("Davi" com dois Davis na equipe não é ninguém).
 */
export function membroDaEquipe<T extends { name: string }>(nome: string | null | undefined, equipe: readonly T[]): T | null {
  const k = chaveDaPessoa(nome);
  if (!k) return null;
  const exato = equipe.find((m) => chaveDaPessoa(m.name) === k);
  if (exato) return exato;
  if (k.includes(" ")) return null;
  const pelo1o = equipe.filter((m) => chaveDaPessoa(m.name).split(" ")[0] === k);
  return pelo1o.length === 1 ? pelo1o[0] : null;
}

export interface OpcaoDePessoa { valor: string; rotulo: string }

/**
 * As opções do campo de responsável. O nome GRAVADO sempre aparece: sem isto, quem saiu da equipe, mudou de
 * função ou está com outra grafia abria o campo em branco — e salvar em branco apagava a pessoa.
 */
export function opcoesDePessoa(gravado: string | null | undefined, candidatos: readonly { name: string }[]): OpcaoDePessoa[] {
  const opcoes = candidatos.map((m) => ({ valor: m.name, rotulo: m.name }));
  const g = (gravado ?? "").trim() ? (gravado as string) : "";
  if (!g || opcoes.some((o) => o.valor === g)) return opcoes;
  const parecido = membroDaEquipe(g, candidatos);
  return [{ valor: g, rotulo: parecido ? `${g.trim()} (grafia diferente de ${parecido.name})` : `${g.trim()} (fora da equipe)` }, ...opcoes];
}

/** Distância de edição (quantas letras mudam), limitada: acima de 3 não interessa. */
function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 4;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const linha = [i];
    for (let j = 1; j <= b.length; j++) {
      linha[j] = Math.min(anterior[j] + 1, linha[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    anterior = linha;
  }
  return anterior[b.length];
}

/**
 * Nomes gravados que podem ser a pessoa com outra grafia ("Mateus" × "Matheus", sobrenome a mais). Só aponta
 * para alguém conferir — nunca junta sozinho. Nome que é de OUTRA pessoa da equipe não entra.
 */
export function nomesParecidos(nome: string, gravados: readonly (string | null | undefined)[], equipe: readonly { name: string }[]): string[] {
  const eu = chaveDaPessoa(nome);
  const meu1o = eu.split(" ")[0];
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const g of gravados) {
    const k = chaveDaPessoa(g);
    if (!k || k === eu || vistos.has(k)) continue;
    vistos.add(k);
    if (equipe.some((m) => mesmaPessoa(m.name, g) && !mesmaPessoa(m.name, nome))) continue;
    const dele1o = k.split(" ")[0];
    const perto = meu1o === dele1o || (Math.min(meu1o.length, dele1o.length) >= 4 && distancia(meu1o, dele1o) <= 2);
    if (perto) saida.push((g as string).trim());
  }
  return saida;
}
