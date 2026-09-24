// lib/portal/agenda.ts — "Próximos posts" e o calendário do mês no portal do cliente (N36), e a
// regra de quando o cliente pode pedir alteração numa arte (N35). PURO: sem banco, sem React.
//
// O QUE O CLIENTE VÊ (e só isso). O portal é público por link: nada interno pode sair daqui —
// briefing, observação do time, quem é o social, pedido ao designer, motivo de reprovação. O card
// entra na agenda só quando já é compromisso com o cliente:
//   · Agendado  → aprovado e programado para ir ao ar;
//   · No ar     → publicado (conferido no Instagram ou à mão);
//   · Aprovado  → o cliente já aprovou, falta só agendar.
// Pauta, "com o designer" e revisão interna são trabalho em andamento do time — não aparecem.
//
// Testado em tests/portal-agenda.test.ts; o guarda de campos em tests/portal-payload-guard.test.ts.

import { dataPlanejada, somarDias } from "@/lib/conteudo/no-ar";
import { statusNaEtapa } from "@/lib/conteudo/etapas";
import { spDateStr } from "@/lib/utils";

// ─── Pedir alteração (N35) ─────────────────────────────────────────────────

export interface CardParaAlteracao {
  status?: string | null;
  archived_at?: string | null;
  designer_delivered_at?: string | null;
  client_approved_at?: string | null;
}

export type MotivoSemAlteracao = "arquivado" | "no_ar" | "em_producao" | null;

/**
 * Por que o cliente NÃO pode pedir alteração neste card (null = pode).
 *
 *  - arquivado: o time encerrou o assunto (post antigo, pedido cancelado);
 *  - no_ar: já está publicado — mudar arte de post no ar não é ajuste de arte, é conversa;
 *  - em_producao: a arte ainda não chegou ao cliente (nada entregue, nada agendado).
 *
 * Com arte entregue, com o cliente, aprovada ou agendada: pode. O pedido passa pelo mesmo caminho
 * do WhatsApp (lib/cs/card.ts → aplicarAjusteNoCard → transição "pedir_alteracao"): volta pro
 * designer e reabre o pedido de arte, ou seja, vira demanda do time na hora.
 */
export function motivoSemAlteracao(c: CardParaAlteracao): MotivoSemAlteracao {
  if (c.archived_at) return "arquivado";
  if (statusNaEtapa(c.status, "no_ar")) return "no_ar";
  if (c.designer_delivered_at || c.client_approved_at) return null;
  if (statusNaEtapa(c.status, "com_cliente", "agendado")) return null;
  return "em_producao";
}

export function podePedirAlteracao(c: CardParaAlteracao): boolean {
  return motivoSemAlteracao(c) === null;
}

/** A frase que o cliente lê quando o pedido não pode ser feito pelo portal. */
export const FRASE_SEM_ALTERACAO: Record<Exclude<MotivoSemAlteracao, null>, string> = {
  arquivado: "Esse post já foi encerrado pelo time. Se precisar mudar algo, fale com a gente no WhatsApp.",
  no_ar: "Esse post já está no ar. Para mudar algo nele, fale com a gente no WhatsApp.",
  em_producao: "Essa arte ainda está sendo feita. Assim que ela chegar para você, dá pra pedir ajuste por aqui.",
};

// ─── Agenda (N36) ──────────────────────────────────────────────────────────

/** Linha de content_cards como vem do banco (pode trazer mais colunas — são ignoradas). */
export interface LinhaCardAgenda {
  id: string;
  title?: string | null;
  format?: string | null;
  status?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  scheduled_at?: string | null;
  publish_verified_at?: string | null;
  client_approved_at?: string | null;
  designer_delivered_at?: string | null;
  archived_at?: string | null;
  image_url?: string | null;
  ig_media_id?: string | null;
}

export type SituacaoAgenda = "agendado" | "no_ar" | "aprovado";

export const ROTULO_SITUACAO: Record<SituacaoAgenda, string> = {
  agendado: "Agendado",
  no_ar: "No ar",
  aprovado: "Aprovado",
};

/** O que vai para o navegador do cliente. Campo novo aqui passa pelo guarda do portal. */
export interface ItemAgenda {
  id: string;
  titulo: string;
  formato: string;
  /** "YYYY-MM-DD" em São Paulo. */
  dia: string;
  /** "HH:mm" quando o time marcou horário. */
  hora: string | null;
  situacao: SituacaoAgenda;
  imagem: string | null;
  /** Link do post no Instagram (só quando já está no ar e o post foi reconhecido). */
  link: string | null;
  podeAlterar: boolean;
}

/** Em que situação o card entra na agenda do cliente (null = não entra). */
export function situacaoNaAgenda(c: LinhaCardAgenda): SituacaoAgenda | null {
  if (statusNaEtapa(c.status, "no_ar")) return "no_ar";
  // Arquivado só vale se já foi publicado (a equipe arquiva depois de postar para limpar o quadro).
  if (c.archived_at) return null;
  if (statusNaEtapa(c.status, "agendado")) return "agendado";
  if (c.client_approved_at) return "aprovado";
  return null;
}

/** O dia do card no calendário do cliente: publicado → dia em que foi ao ar; senão, o planejado. */
export function diaNaAgenda(c: LinhaCardAgenda): string | null {
  if (statusNaEtapa(c.status, "no_ar") && c.publish_verified_at) return spDateStr(c.publish_verified_at);
  return dataPlanejada({ dueDate: c.due_date, scheduledAt: c.scheduled_at });
}

const urlUtil = (u: string | null | undefined): string | null => {
  const t = (u ?? "").trim();
  return t.startsWith("http") || t.startsWith("/") ? t : null;
};

/** Primeiro e último dia de "YYYY-MM". */
export function limitesMes(mes: string): { inicio: string; fim: string } {
  const [a, m] = mes.split("-").map(Number);
  return { inicio: `${mes}-01`, fim: new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10) };
}

/** "YYYY-MM" válido? (a rota pública não confia no que vem na URL). */
export function mesValido(mes: string | null | undefined): mes is string {
  return !!mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
}

/** A janela que a rota precisa ler do banco: o mês pedido e os próximos 7 dias a partir de hoje. */
export function janelaDaAgenda(mes: string, hoje: string): { de: string; ate: string } {
  const { inicio, fim } = limitesMes(mes);
  const seteDias = somarDias(hoje, 6);
  return { de: inicio < hoje ? inicio : hoje, ate: fim > seteDias ? fim : seteDias };
}

export const DIAS_PROXIMOS = 7;

export function montarAgenda(args: {
  cards: readonly LinhaCardAgenda[];
  /** Capa vinda dos anexos (card → url), para quem não tem image_url. */
  capas?: ReadonlyMap<string, string>;
  /** Link do Instagram por media_id. */
  links?: ReadonlyMap<string, string>;
  hoje: string;
  mes: string;
}): { mes: string; proximos: ItemAgenda[]; doMes: ItemAgenda[] } {
  const { inicio, fim } = limitesMes(args.mes);
  const ultimoProximo = somarDias(args.hoje, DIAS_PROXIMOS - 1);

  const itens: ItemAgenda[] = [];
  const vistos = new Set<string>();
  for (const c of args.cards) {
    if (vistos.has(c.id)) continue;
    const situacao = situacaoNaAgenda(c);
    const dia = diaNaAgenda(c);
    if (!situacao || !dia) continue;
    vistos.add(c.id);
    const hora = /^\d{2}:\d{2}/.test(c.due_time ?? "") ? (c.due_time as string).slice(0, 5) : null;
    itens.push({
      id: c.id,
      titulo: (c.title ?? "").trim() || "Post",
      formato: (c.format ?? "").trim(),
      dia,
      hora,
      situacao,
      imagem: urlUtil(c.image_url) ?? args.capas?.get(c.id) ?? null,
      link: situacao === "no_ar" && c.ig_media_id ? args.links?.get(c.ig_media_id) ?? null : null,
      podeAlterar: podePedirAlteracao(c),
    });
  }

  const ordem = (a: ItemAgenda, b: ItemAgenda) =>
    a.dia.localeCompare(b.dia) || (a.hora ?? "99").localeCompare(b.hora ?? "99") || a.titulo.localeCompare(b.titulo);
  itens.sort(ordem);

  return {
    mes: args.mes,
    proximos: itens.filter((i) => i.dia >= args.hoje && i.dia <= ultimoProximo),
    doMes: itens.filter((i) => i.dia >= inicio && i.dia <= fim),
  };
}

// ─── Capa da arte ──────────────────────────────────────────────────────────

export interface AnexoCapa { card_id: string; url?: string | null; tipo?: string | null; position?: number | null }

/**
 * A capa de cada card a partir dos anexos: a ARTE entregue, nunca a referência ("referencia" é o
 * print que o social mandou pro designer — às vezes de concorrente). Entrega > sem tipo (legado).
 * Os anexos devem vir ordenados por posição.
 */
export function capasDosAnexos(anexos: readonly AnexoCapa[]): Map<string, string> {
  const peso = (t: unknown) => (t === "entrega" ? 0 : t == null ? 1 : 9);
  const melhor = new Map<string, { url: string; peso: number }>();
  for (const a of anexos) {
    const w = peso(a.tipo);
    const url = urlUtil(a.url);
    if (w === 9 || !url) continue;
    const atual = melhor.get(a.card_id);
    if (!atual || w < atual.peso) melhor.set(a.card_id, { url, peso: w });
  }
  return new Map([...melhor].map(([id, m]) => [id, m.url]));
}
