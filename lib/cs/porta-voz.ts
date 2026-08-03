// lib/cs/porta-voz.ts — o portão por onde TODA fala do Loninho no grupo interno passa.
//
// POR QUE EXISTE. Em 03/08 o grupo da equipe recebeu 21 mensagens do agente; em 31/07, 41; em
// 27/07, 59. Numa segunda são 14 rotinas diferentes disparando, várias na mesma meia hora. Pior
// que o volume era a REPETIÇÃO: o bom-dia das 8h dizia "2 esfriando — Paradise (10d), Madeireira
// (9d)" e às 9h30 o cron cs-esfriando mandava os MESMOS dois clientes de novo.
//
// O efeito de repetir é o oposto do pretendido: quando tudo chega com o mesmo peso e boa parte já
// foi dita, o time para de ler — inclusive o que importa. "50 artes prontas esperando postagem"
// virou paisagem justamente por ser repetido todo dia no mesmo tom.
//
// COMO FUNCIONA. Cada rotina declara os FATOS que vai afirmar ("esfriando:paradise"). Se todos os
// fatos daquela mensagem já foram ditos hoje, ela não sai. Dedupe por texto não resolveria: o fato
// costuma vir embutido numa mensagem maior, com outras palavras ao redor.
//
// O QUE ELE NÃO FAZ (de propósito):
//   • nunca cala mensagem pro CLIENTE — silêncio com cliente é dano, não economia
//   • nunca cala quem não declarou fato — na dúvida, fala (só registra que não deu pra avaliar)
//   • nunca cala se a consulta falhar — banco fora do ar não pode virar mordaça

import { supabaseAdmin } from "@/lib/supabase/server";

/** Dia corrente em BRT — a operação vive em São Paulo, o servidor em UTC. */
export function diaBRT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export interface Veredito {
  pode: boolean;
  /** Por que calou — vai pro log, pra dar pra auditar o que o portão engoliu. */
  motivo?: string;
  /** Os fatos ainda inéditos hoje. Quem quiser, reescreve a mensagem só com estes. */
  ineditos: string[];
}

/**
 * Vale a pena falar? Só avalia mensagem INTERNA com fatos declarados.
 *
 * @param fatos chaves estáveis do que a mensagem afirma. Estáveis é o ponto: "esfriando:paradise"
 *              tem que sair igual no bom-dia e no cron de esfriando, senão o dedupe não casa.
 */
export async function avaliarFala(fatos: string[] | undefined, destino: string | undefined): Promise<Veredito> {
  const lista = (fatos ?? []).map((f) => f.trim()).filter(Boolean);
  // Sem fato declarado não há como saber se repete. Fala — e a rotina aparece no relatório de
  // quem ainda não declara, que é o que me deixa medir a fila de trabalho.
  if (!lista.length) return { pode: true, ineditos: [] };
  if (destino && destino !== "interno") return { pode: true, ineditos: lista };

  try {
    const { data, error } = await supabaseAdmin
      .from("cs_outbound")
      .select("fatos")
      .eq("dia", diaBRT())
      .eq("enviado", true)
      .not("fatos", "is", null);
    // Erro de leitura NÃO cala ninguém: prefiro repetir uma vez a engolir um aviso de verdade.
    if (error) return { pode: true, motivo: "não consegui conferir o que já falei", ineditos: lista };

    const jaDitos = new Set<string>();
    for (const r of data ?? []) for (const f of (r.fatos as string[] | null) ?? []) jaDitos.add(f);

    const ineditos = lista.filter((f) => !jaDitos.has(f));
    if (!ineditos.length) {
      return { pode: false, motivo: `tudo isso eu já falei hoje (${lista.length} fato(s))`, ineditos: [] };
    }
    return { pode: true, ineditos };
  } catch {
    return { pode: true, motivo: "falha ao conferir repetição", ineditos: lista };
  }
}

// ── Chaves de fato ──────────────────────────────────────────────────────────
// Função em vez de string solta pra garantir que a MESMA coisa gere a MESMA chave nos dois
// lugares que a mencionam. Chave divergente = dedupe que nunca casa e ninguém percebe.

const slug = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** Cliente que sumiu do grupo. Citado no bom-dia E no cron de esfriando. */
export const fatoEsfriando = (cliente: string) => `esfriando:${slug(cliente)}`;
/** Arte entregue pelo designer parada esperando o social. */
export const fatoArteParada = (cliente: string) => `arte-parada:${slug(cliente)}`;
/** Cliente sem post planejado no dia. */
export const fatoSemPauta = (cliente: string, dia: string) => `sem-pauta:${slug(cliente)}:${dia}`;
/** Tarefa vencida de alguém. */
export const fatoTarefaVencida = (id: string) => `tarefa-vencida:${id}`;
/** Cliente novo sem anúncio no ar. */
export const fatoSemAnuncio = (cliente: string) => `sem-anuncio:${slug(cliente)}`;
