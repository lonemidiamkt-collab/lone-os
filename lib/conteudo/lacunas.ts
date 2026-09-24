// lib/conteudo/lacunas.ts — LACUNAS DE PAUTA (Leva 7B, N10): os dias de post (seg/qua/sex) das
// próximas duas semanas que ainda não têm card, por cliente, na cadência contratada.
//
// lib/cs/lacunas.ts já responde "o cliente tem ALGUM post na semana?" (o Início usa). Aqui a pergunta
// é mais fina — "quais dias de post estão vazios?" — para o social preencher com um clique. A semana
// sem post nenhum continua vindo de lá (clientesSemPostNaSemana) e marca a lacuna como mais grave.
//
// Cadência: clients.posts_goal é a meta mensal contratada (12 = 3 por semana). Vira posts por semana
// (12 → 3, 8 → 2, 4 → 1) e os dias esperados, na ordem do playbook: segunda e sexta são firmes,
// quarta é o terceiro post (Reels para quem grava vídeo). Semana que já tem posts suficientes — mesmo
// em outros dias — não tem lacuna: o que conta é a cadência, não o dia exato.
//
// Módulo puro (testado em tests/conteudo-lacunas.test.ts).

import { clientesSemPostNaSemana } from "@/lib/cs/lacunas";
import { temSocial } from "@/lib/clients/servico";
import { somarDias } from "./no-ar";

/** Quantas semanas à frente o painel olha. */
export const SEMANAS_DE_LACUNA = 2;

/** Meta mensal quando o cadastro não diz (o padrão do sistema: 12 posts/mês). */
const META_PADRAO = 12;

export type DiaDePost = 1 | 3 | 5;

const NOME_DO_DIA: Record<DiaDePost, string> = { 1: "segunda", 3: "quarta", 5: "sexta" };

/** Ordem de prioridade dos dias: segunda e sexta são firmes; quarta é o terceiro post. */
const PRIORIDADE: readonly DiaDePost[] = [1, 5, 3];

export interface ClienteDaPauta {
  id: string;
  nome: string;
  social?: string | null;
  /** clients.posts_goal — posts por mês contratados. */
  postsGoal?: number | null;
  /** clients.perfil_conteudo — video/completo gravam (quarta = Reels). */
  perfil?: string | null;
  serviceType?: string | null;
  active?: boolean | null;
  pausedAt?: string | null;
  draftStatus?: string | null;
}

export interface CardDaPauta {
  clientId: string;
  dueDate?: string | null;
  archivedAt?: string | null;
}

export interface Lacuna {
  /** "YYYY-MM-DD" */
  data: string;
  dia: DiaDePost;
  rotuloDia: string;
  /** Segunda-feira da semana da lacuna. */
  semana: string;
  formatoSugerido: "Reels" | "Post";
}

export interface LacunasDoCliente {
  clientId: string;
  nome: string;
  social: string | null;
  porSemana: number;
  lacunas: Lacuna[];
  /** Segundas das semanas sem NENHUM post planejado (lib/cs/lacunas). */
  semanasVazias: string[];
}

/** Posts por semana da meta mensal (12 → 3). Sem meta = o padrão; meta 0 = cliente sem post. */
export function postsPorSemana(postsGoal: number | null | undefined): number {
  const meta = postsGoal === null || postsGoal === undefined || Number.isNaN(postsGoal) ? META_PADRAO : postsGoal;
  if (meta <= 0) return 0;
  return Math.min(3, Math.max(1, Math.round((meta * 12) / 52)));
}

/** Os dias de post esperados para a cadência (3 → seg/qua/sex, 2 → seg/sex, 1 → seg). */
export function diasDaCadencia(porSemana: number): DiaDePost[] {
  if (porSemana >= 3) return [1, 3, 5];
  if (porSemana === 2) return [1, 5];
  if (porSemana === 1) return [1];
  return [];
}

/** Quem entra na conta: ativo, sem pausa, fora do rascunho, com social contratado ou atribuído. */
export function elegivelParaPauta(c: ClienteDaPauta): boolean {
  if (c.active === false || c.pausedAt || c.draftStatus) return false;
  const nome = (c.nome ?? "").trim();
  if (!nome || nome.startsWith("🧪") || /\(teste\)/i.test(nome)) return false;
  return temSocial({ service_type: c.serviceType ?? null }) || !!c.social?.trim();
}

/** Dia da semana de "YYYY-MM-DD" (0 = domingo), calendário puro. */
export function diaDaSemana(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Segunda-feira da semana de `ymd`. */
export function segundaDaSemana(ymd: string): string {
  return somarDias(ymd, -((diaDaSemana(ymd) + 6) % 7));
}

/** "29/09" */
export function ddmm(ymd: string): string {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
}

/** Data local (meia-noite) de "YYYY-MM-DD", para as funções de lib/cs/lacunas, que trabalham com Date. */
function dataLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * As lacunas de cada cliente de amanhã até `hoje + 7 × semanas`.
 *
 * Por semana (seg–dom): conta os cards do cliente na semana inteira (um post de segunda passada
 * conta para a cadência desta semana), e o que falta para a cadência vira lacuna nos dias de post
 * vazios dentro da janela, na ordem segunda → sexta → quarta. Hoje não entra: um card criado hoje
 * para hoje não tem arte a tempo.
 */
export function lacunasDePauta(args: {
  clientes: readonly ClienteDaPauta[];
  cards: readonly CardDaPauta[];
  hoje: string;
  semanas?: number;
}): LacunasDoCliente[] {
  const semanas = args.semanas ?? SEMANAS_DE_LACUNA;
  const inicio = somarDias(args.hoje, 1);
  const fim = somarDias(args.hoje, 7 * semanas);
  const segundas: string[] = [];
  for (let s = segundaDaSemana(inicio); s <= fim; s = somarDias(s, 7)) segundas.push(s);

  const elegiveis = args.clientes.filter(elegivelParaPauta);
  const ativos = args.cards.filter((c) => !c.archivedAt && c.dueDate);
  const datasPorCliente = new Map<string, string[]>();
  for (const c of ativos) {
    const l = datasPorCliente.get(c.clientId) ?? [];
    l.push(c.dueDate!.slice(0, 10));
    datasPorCliente.set(c.clientId, l);
  }

  // Semana sem NENHUM post: a regra de lib/cs/lacunas, a mesma que o Início usa.
  const cardsSemana = ativos.map((c) => ({ clientId: c.clientId, dueDate: c.dueDate!.slice(0, 10) }));
  const vaziasPorSemana = new Map<string, Set<string>>();
  for (const s of segundas) {
    const semNada = clientesSemPostNaSemana(elegiveis.map((c) => ({ id: c.id, nome: c.nome })), cardsSemana, dataLocal(s));
    vaziasPorSemana.set(s, new Set(semNada.map((c) => c.id)));
  }

  const out: LacunasDoCliente[] = [];
  for (const c of elegiveis) {
    const porSemana = postsPorSemana(c.postsGoal);
    const dias = diasDaCadencia(porSemana);
    if (!dias.length) continue;
    const datas = datasPorCliente.get(c.id) ?? [];
    const ocupadas = new Set(datas);
    const grava = c.perfil === "video" || c.perfil === "completo";
    const lacunas: Lacuna[] = [];
    const semanasVazias: string[] = [];

    for (const seg of segundas) {
      const dom = somarDias(seg, 6);
      const naSemana = datas.filter((d) => d >= seg && d <= dom).length;
      const faltam = porSemana - naSemana;
      if (vaziasPorSemana.get(seg)?.has(c.id)) semanasVazias.push(seg);
      if (faltam <= 0) continue;
      const vazios = PRIORIDADE
        .filter((d) => dias.includes(d))
        .map((d) => somarDias(seg, d - 1))
        .filter((data) => data >= inicio && data <= fim && !ocupadas.has(data));
      for (const data of vazios.slice(0, faltam)) {
        const dia = diaDaSemana(data) as DiaDePost;
        lacunas.push({ data, dia, rotuloDia: NOME_DO_DIA[dia], semana: seg, formatoSugerido: dia === 3 && grava ? "Reels" : "Post" });
      }
    }

    if (!lacunas.length) continue;
    lacunas.sort((a, b) => a.data.localeCompare(b.data));
    out.push({ clientId: c.id, nome: c.nome, social: c.social?.trim() || null, porSemana, lacunas, semanasVazias });
  }

  return out.sort((a, b) =>
    b.semanasVazias.length - a.semanasVazias.length
    || b.lacunas.length - a.lacunas.length
    || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Título do card que nasce da lacuna — o social troca pelo tema quando decidir. */
export function tituloDaLacuna(l: Pick<Lacuna, "data" | "rotuloDia" | "formatoSugerido">): string {
  return `${l.formatoSugerido === "Reels" ? "Reels" : "Post"} de ${l.rotuloDia} ${ddmm(l.data)} — definir tema`;
}

/** Chave de idempotência: o clique repetido (ou o retry) não cria dois cards para a mesma lacuna. */
export const chaveDaLacuna = (clientId: string, data: string) => `lacuna|${clientId}|${data}`;
