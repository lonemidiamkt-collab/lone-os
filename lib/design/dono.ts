// lib/design/dono.ts — DE QUEM É A DEMANDA. Regra única, pura, usada pelo board do designer e por
// quem for cobrar entrega.
//
// Roberto (10/09/2026): "quero isso separado, pois o designer Rhodrigo está vendo as coisas do
// designer Gabriel. até pode ter um botão para ver o quadro do outro (...) para que quando um deles
// precise de ajuda o outro possa ajudar."
//
// Duas regras nessa frase, e elas são diferentes: QUEM É O DONO (a carteira decide) e QUEM PODE
// OLHAR (todo mundo, quando precisa ajudar). Este arquivo responde só a primeira — a segunda é da
// interface, e é de propósito: esconder o quadro do colega quebraria o pedido de ajuda.

import { chaveDaPessoa, mesmaPessoa } from "@/lib/equipe/pessoa";

/** Demanda com o mínimo que a regra precisa. */
export interface DemandaComDono {
  clientId: string;
  /** Preenchido = alguém assumiu esta demanda específica. Vazio = vale a carteira. */
  assignedDesigner?: string | null;
}

/** Cliente com o dono da carteira. */
export interface ClienteComDesigner {
  id: string;
  assignedDesigner?: string | null;
}

export const SEM_DONO = "(sem designer)";

/**
 * O designer responsável por uma demanda.
 *
 * A atribuição explícita vence a carteira: é assim que "o Gabriel pegou uma do Rodrigo hoje" fica
 * registrado sem mexer no cadastro do cliente. Sem nenhuma das duas, devolve `null` — e null NÃO é
 * "de ninguém", é "não sei": a demanda tem que aparecer em algum lugar, senão some do sistema.
 */
export function donoDaDemanda(
  demanda: DemandaComDono,
  clientes: ReadonlyArray<ClienteComDesigner>,
): string | null {
  const explicito = (demanda.assignedDesigner ?? "").trim();
  if (explicito) return explicito;
  const cli = clientes.find((c) => c.id === demanda.clientId);
  const daCarteira = (cli?.assignedDesigner ?? "").trim();
  return daCarteira || null;
}

/**
 * A demanda pertence ao quadro de `designer`?
 *
 * `"Todos"` vê tudo, inclusive as sem dono — se elas só aparecessem no quadro de alguém, ninguém
 * descobriria que existem clientes sem designer atribuído (são 11 hoje).
 */
export function ehDoQuadro(
  demanda: DemandaComDono,
  clientes: ReadonlyArray<ClienteComDesigner>,
  designer: string,
): boolean {
  if (!designer || designer === "Todos") return true;
  const dono = donoDaDemanda(demanda, clientes);
  if (designer === SEM_DONO) return dono === null;
  return mesmaPessoa(dono, designer);
}

/**
 * Um nome por pessoa: "José", "Jose " e "JOSÉ" gravados em registros diferentes são UM quadro só (o rótulo
 * é a primeira grafia encontrada). Antes cada grafia virava um quadro e o trabalho se dividia.
 */
function nomesDosQuadros(
  demandas: ReadonlyArray<DemandaComDono>,
  clientes: ReadonlyArray<ClienteComDesigner>,
): Map<string, string> {
  const nomes = new Map<string, string>();
  const somar = (n: string | null | undefined) => {
    const nome = (n ?? "").trim();
    const k = chaveDaPessoa(nome);
    if (k && !nomes.has(k)) nomes.set(k, nome);
  };
  for (const d of demandas) somar(donoDaDemanda(d, clientes));
  // Designer da carteira sem demanda nenhuma ainda também merece quadro — senão ele abre o painel
  // no primeiro dia e não se encontra na lista.
  for (const c of clientes) somar(c.assignedDesigner);
  return nomes;
}

/**
 * Os quadros que existem, na ordem em que aparecem no seletor.
 *
 * Sai do DADO, não de uma lista escrita no código: no dia em que entrar um terceiro designer, o
 * quadro dele nasce sozinho. Foi exatamente o que não aconteceu quando o Gabriel entrou.
 */
export function quadrosDisponiveis(
  demandas: ReadonlyArray<DemandaComDono>,
  clientes: ReadonlyArray<ClienteComDesigner>,
): string[] {
  const temOrfa = demandas.some((d) => donoDaDemanda(d, clientes) === null);
  const ordenados = [...nomesDosQuadros(demandas, clientes).values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return temOrfa ? [...ordenados, SEM_DONO] : ordenados;
}

/** Quantas demandas abertas cada quadro tem — para mostrar no seletor. */
export function contagemPorQuadro(
  demandas: ReadonlyArray<DemandaComDono & { status?: string }>,
  clientes: ReadonlyArray<ClienteComDesigner>,
): Record<string, number> {
  const out: Record<string, number> = {};
  const nomes = nomesDosQuadros(demandas, clientes);
  for (const d of demandas) {
    if (d.status === "done") continue;
    const gravado = donoDaDemanda(d, clientes);
    const dono = gravado ? nomes.get(chaveDaPessoa(gravado)) ?? gravado : SEM_DONO;
    out[dono] = (out[dono] ?? 0) + 1;
  }
  return out;
}
