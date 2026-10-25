// lib/meta/troca-token.ts — o que muda ao trocar o token da Meta da agência. Puro (tela e rota usam).
//
// 25/10/2026 (auditoria de erro recuperável, 9.5). O token novo era GRAVADO no instante em que o login do
// Facebook voltava, antes de conferir permissões e quantas contas ele alcançava. Logar com o perfil errado
// (ou desmarcar uma permissão na tela do Facebook) trocava o token que alimenta saldos, alertas, portal e
// relatórios — e o anterior se perdia. Agora a troca mostra antes: de quem é o perfil, que permissões
// faltam e "de N para M contas da carteira", e só grava quando alguém confirma.

/** As permissões que o login do painel pede (e que saldos, relatórios, portal e Instagram usam). */
export const ESCOPOS_LOGIN = [
  "ads_read", "ads_management", "business_management",
  "instagram_basic", "instagram_manage_insights", "pages_read_engagement", "pages_show_list",
  "instagram_content_publish",
] as const;

/** O que cada permissão segura — para a frase não ser só o nome técnico. */
const PARA_QUE: Record<string, string> = {
  ads_read: "saldos, alertas de verba e relatórios",
  ads_management: "leitura completa das contas de anúncio",
  business_management: "contas que estão no Business Manager",
  instagram_basic: "Instagram do portal e dos relatórios",
  instagram_manage_insights: "números do Instagram",
  pages_read_engagement: "páginas ligadas ao Instagram",
  pages_show_list: "lista de páginas",
  instagram_content_publish: "postar no Instagram",
};

export function escoposFaltando(concedidos: readonly string[], pedidos: readonly string[] = ESCOPOS_LOGIN): string[] {
  const tem = new Set(concedidos);
  return pedidos.filter((p) => !tem.has(p));
}

export function descreverEscopos(faltam: readonly string[]): string {
  return faltam.map((f) => (PARA_QUE[f] ? `${f} (${PARA_QUE[f]})` : f)).join(", ");
}

const semAct = (id: string) => id.replace(/^act_/, "");

export interface AlcanceCarteira {
  /** Contas na carteira de tráfego (ad_accounts). */
  total: number;
  /** Quantas o token novo alcança. */
  novo: number;
  /** Quantas o token atual alcança; null = não há token atual válido para comparar. */
  atual: number | null;
  /** Contas da carteira que o token novo NÃO alcança (e o atual alcançava, quando há atual). */
  perdidas: string[];
}

/** "De N para M": quantas contas da carteira cada token alcança, e quais o novo perde. */
export function compararAlcance(
  carteira: readonly { id: string; nome: string }[],
  novo: ReadonlySet<string>,
  atual: ReadonlySet<string> | null,
): AlcanceCarteira {
  const norm = (s: ReadonlySet<string>) => new Set([...s].map(semAct));
  const n = norm(novo);
  const a = atual ? norm(atual) : null;
  const alcancaNovo = carteira.filter((c) => n.has(semAct(c.id)));
  const alcancaAtual = a ? carteira.filter((c) => a.has(semAct(c.id))) : null;
  const perdidas = carteira
    .filter((c) => !n.has(semAct(c.id)) && (!a || a.has(semAct(c.id))))
    .map((c) => c.nome);
  return { total: carteira.length, novo: alcancaNovo.length, atual: alcancaAtual ? alcancaAtual.length : null, perdidas };
}

export interface PreviaTroca {
  perfil: string | null;
  escoposFaltando: string[];
  alcance: AlcanceCarteira;
}

/** Precisa de confirmação reforçada? (perde conta da carteira ou falta permissão) */
export function trocaArriscada(p: PreviaTroca): boolean {
  return p.escoposFaltando.length > 0 || p.alcance.perdidas.length > 0;
}

/** As frases do aviso, na ordem em que a pessoa precisa ler. */
export function avisosDaTroca(p: PreviaTroca): string[] {
  const l: string[] = [];
  const { alcance: a } = p;
  if (a.atual != null) {
    l.push(`O token novo alcança ${a.novo} de ${a.total} contas da carteira (o atual alcança ${a.atual}).`);
  } else {
    l.push(`O token novo alcança ${a.novo} de ${a.total} contas da carteira.`);
  }
  if (a.perdidas.length) {
    const nomes = a.perdidas.slice(0, 6).join(", ") + (a.perdidas.length > 6 ? ` e mais ${a.perdidas.length - 6}` : "");
    l.push(`Param de atualizar: ${nomes}.`);
  }
  if (p.escoposFaltando.length) {
    l.push(`Faltam permissões: ${descreverEscopos(p.escoposFaltando)}. Refaça o login marcando todas.`);
  }
  return l;
}
