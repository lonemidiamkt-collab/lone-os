// lib/clients/conta-meta.ts — DE QUEM É ESTA CONTA DE ANÚNCIO? Regras puras (21/10/2026).
//
// O alerta de verba, o digest de saldo e o portal leem `ad_accounts`; o painel, os relatórios e o
// Instagram leem `clients.meta_ad_account_id`. Vincular na ficha uma conta que já era de outro cliente
// passava a linha de `ad_accounts` para este (upsert por meta_account_id + o gatilho de 23/09) sem
// ninguém saber: os números e alertas de um cliente iam para o outro, e o antigo seguia com a conta
// na ficha. Agora a conta só muda de dono com confirmação explícita ("transferir"), e quem confirma
// vê de quem ela é. Usado pela rota /api/clients/update, pelo cadastro novo e pela ficha.
// Testado em tests/conta-meta-dono.test.ts.

export interface DonoConta {
  clientId: string;
  nome: string;
  /** Ainda é cliente (não arquivado nem encerrado). */
  ativo: boolean;
  /** A ficha dele aponta para a conta (clients.meta_ad_account_id). */
  naFicha: boolean;
  /** A linha da carteira de tráfego (ad_accounts: alerta de verba, saldo, portal) está com ele. */
  noEspelho: boolean;
  /** Como estava gravado na ficha — para devolver se a transferência falhar no meio. */
  contaNaFicha: string | null;
  nomeContaNaFicha: string | null;
}

/** Uma grafia só: a Graph API e `ad_accounts` usam `act_<número>`. Vazio vira null. */
export function normalizarContaMeta(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  return t.startsWith("act_") ? t : `act_${t}`;
}

export interface LinhaClienteConta {
  id: string;
  name: string | null;
  nome_fantasia?: string | null;
  active?: boolean | null;
  churned_at?: string | null;
  meta_ad_account_id: string | null;
  meta_ad_account_name?: string | null;
}
export interface LinhaEspelhoConta { client_id: string; meta_account_id: string }

const nomeDoCliente = (c: LinhaClienteConta | undefined, id: string) =>
  (c?.nome_fantasia || c?.name || "").trim() || `cliente ${id.slice(0, 8)}`;

/**
 * Conta (normalizada) → quem tem ela, juntando a ficha (`clients`) e a carteira de tráfego
 * (`ad_accounts`). Um cliente aparece uma vez por conta, com as duas marcas.
 */
export function mapearDonos(clientes: LinhaClienteConta[], espelho: LinhaEspelhoConta[]): Map<string, DonoConta[]> {
  const porId = new Map(clientes.map((c) => [c.id, c]));
  const out = new Map<string, DonoConta[]>();
  const pegar = (conta: string, clientId: string): DonoConta => {
    const lista = out.get(conta) ?? [];
    let d = lista.find((x) => x.clientId === clientId);
    if (!d) {
      const c = porId.get(clientId);
      d = {
        clientId, nome: nomeDoCliente(c, clientId),
        ativo: !!c && c.active !== false && !c.churned_at,
        naFicha: false, noEspelho: false, contaNaFicha: null, nomeContaNaFicha: null,
      };
      lista.push(d);
      out.set(conta, lista);
    }
    return d;
  };
  for (const c of clientes) {
    const conta = normalizarContaMeta(c.meta_ad_account_id);
    if (!conta) continue;
    const d = pegar(conta, c.id);
    d.naFicha = true;
    d.contaNaFicha = c.meta_ad_account_id;
    d.nomeContaNaFicha = c.meta_ad_account_name ?? null;
  }
  for (const e of espelho) {
    const conta = normalizarContaMeta(e.meta_account_id);
    if (!conta || !e.client_id) continue;
    pegar(conta, e.client_id).noEspelho = true;
  }
  return out;
}

/** "é do cliente X" / "estava com X (cliente arquivado)" / "está no alerta de verba de X". */
export function descreverDono(d: Pick<DonoConta, "nome" | "ativo" | "naFicha">): string {
  if (!d.ativo) return `estava com ${d.nome} (cliente arquivado)`;
  if (!d.naFicha) return `está no alerta de verba de ${d.nome}, mas não na ficha dele`;
  return `é do cliente ${d.nome}`;
}

/** O que acontece com quem perde a conta — dito antes de confirmar. */
export function consequenciaDaTransferencia(donos: Pick<DonoConta, "nome">[]): string {
  const nomes = donos.map((d) => d.nome).join(" e ");
  return `${nomes} deixa de ter a conta: alerta de verba, saldo e os números dos anúncios passam para este cliente.`;
}

export type DecisaoConta =
  /** Mesma conta que já está na ficha deste cliente: não mexe no espelho de ninguém. */
  | { acao: "manter" }
  /** Conta sem outro dono: vincula. */
  | { acao: "vincular" }
  /** Pedido explícito de transferência: sai dos outros e vem para este. */
  | { acao: "transferir"; de: DonoConta[] }
  /** Conta de outro cliente sem confirmação: 409 com o nome de quem tem. */
  | { acao: "recusar"; erro: string; donos: DonoConta[] };

export function decidirVinculo(p: {
  clientId: string;
  /** Conta gravada hoje na ficha deste cliente (como está no banco). */
  contaAtual: string | null;
  /** Conta pedida (já normalizada). */
  contaNova: string;
  /** Quem tem a conta nova (de `mapearDonos`). */
  donos: DonoConta[];
  transferir: boolean;
}): DecisaoConta {
  // Salvar o cadastro com a MESMA conta (o modal "Editar" manda ela em todo salvamento) não é
  // vincular de novo: sem esta regra, cada salvamento puxava a conta de volta de quem a tivesse.
  if (normalizarContaMeta(p.contaAtual) === p.contaNova) return { acao: "manter" };
  const outros = p.donos.filter((d) => d.clientId !== p.clientId);
  if (!outros.length) return { acao: "vincular" };
  if (p.transferir) return { acao: "transferir", de: outros };
  const quem = outros.map((d) => descreverDono(d)).join("; ");
  return {
    acao: "recusar",
    donos: outros,
    erro: `A conta de anúncio ${p.contaNova} ${quem}. Para trazer para cá, confirme a transferência na ficha deste cliente `
      + `(Admin › Conta Meta Ads) — ${consequenciaDaTransferencia(outros)}`,
  };
}
