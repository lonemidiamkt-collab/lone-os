// lib/cs/setup-fechar.ts — TAREFA DE SETUP QUE JÁ SE RESOLVEU SAI DA COBRANÇA.
//
// Roberto (02/10/2026), sobre os PDFs de cobrança das 9h: "TODAS ESSAS FORAM ENTREGUES E POSTADAS,
// TEM QUE VERIFICAR MELHOR ESSA ESTRUTURA". Das 45 tarefas abertas, 43 eram checklist de cliente
// novo ("[Setup] Bio do perfil escrita", "Logo finalizada"…). Veneza, Unafer, Varejão e Portuga
// postam ~10 vezes por mês há dois meses — e o sistema seguia cobrando a bio deles todo dia, com
// "venceu há 51 dias". Seis eram de social da JP e do Dr. Júnior, que são só tráfego.
//
// Por que ficavam: o setup só era conferido enquanto o cliente estava EM ONBOARDING. Graduou, saía
// da conferência, e as tarefas abertas ficavam órfãs pra sempre. E o fechamento que existia gravava
// `completed_at`, coluna que a tabela não tem — o banco recusava e o erro era ignorado.
//
// A regra aqui é a do que dá pra PROVAR: o contrato (o item não se aplica), a carteira (o cliente
// saiu), o Instagram (o perfil está no ar e postando) e a conta de anúncio (houve gasto).

import { escopoDe, type Escopo } from "@/lib/cs/setup-7dias";

export interface ClienteDoSetup {
  ativo: boolean;
  escopo: Escopo;
  emOnboarding: boolean;
  /** Posts no Instagram nos últimos 30 dias. */
  postsIg30d: number;
  /** Houve gasto na conta de anúncio nos últimos 30 dias. */
  gastou30d: boolean;
  /** Dias desde o cadastro. */
  diasDeCasa: number;
}

export interface TarefaDoSetup {
  papel: "designer" | "social" | "traffic" | string;
  /** Dias desde o vencimento (negativo = ainda não venceu). */
  diasVencida: number;
}

/** Posts em 30 dias que provam um perfil montado e no ar (o combinado é ~3 por semana). */
const POSTS_PERFIL_NO_AR = 4;
/** Dentro da janela de onboarding quem decide é a cobrança de setup, item a item. */
const FOLGA_ONBOARDING = 15;
/**
 * Postar prova perfil montado só em cliente estabelecido. A Casas Rio Bahia, com 10 dias de casa e
 * 5 posts, já tinha saído de onboarding pelo resultado do anúncio — mas 5 posts não provam que os
 * destaques e as 3 fixadas estão prontos num perfil de 10 dias.
 */
const DIAS_PARA_PROVA_DO_INSTAGRAM = 30;

/** Por que esta tarefa de setup pode ser fechada — ou null, se ela ainda vale. */
export function motivoFechamentoSetup(t: TarefaDoSetup, c: ClienteDoSetup | null): string | null {
  if (!c) return null; // sem cliente não dá pra provar nada: fica como está
  if (!c.ativo) return "cliente saiu da carteira";

  const deFeed = t.papel === "social" || t.papel === "designer";
  if (deFeed && c.escopo === "trafego") return "não se aplica: o contrato é só de tráfego";
  if (t.papel === "traffic" && c.escopo === "social") return "não se aplica: o contrato é só de social";

  // Cliente novo dentro da janela: a cobrança de setup confere item a item. Aqui só entra o que
  // ficou pra trás — onboarding vencido há mais de 15 dias, ou cliente que já graduou.
  if (c.emOnboarding && t.diasVencida <= FOLGA_ONBOARDING) return null;

  if (deFeed && c.diasDeCasa >= DIAS_PARA_PROVA_DO_INSTAGRAM && c.postsIg30d >= POSTS_PERFIL_NO_AR) {
    return `perfil no ar: ${c.postsIg30d} posts no Instagram nos últimos 30 dias`;
  }
  if (t.papel === "traffic" && c.gastou30d) return "anúncio rodando: houve gasto na conta nos últimos 30 dias";
  return null;
}

/** A linha que fica na descrição da tarefa — quem abrir em /tarefas vê por que fechou. */
export function notaDeFechamento(motivo: string, dataBR: string): string {
  return `✔ Fechada pelo sistema em ${dataBR}: ${motivo}.`;
}

export { escopoDe };
