// lib/whatsapp/desfecho-envio.ts — o envio deu certo, deu errado ou NÃO SEI?
//
// 21/10/2026 (auditoria de erro recuperável, item 5.2). As rotinas tratavam "a Evolution não
// respondeu a tempo" como "não saiu": repetiam o envio e, se ainda falhasse, mandavam de novo pelo
// número do gestor. Só que timeout não quer dizer que a mensagem não saiu — quer dizer que a
// RESPOSTA não voltou. Quando a Evolution entregou e só demorou, o cliente recebia o relatório, o
// suporte ou o calendário em dobro; no NPS a linha era apagada e a hora seguinte perguntava de novo.
//
// Três desfechos, e cada um pede uma atitude:
//   • enviado → segue.
//   • falhou  → é CERTO que nada saiu (4xx, conexão recusada, "Connection Closed"). Pode repetir e
//               pode trocar de número — é para isso que existe a redundância entre os dois números.
//   • incerto → PODE ter saído (timeout, conexão que caiu no meio, 5xx genérico). Não repete, não
//               troca de número: registra como incerto e avisa o time para conferir no grupo.
//
// Puro (sem banco, sem rede): é a regra que as rotinas e os testes compartilham.

export interface FalhaEnvio {
  erro: string;
  /** true = a mensagem pode ter chegado. Nunca repetir nem trocar de número nesse caso. */
  incerto: boolean;
}

/** Códigos de rede em que a requisição nem chegou à Evolution: é certo que nada saiu. */
const NADA_SAIU_REDE = new Set([
  "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT",
]);

/**
 * Corpo de erro em que a Evolution diz, com todas as letras, que NÃO mandou: o socket do WhatsApp
 * está fechado (o "Connection Closed" de 27/07) ou o número não tem permissão naquele grupo.
 */
const NADA_SAIU_CORPO = /connection closed|connection lost|not-authorized|not authorized|forbidden|item-not-found|not a participant/i;

/** Exceção do fetch (timeout, rede) → falha certa ou incerta. */
export function falhaDeExcecao(err: unknown, timeoutMs?: number): FalhaEnvio {
  const e = (err ?? {}) as { name?: string; code?: string; cause?: { code?: string } };
  if (e.name === "AbortError" || e.name === "TimeoutError") {
    const espera = timeoutMs ? `${Math.round(timeoutMs / 1000)} s` : "o tempo limite";
    return { incerto: true, erro: `o WhatsApp não respondeu em ${espera} — pode ter saído` };
  }
  const codigo = e.cause?.code ?? e.code ?? "";
  if (NADA_SAIU_REDE.has(codigo)) return { incerto: false, erro: `não conectou na Evolution (${codigo})` };
  const msg = err instanceof Error ? err.message : String(err);
  return { incerto: true, erro: `a conexão caiu no meio do envio (${codigo || msg}) — pode ter saído` };
}

/** Resposta HTTP de erro → falha certa ou incerta. `corpo` é o texto cru que a Evolution devolveu. */
export function falhaDeResposta(status: number, corpo: string): FalhaEnvio {
  const resumo = (corpo || "").replace(/\s+/g, " ").trim().slice(0, 150);
  const erro = `HTTP ${status}${resumo ? `: ${resumo}` : ""}`;
  // 4xx: a Evolution recusou o pedido (destino inválido, número fora do grupo, config). Nada saiu.
  if (status >= 400 && status < 500) return { incerto: false, erro };
  if (NADA_SAIU_CORPO.test(corpo || "")) return { incerto: false, erro };
  // 5xx genérico (502/504 do proxy, 500 depois de a mensagem já ter ido): não dá pra saber.
  return { incerto: true, erro: `${erro} — pode ter saído` };
}

/** Pode tentar de novo / pelo outro número? Só quando é CERTO que nada saiu. */
export function podeTrocarDeNumero(r: { ok: boolean; incerto?: boolean }): boolean {
  return !r.ok && !r.incerto;
}

// ─── Registro ────────────────────────────────────────────────────────────────
//
// O log de envio (client_group_message_log, weekly_report_log) só aceita sent/failed/skipped.
// Em vez de mudar a tabela (migration que precisaria ser aplicada ANTES do deploy, senão todo
// registro incerto falharia), o incerto vai como `failed` com esta marca no começo do erro. É por
// ela que o dedup sabe que não pode reenviar e a conferência sabe que não deve mandar reenviar.

export const MARCA_INCERTO = "INCERTO";

/** O texto que vai no campo `error` do log. */
export function erroParaLog(r: { error?: string | null; incerto?: boolean }): string | null {
  if (r.incerto) return `${MARCA_INCERTO} — ${r.error || "sem resposta do WhatsApp"}`;
  return r.error ?? null;
}

/** O erro registrado é de envio incerto? */
export function ehIncerto(erro: string | null | undefined): boolean {
  return !!erro && erro.startsWith(MARCA_INCERTO);
}

/**
 * A linha do log impede um novo envio automático? Sim quando saiu — e quando PODE ter saído.
 * Reenviar o incerto às cegas é justamente o que manda em dobro; quem decide é o time, depois de
 * olhar o grupo.
 */
export function bloqueiaReenvio(linha: { status: string; error?: string | null }): boolean {
  return linha.status === "sent" || (linha.status === "failed" && ehIncerto(linha.error));
}

// ─── Aviso ao time ───────────────────────────────────────────────────────────

/**
 * Aviso de envio incerto para o grupo interno. Vazio quando não há nenhum.
 * `oQue` = "relatório", "recado", "pergunta do NPS"…; `comoReenviar` diz o caminho para quem
 * confirmar que não chegou (ex.: rodar só para o cliente).
 */
export function textoEnviosIncertos(
  oQue: string,
  itens: readonly { cliente: string; erro?: string | null }[],
  comoReenviar?: string,
): string {
  if (!itens.length) return "";
  const l = [
    `❓ *Não sei se ${oQue} chegou em ${itens.length} ${itens.length === 1 ? "grupo" : "grupos"}* — o WhatsApp não confirmou a tempo, então pode ter saído:`,
  ];
  for (const i of itens.slice(0, 8)) l.push(`• *${i.cliente}*`);
  if (itens.length > 8) l.push(`• …e mais ${itens.length - 8}`);
  l.push("");
  l.push("_Não reenviei para não mandar em dobro. Confira no grupo: se não chegou, "
    + (comoReenviar ? `${comoReenviar}._` : "reenvie só para ele._"));
  return l.join("\n");
}
