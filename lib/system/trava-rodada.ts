// lib/system/trava-rodada.ts — uma rotina pesada por vez, por dia.
//
// POR QUE EXISTE (10/08). Dois crons de segunda — `weekly-reports` e `client-messages monday` —
// disparavam no mesmo segundo e os dois mandavam o relatório. Cada um perguntava antes "já enviei
// hoje?", os dois ouviam "não" (porque nenhum tinha gravado ainda) e os dois seguiam. Deu 161
// relatórios para 40 grupos: o cliente recebeu dois, o Bazar Ribeiro recebeu quatro.
//
// O estrago maior foi invisível: cada rodada faz ~700 chamadas na Meta (42 clientes × ~17). O teto
// do app é 200 por usuário/hora. Uma rodada já raspa o limite; duas estouram — e aí a rodada
// seguinte falha inteira, que foi o relatório que não saiu hoje de manhã.
//
// VERIFICAR-E-AGIR NÃO RESOLVE CORRIDA. Duas execuções leem o mesmo "não" antes de qualquer uma
// escrever. Só reservar resolve: quem consegue INSERIR a chave roda, quem esbarra nela sai. A
// garantia vem da chave primária do Postgres, não de uma consulta bem-intencionada.

import { supabaseAdmin } from "@/lib/supabase/server";

/** Depois disso, uma reserva presa (processo morreu no meio) deixa de bloquear. */
const MINUTOS_ATE_CONSIDERAR_TRAVADA = 90;

export interface Reserva {
  conseguiu: boolean;
  motivo?: string;
}

/**
 * Reserva a execução de `rotina` para `diaChave` (YYYY-MM-DD).
 *
 * @returns `conseguiu: false` quando outra execução já pegou o dia — nesse caso NÃO rode.
 */
export async function reservarRodada(rotina: string, diaChave: string): Promise<Reserva> {
  const { error } = await supabaseAdmin
    .from("routine_runs")
    .insert({ routine: rotina, date_key: diaChave });

  if (!error) return { conseguiu: true };

  // 23505 = violação de chave única: alguém chegou antes.
  if (error.code !== "23505") {
    // Erro diferente (tabela fora do ar, permissão) NÃO pode virar bloqueio silencioso do
    // relatório — vale mais arriscar um envio duplicado do que o cliente não receber nada.
    console.error(`[trava-rodada] ${rotina}/${diaChave}: erro inesperado, seguindo assim mesmo:`, error.message);
    return { conseguiu: true };
  }

  const { data } = await supabaseAdmin
    .from("routine_runs").select("started_at, finished_at")
    .eq("routine", rotina).eq("date_key", diaChave).maybeSingle();

  // Reserva presa: o processo anterior morreu sem fechar. Depois de um tempo, libera — senão um
  // deploy no meio da rodada trancaria a rotina até o dia seguinte.
  if (data && !data.finished_at) {
    const minutos = (Date.now() - new Date(data.started_at as string).getTime()) / 60000;
    if (minutos > MINUTOS_ATE_CONSIDERAR_TRAVADA) {
      await supabaseAdmin.from("routine_runs")
        .update({ started_at: new Date().toISOString() })
        .eq("routine", rotina).eq("date_key", diaChave);
      return { conseguiu: true };
    }
    return { conseguiu: false, motivo: `outra execução começou há ${Math.round(minutos)} min e ainda está rodando` };
  }

  return { conseguiu: false, motivo: "já rodou hoje" };
}

/** Fecha a reserva. Sem isso, a rodada fica "em andamento" até o tempo de destrave. */
export async function fecharRodada(rotina: string, diaChave: string, ok: boolean, detalhe?: string) {
  const { error } = await supabaseAdmin.from("routine_runs")
    .update({ finished_at: new Date().toISOString(), ok, detail: detalhe?.slice(0, 500) ?? null })
    .eq("routine", rotina).eq("date_key", diaChave);
  if (error) console.error(`[trava-rodada] não fechou ${rotina}/${diaChave}:`, error.message);
}
