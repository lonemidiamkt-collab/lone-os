// lib/prospeccao/resumo-disparo.ts — o que aconteceu de verdade quando alguém clicou "Disparar próxima"
// ou "Montar fila agora" na Prospecção. PURO (tests/prospeccao-disparo-manual.test.ts).
//
// POR QUE (25/10/2026, auditoria de erro recuperável, 14.1). A tela lia `pulado`, mas a rota da abordagem
// devolve `pulados[]` e `abordagens[].ok`: com o piloto desligado ou o envio falhando, o aviso dizia
// "Abordagem: ok". E o botão mandava a 1ª mensagem ao 1º da fila sem dizer a quem.
// O piloto SDR está DESLIGADO desde 17/10/2026 — nada aqui o liga; só faz o aviso dizer a verdade.

export type TomAviso = "sucesso" | "aviso" | "erro";

export interface ResumoDisparo { tom: TomAviso; texto: string }

interface Envio { nome: string; ok: boolean; erro?: string }

/** Resultado da rota prospect-outbound (abordagem + follow-ups + retomadas). */
export function resumoDaAbordagem(r: {
  abordagens?: Envio[]; followups?: Envio[]; retomadas?: Envio[]; pulados?: string[]; pulado?: string;
} | null | undefined): ResumoDisparo {
  const abordagens = r?.abordagens ?? [];
  const extras = [...(r?.followups ?? []), ...(r?.retomadas ?? [])];
  const enviadas = abordagens.filter((a) => a.ok);
  const falhas = [...abordagens, ...extras].filter((a) => !a.ok);
  const outros = extras.filter((a) => a.ok).length;
  const pulados = [...(r?.pulados ?? []), ...(r?.pulado ? [r.pulado] : [])];
  const resto = outros ? ` · ${outros} follow-up/retomada enviado(s)` : "";

  if (falhas.length) {
    const lista = falhas.slice(0, 3).map((f) => `${f.nome}: ${f.erro ?? "falhou"}`).join("; ");
    return { tom: "erro", texto: `Não saiu para ${falhas.length === 1 ? "1 prospect" : `${falhas.length} prospects`} — ${lista}.${enviadas.length ? ` Saiu para: ${enviadas.map((e) => e.nome).join(", ")}.` : ""}` };
  }
  if (enviadas.length) return { tom: "sucesso", texto: `Abordagem enviada para ${enviadas.map((e) => e.nome).join(", ")}.${resto}` };
  if (outros) return { tom: "sucesso", texto: `Nenhuma abordagem nova${pulados.length ? ` (${pulados.join("; ")})` : ""}${resto}.` };
  if (pulados.length) return { tom: "aviso", texto: `Nada foi enviado: ${pulados.join("; ")}.` };
  return { tom: "aviso", texto: "Nada foi enviado: a fila de hoje está vazia." };
}

/** Resultado da rota prospect-ranking ("Montar fila agora"). */
export function resumoDoRanking(r: Record<string, unknown> | null | undefined): ResumoDisparo {
  if (r?.pulado) return { tom: "aviso", texto: `Fila não montada: ${String(r.pulado)}.` };
  const fila = Array.isArray(r?.fila) ? (r!.fila as unknown[]).length : typeof r?.selecionados === "number" ? (r.selecionados as number) : null;
  return { tom: "sucesso", texto: fila === null ? "Ranking refeito." : `Ranking refeito: ${fila} na fila de hoje.` };
}

/**
 * 25/10/2026 (auditoria 14.3): "Marcar reunião" criava o evento com convite do Google para o prospect num
 * clique, sem mostrar quem recebe nem quando. A prévia diz os dois antes.
 */
export function textoConfirmarReuniao(p: { nome: string; email: string | null; quandoIso: string; tipo: "visita" | "online" }): string {
  const quando = new Date(p.quandoIso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const oQue = p.tipo === "visita" ? "Visita presencial" : "Reunião online (Google Meet)";
  const convite = p.email
    ? `Com o Google conectado, o convite vai AGORA para ${p.email} — não dá para desfazer o e-mail.`
    : "Sem e-mail no cadastro: nenhum convite sai, o evento fica só na agenda da Lone.";
  return `${oQue} com ${p.nome}\n${quando}\n\n${convite}\n\nMarcar?`;
}

/** A pergunta antes de disparar — diz a quem vai, que é a IA que escreve, e que o envio é real. */
export function textoConfirmarDisparo(primeiro: { nome: string; decisor_nome?: string | null } | null): string {
  if (!primeiro) return "A fila de hoje está vazia — não há para quem mandar. Disparar mesmo assim (só follow-ups vencidos)?";
  return `Mandar AGORA a 1ª abordagem para ${primeiro.nome}${primeiro.decisor_nome ? ` (${primeiro.decisor_nome})` : ""}?\n\nO texto é escrito pela IA na hora do envio e sai pelo WhatsApp do agente — não dá para desfazer. Quality gate e teto do dia continuam valendo.`;
}
