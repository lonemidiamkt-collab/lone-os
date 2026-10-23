// lib/cs/envio-cliente.ts — O QUE O LONINHO MANDA NO GRUPO DO CLIENTE A PEDIDO DO TIME passa por
// uma prévia e um "ok". Regras puras (tests/cs-envio-cliente.test.ts); banco e WhatsApp em
// lib/cs/envio-cliente-server.ts.
//
// POR QUE (21/10/2026, auditoria de erro recuperável, 5.7). "Loninho, cobra as pendências do X pro
// cliente" e "faz o check-in do X pro cliente" mandavam DIRETO no grupo do cliente: o cliente era
// achado por nome aproximado, o texto da cobrança era da IA, ninguém via antes. O resultado do envio
// era ignorado — o time recebia "✅ Mandei" mesmo quando nada saiu — e a chave
// `pendencias:<cliente>:<dia>` era gravada e nunca consultada (dava pra cobrar 3× no mesmo dia).
// O que sai para o cliente é irreversível (regra 7 de docs/ERRO_RECUPERAVEL.md): prévia com o
// cliente e o texto, "ok" citando a prévia, e só então o envio — conferido.

export type TipoEnvio = "cobranca_pendencias" | "checkin";

/** A prévia vale um dia: depois disso as pendências podem ter mudado. */
export const VALIDADE_PREVIA_H = 24;

const ROTULO: Record<TipoEnvio, string> = {
  cobranca_pendencias: "cobrança das pendências",
  checkin: "check-in",
};

/** Mesma chave que já ia para cs_cobrancas — agora também é consultada antes de mandar. */
export function chaveCobrancaPendencias(clientId: string, diaSP: string): string {
  return `pendencias:${clientId}:${diaSP}`;
}

/** A prévia no grupo interno: QUEM recebe e O QUE vai, antes de qualquer coisa sair. */
export function textoPrevia(tipo: TipoEnvio, cliente: string, texto: string): string {
  return `📤 *Prévia — ${ROTULO[tipo]} pro grupo do cliente*\n`
    + `Cliente: *${cliente}*\n\n`
    + `${texto}\n\n`
    + `👉 Responde *ok* NESTA mensagem que eu mando no grupo da *${cliente}*. *não* cancela.\n`
    + `_Se não for esse cliente, responde não e me pede de novo com o nome completo._`;
}

const ENVIAR_1 = new Set(["ok", "okay", "sim", "isso", "pode", "manda", "mande", "envia", "envie", "confirmo", "confirmado", "confirma", "beleza", "blz", "fechado"]);
const ENVIAR_RESTO = new Set(["ok", "sim", "pode", "mandar", "manda", "mande", "enviar", "envia", "envie", "ir", "isso", "ai", "la", "pra", "ele", "ela", "por", "favor", "pf", "pfv"]);
const CANCELAR_1 = new Set(["nao", "cancela", "cancelar", "cancelado", "cancele", "descarta", "esquece", "deixa"]);
const CANCELAR_RESTO = new Set(["manda", "mandar", "envia", "enviar", "precisa", "pode", "cancela", "isso", "pra", "la", "quieto", "nao", "obrigado", "valeu"]);

/**
 * "ok"/"não" na prévia — e SÓ isso. "ok, mas muda o segundo parágrafo" não libera envio: qualquer
 * palavra fora do vocabulário de sim/não devolve null, e o agente explica o que responder.
 */
export function lerDecisaoEnvio(texto: string): "enviar" | "cancelar" | null {
  if (/^\s*(?:👍|✅|👌)+\s*$/u.test(texto || "")) return "enviar";
  const palavras = (texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  if (!palavras.length) return null;
  const [p1, ...resto] = palavras;
  if (ENVIAR_1.has(p1) && resto.every((w) => ENVIAR_RESTO.has(w))) return "enviar";
  if (CANCELAR_1.has(p1) && resto.every((w) => CANCELAR_RESTO.has(w))) return "cancelar";
  return null;
}

export type DesfechoEnvio = "enviado" | "falhou" | "incerto";

/**
 * O que aconteceu com o envio. Timeout/queda no meio é INCERTO: a mensagem pode ter saído — não se
 * reenvia sozinho (mandar duas vezes ao cliente é pior que pedir pro time conferir).
 */
export function desfechoDoEnvio(r: { ok: boolean; error?: string | null }): DesfechoEnvio {
  if (r.ok) return "enviado";
  const e = (r.error || "").toLowerCase();
  if (/timeout|timed out|abort|socket hang up|econnreset|fetch failed|other side closed/.test(e)) return "incerto";
  return "falhou";
}

export function previaVencida(criadaEm: string | null | undefined, agora: Date): boolean {
  if (!criadaEm) return false;
  return agora.getTime() - new Date(criadaEm).getTime() > VALIDADE_PREVIA_H * 3600_000;
}

const normTexto = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Qual prévia a mensagem cita, quando o id não bate (o id de envio às vezes difere do que volta no
 * reply). A prévia traz o texto inteiro: casa pelo começo do texto E pelo cliente. Só devolve com UM
 * candidato — com dois, ninguém manda nada no escuro.
 */
export function previaPeloTexto<T extends { texto: string; cliente_nome: string }>(
  previas: T[], citado: string | null | undefined,
): T | null {
  const q = normTexto(citado);
  if (!q || !q.includes("previa")) return null;
  const hits = previas.filter((p) => {
    const inicio = normTexto(p.texto).slice(0, 80);
    return inicio.length >= 10 && q.includes(inicio) && q.includes(normTexto(p.cliente_nome));
  });
  return hits.length === 1 ? hits[0] : null;
}

/** As respostas ao time, uma por desfecho. */
export const RESPOSTA = {
  enviado: (tipo: TipoEnvio, cliente: string) =>
    `✅ Mandei ${tipo === "checkin" ? "o check-in" : "a cobrança"} no grupo da *${cliente}*.`
    + (tipo === "checkin" ? " Quando ele responder, eu registro na ficha (aba *Jornada CS*)." : ""),
  falhou: (cliente: string, erro: string) =>
    `❌ Não consegui mandar no grupo da *${cliente}* (${erro.slice(0, 120)}). *Nada saiu.* Responde *ok* de novo na prévia pra tentar outra vez.`,
  incerto: (cliente: string) =>
    `⚠️ O WhatsApp não respondeu a tempo e eu *não sei se a mensagem chegou* no grupo da *${cliente}*. Confere lá — não vou reenviar sozinho pra não mandar duas vezes.`,
  cancelado: (cliente: string) => `👍 Cancelei — não mandei nada pra *${cliente}*.`,
  jaEnviadoHoje: (cliente: string) =>
    `Já mandei a cobrança das pendências pra *${cliente}* hoje — não mando de novo no mesmo dia.`,
  checkinAberto: (cliente: string) =>
    `A *${cliente}* ainda não respondeu o check-in anterior (de menos de 48h). Não mando outro em cima.`,
  vencida: (cliente: string) =>
    `Essa prévia da *${cliente}* passou de ${VALIDADE_PREVIA_H}h — me pede de novo que eu monto com o que vale agora.`,
  jaDecidida: (cliente: string, status: string) =>
    `Essa prévia da *${cliente}* já foi ${status === "enviado" ? "enviada" : status === "cancelado" ? "cancelada" : status === "incerto" ? "tentada (e ficou sem confirmação — confere no grupo)" : "decidida"}. 😉`,
  naoEntendi: () => `Pra essa prévia eu só entendo *ok* (mando) ou *não* (cancelo).`,
  naoConferiu: (erro: string) =>
    `Não consegui conferir se já mandei hoje (${erro.slice(0, 100)}) — *não mandei nada*. Responde *ok* de novo daqui a pouco.`,
  semAutoridade: () => `Só alguém do time (com papel no painel) pode liberar mensagem pro cliente. Não mandei nada.`,
} as const;
