// DUAS REUNIÕES NO MESMO HORÁRIO, NA MESMA PESSOA.
//
// Roberto (08/09): *"Antes de confirmar qualquer reunião: CHECK AVAILABILITY AGAIN. Mesmo que
// tenha sido consultado 20 minutos antes."* E: *"Double Booking — tolerância praticamente zero,
// porque são erros que quebram confiança."*
//
// Ele está certo sobre a janela: entre o agente propor e o cliente responder passam horas ou
// dias, e nesse intervalo o próprio social pode ter marcado outra coisa pela tela. Quem confirma
// por último ganha, e alguém descobre na hora da chamada.
//
// O QUE ESTA CHECAGEM ALCANÇA, e o que não alcança: ela lê a tabela `meetings`, que é a agenda da
// Lone. Compromisso que a pessoa tenha em outro calendário (o Google dela, um almoço) é invisível
// aqui — para isso seria preciso integrar o calendário externo, que é outra decisão. Mas o
// conflito mais provável entre reuniões de clientes da Lone é justamente com outra reunião da
// Lone, e esse fica coberto.

import { supabaseAdmin } from "@/lib/supabase/server";

export interface Conflito {
  reuniaoId: string;
  cliente: string;
  inicio: string;
  fim: string;
}

/** Duas faixas de tempo se cruzam? Fim exclusivo: 14h-15h e 15h-16h não conflitam. */
export function cruza(aIni: Date, aFim: Date, bIni: Date, bFim: Date): boolean {
  return aIni < bFim && bIni < aFim;
}

/**
 * Procura outra reunião AGENDADA da mesma pessoa que cruze com a faixa pedida.
 *
 * `ignorarId` existe para a própria reunião não conflitar consigo mesma ao ser reconfirmada.
 */
export async function conflitoDoResponsavel(
  responsavel: string | null,
  inicioIso: string,
  fimIso: string,
  ignorarId?: string,
): Promise<Conflito | null> {
  if (!responsavel) return null;
  const ini = new Date(inicioIso);
  const fim = new Date(fimIso);
  if (Number.isNaN(ini.getTime()) || Number.isNaN(fim.getTime())) return null;

  // Uma folga de um dia para cada lado cobre qualquer duração razoável de reunião; o cruzamento
  // exato é decidido aqui, não pelo banco — assim a regra é a mesma em qualquer chamador.
  const { data } = await supabaseAdmin
    .from("meetings")
    .select("id, start_at, end_at, client_id, title, clients(name, nome_fantasia)")
    .eq("responsavel", responsavel)
    .eq("estado", "agendada")
    .gte("start_at", new Date(ini.getTime() - 86400_000).toISOString())
    .lte("start_at", new Date(fim.getTime() + 86400_000).toISOString());

  for (const m of data ?? []) {
    if (ignorarId && m.id === ignorarId) continue;
    const mIni = new Date(m.start_at as string);
    const mFim = m.end_at ? new Date(m.end_at as string) : new Date(mIni.getTime() + 3600_000);
    if (cruza(ini, fim, mIni, mFim)) {
      const c = m.clients as unknown as { name?: string; nome_fantasia?: string } | null;
      return {
        reuniaoId: m.id as string,
        cliente: c?.nome_fantasia || c?.name || (m.title as string) || "outro cliente",
        inicio: m.start_at as string,
        fim: mFim.toISOString(),
      };
    }
  }
  return null;
}

/** O que o agente diz no grupo da equipe quando o horário já está ocupado. */
export function textoConflito(cliente: string, quandoExtenso: string, conf: Conflito, mencao: string): string {
  return `⚠️ ${mencao ? `${mencao} ` : ""}não fechei a reunião da *${cliente}* em *${quandoExtenso}*: `
    + `você já tem *${conf.cliente}* nesse horário.\n\n`
    + `Manda outro horário que eu levo pra ele.`;
}
