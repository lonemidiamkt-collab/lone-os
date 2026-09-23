// lib/design/atribuicao.ts — TODA DEMANDA NASCE COM DONO.
//
// Rodrigo (23/09/2026): "Edumar não aparece na aba dos meus clientes (demandas) depois corrige pra
// mim pfv. Esse cliente tenho que procurar a demanda dele ou Thiago me avisa no pv que subiu."
//
// O QUE ESTAVA ACONTECENDO. O quadro do designer resolve o dono por `clients.assigned_designer`
// (lib/design/dono.ts). Cliente sem esse campo → a demanda cai no quadro "(sem designer)", que
// ninguém abre: o designer entra no sistema e o seletor já vem no nome dele. A demanda existe,
// está na fila, e é invisível pra quem tem que fazer. Foram 26 assim — 23 só do Edumar.
//
// POR QUE NÃO BASTA PREENCHER A CARTEIRA. Quase todos esses clientes são só de tráfego, e o
// Roberto já decidiu que cliente de tráfego NÃO entra na redistribuição de carteira do designer
// (22/09) — carteira de designer é do Lone Growth. Só que cliente de tráfego também pede arte:
// criativo de anúncio. Então o dono não pode vir da carteira aqui; tem que ser resolvido na
// própria demanda, que é o que `design_requests.assigned_designer` já sabia guardar e ninguém
// preenchia.
//
// E POR QUE NÃO UM AVISO. Já existia o aviso: desde 16/09 a tela mostra "não tem designer no
// cadastro, defina na ficha do cliente". Ninguém definiu em 7 dias, e as demandas continuaram
// caindo no vazio — o contorno manual não é plano. Aqui o sistema escolhe e registra por quê.

/** Um designer que pode receber demanda. */
export interface DesignerDisponivel {
  nome: string;
  /** Demandas abertas hoje. É o critério de carga. */
  abertas: number;
  /** Ausente (férias, licença) até esta data ISO. Vazio = disponível. */
  indisponivelAte?: string | null;
}

/** Quantas demandas deste cliente cada designer já entregou. */
export interface HistoricoDesigner {
  designer: string;
  entregas: number;
}

export type MotivoEscolha = "carteira" | "historico" | "carga";

export interface EscolhaDesigner {
  designer: string;
  motivo: MotivoEscolha;
}

/** Ausente hoje? Data vazia ou no passado = presente. */
function ausente(d: DesignerDisponivel, agora: Date): boolean {
  if (!d.indisponivelAte) return false;
  const ate = Date.parse(d.indisponivelAte);
  return Number.isFinite(ate) && ate > agora.getTime();
}

/** Menor carga primeiro; empate resolve pelo nome, pra escolha não variar entre execuções. */
function menorCarga(a: DesignerDisponivel, b: DesignerDisponivel): number {
  return a.abertas - b.abertas || a.nome.localeCompare(b.nome, "pt-BR");
}

/**
 * De quem é a demanda que está nascendo.
 *
 * Ordem: a carteira do cliente manda (é o cadastro, é explícito); senão quem já fez arte pra esse
 * cliente (o Rodrigo já vinha fazendo as do Edumar — trocar o dono agora só confundiria); senão
 * quem está com menos demanda aberta.
 *
 * Devolve `null` só quando não existe designer nenhum. Aí a demanda fica órfã mesmo, e é certo que
 * fique: inventar dono num time vazio seria pior que o quadro "(sem designer)".
 */
export function escolherDesigner(opts: {
  daCarteira?: string | null;
  historico?: ReadonlyArray<HistoricoDesigner>;
  disponiveis: ReadonlyArray<DesignerDisponivel>;
  agora?: Date;
}): EscolhaDesigner | null {
  const daCarteira = (opts.daCarteira ?? "").trim();
  if (daCarteira) return { designer: daCarteira, motivo: "carteira" };

  if (opts.disponiveis.length === 0) return null;
  const agora = opts.agora ?? new Date();

  // Quem está de férias não recebe demanda nova. Mas se TODO MUNDO está fora, o critério cai:
  // demanda sem dono é o problema que este arquivo existe pra evitar.
  const presentes = opts.disponiveis.filter((d) => !ausente(d, agora));
  const elegiveis = presentes.length > 0 ? presentes : opts.disponiveis;

  const porNome = new Map(elegiveis.map((d) => [d.nome, d]));
  const veterano = [...(opts.historico ?? [])]
    .filter((h) => h.entregas > 0 && porNome.has(h.designer))
    .sort((a, b) => b.entregas - a.entregas || a.designer.localeCompare(b.designer, "pt-BR"))[0];
  if (veterano) return { designer: veterano.designer, motivo: "historico" };

  return { designer: [...elegiveis].sort(menorCarga)[0].nome, motivo: "carga" };
}

/** A frase que a tela mostra pra quem criou — ela precisa saber pra onde o pedido foi. */
export function avisoDeAtribuicao(escolha: EscolhaDesigner, cliente: string): string | null {
  if (escolha.motivo === "carteira") return null; // caminho normal, não precisa avisar nada
  const porque = escolha.motivo === "historico"
    ? "é quem já faz as artes desse cliente"
    : "está com menos demanda aberta agora";
  return `${cliente} não tem designer na ficha — a demanda foi pro quadro do ${escolha.designer}, que ${porque}.`;
}
