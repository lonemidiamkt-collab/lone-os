// lib/traffic/aviso-reserva.ts — um aviso de saldo por (conta, severidade, dia), mesmo com duas rodadas juntas.
//
// 25/10/2026 (auditoria de erro recuperável, 9.8). O alerta em tempo real conferia o log, ENVIAVA e só depois
// gravava — sem checar o insert. "Sincronizar" e "Adicionar conta" disparam o mesmo alerta que o cron das 2h:
// cron + clique liam "ainda não avisado" juntos e mandavam em dobro. E se o insert falhava, o aviso saía de novo
// a cada 2 h. O mesmo valia para os alertas urgentes (terça/quinta).
//
// Agora a linha do log é a RESERVA: grava antes de enviar. Quem esbarra na chave (índice único da migration
// 20261025130000) não envia. Envio que falhou com certeza devolve a reserva (a próxima rodada tenta de novo);
// envio incerto mantém (pode ter saído — repetir é o que manda em dobro).

import { supabaseAdmin } from "@/lib/supabase/server";

export interface LinhaAviso {
  ad_account_id: string;
  cycle_key: string;
  balance_at_trigger: number;
  channel: string;
  sent_at: string;
}

export type Reserva = "reservado" | "ja-avisado" | "erro";

/** Já existe aviso com esta chave? null = não consegui ler (quem chama NÃO envia). */
export async function jaAvisado(cycleKey: string): Promise<boolean | null> {
  const { data, error } = await supabaseAdmin.from("budget_alert_log").select("id").eq("cycle_key", cycleKey).limit(1);
  if (error) {
    console.error(`[aviso-saldo] não consegui ler o log de ${cycleKey}: ${error.message}`);
    return null;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Reserva o aviso ANTES de enviar. "erro" = não deu para gravar a reserva: não envie, senão a rodada seguinte
 * (que também não vai achar a linha) manda de novo.
 */
export async function reservarAviso(linha: LinhaAviso): Promise<Reserva> {
  const ja = await jaAvisado(linha.cycle_key);
  if (ja === null) return "erro";
  if (ja) return "ja-avisado";
  const { error } = await supabaseAdmin.from("budget_alert_log").insert({ rule_id: null, ...linha });
  if (!error) return "reservado";
  if (error.code === "23505") return "ja-avisado"; // outra rodada reservou no mesmo instante
  console.error(`[aviso-saldo] não reservei ${linha.cycle_key}: ${error.message}`);
  return "erro";
}

/** O envio falhou com certeza (nada saiu): devolve a reserva para a próxima rodada poder avisar. */
export async function devolverReserva(cycleKey: string): Promise<void> {
  const { error } = await supabaseAdmin.from("budget_alert_log").delete().eq("cycle_key", cycleKey);
  if (error) console.error(`[aviso-saldo] não devolvi a reserva ${cycleKey} (o aviso só volta amanhã): ${error.message}`);
}
