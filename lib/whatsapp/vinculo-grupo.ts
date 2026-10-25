// lib/whatsapp/vinculo-grupo.ts — o que a tela de Grupos dos Clientes vai gravar, e de quem é cada grupo.
//
// 25/10/2026 (auditoria de erro recuperável, item 9.1). A tela /settings/grupos já abria com a sugestão
// de grupo de confiança "média" ESCOLHIDA (média = só duas palavras em comum com o nome do cliente), e o
// "Salvar" mandava a tabela inteira. Quem entrava só para mudar uma verba gravava junto grupos que
// ninguém conferiu — e relatório, suporte e calendário passavam a ir para o grupo de outro cliente.
//
// Regras daqui (puras, sem banco — a tela e a rota usam as mesmas):
//   · a tela grava SÓ o que mudou em relação ao que veio do banco, campo a campo;
//   · grupo que já é de outro cliente é recusado, a não ser que a pessoa confirme o compartilhamento
//     naquele cliente (Veneza Estofados + Nova Iguaçu e Bazar Ribeiro + Saquarema dividem grupo de
//     propósito — mesmo dono). Manter o grupo que o cliente já tem nunca é conflito.

import { lerReais, formatarReais } from "@/lib/trafego/vendas";

export interface AlertasCliente {
  verbaBaixa: boolean;
  verbaZerada: boolean;
  erroConta: boolean;
  semGasto: boolean;
  campanhaParada: boolean;
  metaErro: boolean;
}

export const ROTULO_ALERTA: Record<keyof AlertasCliente, string> = {
  verbaBaixa: "Baixa",
  verbaZerada: "Zerada",
  erroConta: "Conta",
  semGasto: "S/gasto",
  campanhaParada: "Parada",
  metaErro: "Meta",
};

/** O que uma linha da tela guarda: grupo ("" = nenhum), verba mínima como foi digitada e os alertas. */
export interface EstadoLinha {
  jid: string;
  verba: string;
  alertas: AlertasCliente;
}

export interface LinhaComparada {
  clientId: string;
  nome: string;
  /** Como veio do banco. */
  base: EstadoLinha;
  /** Como está na tela agora. */
  atual: EstadoLinha;
}

/** Só os campos que mudaram. Campo ausente = não mexer nele no banco. */
export interface MudancaCliente {
  clientId: string;
  nome: string;
  grupo?: { jid: string | null; nome: string | null };
  /** Valor já em reais; null = sem limite próprio (herda o % da verba). */
  verbaMinima?: number | null;
  alertas?: AlertasCliente;
}

/** Verba mínima digitada → reais. "" ou 0 = sem limite próprio (null). undefined = não entendi. */
export function lerVerbaMinima(texto: string): number | null | undefined {
  if (!texto.trim()) return null;
  const v = lerReais(texto);
  if (v == null || v > 10_000_000) return undefined;
  return v > 0 ? Math.round(v * 100) / 100 : null;
}

function mesmosAlertas(a: AlertasCliente, b: AlertasCliente): boolean {
  return (Object.keys(ROTULO_ALERTA) as (keyof AlertasCliente)[]).every((k) => a[k] === b[k]);
}

/**
 * O que mudou na tela. Verba que não dá pra entender não vira número: vai em `erros`, com a frase
 * que aparece embaixo do campo — e nada é salvo enquanto houver erro.
 */
export function mudancasDaTela(
  linhas: readonly LinhaComparada[],
  nomeDoGrupo: (jid: string) => string | null,
): { mudancas: MudancaCliente[]; erros: { clientId: string; nome: string; frase: string }[] } {
  const mudancas: MudancaCliente[] = [];
  const erros: { clientId: string; nome: string; frase: string }[] = [];
  for (const l of linhas) {
    const m: MudancaCliente = { clientId: l.clientId, nome: l.nome };
    if ((l.atual.jid || "") !== (l.base.jid || "")) {
      const jid = l.atual.jid || null;
      m.grupo = { jid, nome: jid ? nomeDoGrupo(jid) : null };
    }
    const nova = lerVerbaMinima(l.atual.verba);
    if (nova === undefined) {
      erros.push({ clientId: l.clientId, nome: l.nome, frase: "Não entendi o valor. Escreva assim: 1.500,00" });
    } else {
      // A base vem do banco (sempre legível); se não der para ler, conta como "sem limite".
      const antes = lerVerbaMinima(l.base.verba) ?? null;
      if (nova !== antes) m.verbaMinima = nova;
    }
    if (!mesmosAlertas(l.atual.alertas, l.base.alertas)) m.alertas = { ...l.atual.alertas };
    if (m.grupo || m.verbaMinima !== undefined || m.alertas) mudancas.push(m);
  }
  return { mudancas, erros };
}

// ─── De quem é cada grupo ───────────────────────────────────────────────────

export interface DonoGrupo {
  clientId: string;
  nome: string;
  jid: string;
  ativo: boolean;
}

export interface ConflitoGrupo {
  clientId: string;
  nome: string;
  jid: string;
  /** Os OUTROS clientes que ficariam no mesmo grupo depois de salvar. */
  outros: { clientId: string; nome: string; ativo: boolean }[];
}

/**
 * Para cada cliente que vai ganhar um grupo novo: quem MAIS ficaria naquele grupo depois de salvar.
 * Olha o estado final (trocas no mesmo salvamento não acusam: A sai do grupo X e B entra nele).
 * Grupo que o cliente já tinha não entra aqui — manter não é vincular de novo.
 */
export function conflitosDeGrupo(
  donos: readonly DonoGrupo[],
  mudancas: readonly { clientId: string; nome?: string; jid: string | null }[],
): ConflitoGrupo[] {
  const final = new Map<string, { nome: string; jid: string | null; ativo: boolean }>();
  for (const d of donos) final.set(d.clientId, { nome: d.nome, jid: d.jid, ativo: d.ativo });
  for (const m of mudancas) {
    const atual = final.get(m.clientId);
    final.set(m.clientId, { nome: atual?.nome ?? m.nome ?? m.clientId, jid: m.jid, ativo: atual?.ativo ?? true });
  }
  const antes = new Map(donos.map((d) => [d.clientId, d.jid]));
  const out: ConflitoGrupo[] = [];
  for (const m of mudancas) {
    if (!m.jid || antes.get(m.clientId) === m.jid) continue;
    const outros = [...final.entries()]
      .filter(([id, v]) => id !== m.clientId && v.jid === m.jid)
      .map(([clientId, v]) => ({ clientId, nome: v.nome, ativo: v.ativo }));
    if (outros.length) out.push({ clientId: m.clientId, nome: final.get(m.clientId)?.nome ?? m.nome ?? m.clientId, jid: m.jid, outros });
  }
  return out;
}

/** Conflitos que a pessoa NÃO confirmou: todo outro cliente do grupo precisa estar em `compartilharCom`. */
export function conflitosSemConfirmacao(
  conflitos: readonly ConflitoGrupo[],
  confirmados: (clientId: string) => readonly string[] | undefined,
): ConflitoGrupo[] {
  return conflitos.filter((c) => {
    const ok = new Set(confirmados(c.clientId) ?? []);
    return c.outros.some((o) => !ok.has(o.clientId));
  });
}

/** "O grupo X já é de A e B." — a frase da recusa. */
export function fraseDoConflito(c: ConflitoGrupo, nomeDoGrupo: string | null): string {
  const nomes = c.outros.map((o) => (o.ativo ? o.nome : `${o.nome} (inativo)`));
  const lista = nomes.length <= 1 ? nomes[0] ?? "" : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  return `O grupo "${nomeDoGrupo ?? c.jid}" já é de ${lista}. Vincular ${c.nome} a ele faz relatório, suporte e calendário dos dois irem para o mesmo grupo.`;
}

// ─── O resumo que aparece antes de salvar ───────────────────────────────────

const reais = (v: number) => formatarReais(v);

/** Uma linha por mudança, em português, para a pessoa conferir antes de confirmar. */
export function resumoDaMudanca(
  m: MudancaCliente,
  antes: { jid: string | null; nomeGrupo: string | null; verba: number | null; alertas: AlertasCliente },
): string[] {
  const l: string[] = [];
  if (m.grupo) {
    if (m.grupo.jid) {
      l.push(antes.jid
        ? `trocar o grupo de ${m.nome}: "${antes.nomeGrupo ?? antes.jid}" → "${m.grupo.nome ?? m.grupo.jid}"`
        : `vincular ${m.nome} → grupo "${m.grupo.nome ?? m.grupo.jid}"`);
    } else {
      l.push(`desvincular ${m.nome} do grupo "${antes.nomeGrupo ?? antes.jid ?? "—"}" (relatório, suporte e calendário param de ir para lá)`);
    }
  }
  if (m.verbaMinima !== undefined) {
    const de = antes.verba != null ? reais(antes.verba) : "% da verba";
    const para = m.verbaMinima != null ? reais(m.verbaMinima) : "% da verba (sem limite próprio)";
    l.push(`${m.nome}: avisar saldo baixo abaixo de ${para} (antes: ${de})`);
  }
  if (m.alertas) {
    const liga: string[] = [], desliga: string[] = [];
    for (const k of Object.keys(ROTULO_ALERTA) as (keyof AlertasCliente)[]) {
      if (m.alertas[k] === antes.alertas[k]) continue;
      (m.alertas[k] ? liga : desliga).push(ROTULO_ALERTA[k]);
    }
    const partes = [liga.length ? `liga ${liga.join(", ")}` : "", desliga.length ? `desliga ${desliga.join(", ")}` : ""].filter(Boolean);
    l.push(`${m.nome}: alertas — ${partes.join("; ")}`);
  }
  return l;
}
