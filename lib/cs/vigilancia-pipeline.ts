// A DECISÃO de cobrar um card — extraída da rota para poder ser testada.
//
// A regra que mora aqui mudou em 02/09/2026 e a mudança é a razão do arquivo existir. Antes, o
// gatilho era a IDADE do card (horas úteis parado na coluna). Isso produzia a queixa do Roberto:
//
//   "se é pra postar sexta-feira, o que que eu estou cobrando segunda? Não é mais fácil cobrar
//    quinta? … Às vezes é quarta mas ela foi programada, ele tem que entregar até a sexta."
//
// Um card criado na segunda para postar na sexta não está atrasado na terça. Cobrar ali inventa
// atraso, enche o grupo, ensina o time a ignorar — e faz o painel parecer travado quando a
// operação está no prazo.

import { businessHoursSince } from "./vigilancia";

// A vigilância cobra só social e designer — tráfego tem o próprio diagnóstico diário.
export type Area = "social" | "designer";

export interface CardRow {
  id: string; client_id: string; status: string; due_date: string | null; created_at: string | null;
  design_request_id: string | null; designer_delivered_at: string | null;
  social_confirmed_at: string | null; status_changed_at: string | null;
  column_entered_at: Record<string, string> | null; blocked_reason: string | null;
  design_request_status?: string | null; // status REAL da demanda (queued/in_progress/done)
}

const TH_SOCIAL_VER = 1;       // designer entregou e o social ainda não revisou
const TH_MANDAR_DESIGNER = 1;  // card criado sem design_request ("A fazer" não marcado)

/** Quando o card entrou no estágio atual (p/ medir "parado há X"). */
function enteredAt(c: CardRow): string | null {
  return (c.column_entered_at && c.column_entered_at[c.status]) || c.status_changed_at;
}

/**
 * Dias até o POST. Negativo = o dia do post já passou.
 *
 * Esta é a âncora da cobrança desde 02/09. Antes, o gatilho era a IDADE do card — quantas horas
 * úteis ele estava parado na coluna — e isso produzia exatamente a queixa do Roberto:
 *
 *   "se é pra postar sexta-feira, o que que eu estou cobrando segunda? Não é mais fácil cobrar
 *    quinta? … Às vezes é quarta mas ela foi programada, ele tem que entregar até a sexta."
 *
 * Um card criado na segunda para postar na sexta NÃO está atrasado na terça. Cobrar ali é
 * inventar atraso, encher o grupo e ensinar o time a ignorar — e ainda faz o painel parecer que
 * a operação está travada quando ela está no prazo.
 */
export function diasAteOPost(c: CardRow, hoje: string): number | null {
  if (!c.due_date) return null;
  const d = c.due_date.slice(0, 10);
  return Math.round((new Date(`${d}T12:00:00Z`).getTime() - new Date(`${hoje}T12:00:00Z`).getTime()) / 86400000);
}

/**
 * Avalia 1 card pelos SINAIS REAIS (não só o status do board, que costuma ficar atrasado —
 * card entregue continua parado em "Ideias"). Conservador: na dúvida NÃO cobra (regra do PDF —
 * falso positivo destrói a confiança). Só cobra o que é inequívoco e atual.
 *
 * A partir de 02/09 a pergunta deixou de ser "há quanto tempo este card está parado?" e passou a
 * ser "falta quanto para o post?". A idade continua entrando, mas só como desempate DENTRO da
 * janela do post — nunca como motivo isolado.
 */
export function avaliarPipeline(c: CardRow, hoje: string): { vigilancia: number; area: Area; motivo: string } | null {
  if (c.status === "published" || c.status === "scheduled") return null; // fluxo completo

  const faltam = diasAteOPost(c, hoje);

  // Designer JÁ entregou (sinal de plataforma confiável) → o trabalho DELE acabou: nunca cobrar
  // designer. Mas o CARD precisa andar no board — entregue e a coluna ainda atrás de Aprovação →
  // cobra o social pra revisar E MOVER. (Agendar pós-aprovação do cliente = vig 5.)
  if (c.designer_delivered_at || c.design_request_status === "done") {
    if (c.status === "approval" || c.status === "client_approval") return null; // board em dia
    const hEntrega = businessHoursSince(c.designer_delivered_at ?? enteredAt(c));
    return hEntrega >= TH_SOCIAL_VER
      ? { vigilancia: 4, area: "social", motivo: "arte entregue e o card parado no board — revisar e mover" }
      : null;
  }

  // ── Ainda NÃO entregue: aqui a data do post manda ────────────────────────
  //
  // Sem data não dá para saber se está atrasado: segue pela idade, como antes, mas só para o
  // caso mais claro (nem chegou ao designer). Cobrar produção sem prazo conhecido é chutar.
  if (faltam === null) {
    const hSemData = businessHoursSince(enteredAt(c));
    return !c.design_request_id && hSemData >= TH_MANDAR_DESIGNER
      ? { vigilancia: 2, area: "social", motivo: 'sem data de post e ainda não foi pro designer (faltou marcar "A fazer")' }
      : null;
  }

  // Post daqui a 2 dias ou mais: está NO PRAZO. Silêncio — é o caso que gerava a cobrança injusta.
  // A única exceção é o card que nem foi mandado pro designer: aí o alerta é útil justamente
  // porque ainda dá tempo de resolver sem correria.
  if (faltam >= 2) {
    return !c.design_request_id && businessHoursSince(enteredAt(c)) >= TH_MANDAR_DESIGNER
      ? { vigilancia: 1, area: "social", motivo: `post em ${faltam} dias e o card ainda não foi pro designer — dá tempo, mas manda agora` }
      : null;
  }

  const quando = faltam === 1 ? "amanhã" : faltam === 0 ? "HOJE" : `há ${-faltam} dia${-faltam > 1 ? "s" : ""}`;
  // Véspera avisa; no dia cobra; passou do dia escala. O nível sobe com a proximidade, não com a
  // poeira acumulada.
  const nivel = faltam === 1 ? 2 : faltam === 0 ? 3 : 4;

  if (c.status === "blocked")
    return { vigilancia: nivel, area: "social", motivo: `card travado${c.blocked_reason ? `: ${c.blocked_reason}` : ""} e o post é ${quando}` };

  if (!c.design_request_id)
    return { vigilancia: nivel, area: "social", motivo: `post ${quando} e o card ainda não foi pro designer (faltou marcar "A fazer")` };

  if (c.design_request_status === "in_progress")
    return { vigilancia: nivel, area: "designer", motivo: faltam < 0
      ? `era pra ter postado ${quando} e a arte não saiu da produção`
      : `o post é ${quando} e a arte ainda está em produção` };

  // Demanda "queued": o designer ainda não pegou.
  return { vigilancia: nivel, area: "designer", motivo: faltam < 0
    ? `era pra ter postado ${quando} e a arte ainda não foi pega`
    : `o post é ${quando} e a arte ainda não foi pega` };
}
