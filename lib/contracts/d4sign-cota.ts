// lib/contracts/d4sign-cota.ts — o limite de chamadas da D4Sign.
//
// A conta da D4Sign responde, por padrão, a 10 chamadas por HORA ("Introdução a API", docapi.d4sign.com.br;
// para subir, comercial@d4sign.com.br). D4SIGN_LIMITE_HORA ajusta quando o limite mudar.
//
// Cada chamada fica em d4sign_chamadas. As rotinas (consulta do cofre e lembrete) param antes de gastar as
// últimas RESERVA chamadas da hora: elas sobram para o que alguém está esperando — o webhook, o PDF
// assinado e o "Enviar pela D4Sign" da tela. Passou do limite, a chamada nem sai: volta "limite" e quem
// chamou tenta depois (o webhook responde 503 e a D4Sign repete; a consulta tenta na rodada seguinte).
//
// O contador é proteção, não verdade: se o banco não responder, a chamada segue (e a D4Sign é quem recusa).

import { supabaseAdmin } from "@/lib/supabase/server";

export type OrigemChamada = "webhook" | "consulta" | "envio" | "pdf" | "lembrete" | "manual";

export const LIMITE_PADRAO_HORA = 10;
export const RESERVA = 4;
const ROTINAS: OrigemChamada[] = ["consulta", "lembrete"];

export function limiteDaHora(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.D4SIGN_LIMITE_HORA);
  return Number.isInteger(n) && n > 0 ? n : LIMITE_PADRAO_HORA;
}

/** Quantas chamadas esta origem ainda pode fazer agora. Pura. */
export function cabemAinda(usadas: number, limite: number, origem: OrigemChamada): number {
  const teto = ROTINAS.includes(origem) ? Math.max(0, limite - RESERVA) : limite;
  return Math.max(0, teto - usadas);
}

/** Reserva uma chamada (conta a última hora e registra). Nunca lança. */
export async function reservarChamada(caminho: string, origem: OrigemChamada, limite = limiteDaHora()):
  Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const desde = new Date(Date.now() - 3600_000).toISOString();
    const r = await supabaseAdmin.from("d4sign_chamadas").select("id").gte("em", desde);
    if (r.error) {
      console.warn(`[d4sign-cota] não consegui contar as chamadas (${r.error.message}) — sigo sem o contador`);
      return { ok: true };
    }
    const usadas = r.data?.length ?? 0;
    if (cabemAinda(usadas, limite, origem) <= 0) {
      return {
        ok: false,
        erro: ROTINAS.includes(origem)
          ? `limite de chamadas da D4Sign quase no fim nesta hora (${usadas} de ${limite}); a rotina deixa as últimas para quem está esperando`
          : `limite de chamadas da D4Sign nesta hora (${usadas} de ${limite}); tente de novo em alguns minutos`,
      };
    }
    const ins = await supabaseAdmin.from("d4sign_chamadas").insert({ caminho: caminho.split("?")[0], origem });
    if (ins.error) console.warn(`[d4sign-cota] não registrei a chamada: ${ins.error.message}`);
    return { ok: true };
  } catch (e) {
    console.warn("[d4sign-cota] contador indisponível:", e instanceof Error ? e.message : e);
    return { ok: true };
  }
}
