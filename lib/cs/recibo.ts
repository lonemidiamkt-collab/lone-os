// ── RECIBO NÃO É RESPOSTA ───────────────────────────────────────────────────
//
// Medido em 02/09/2026, três mensagens seguidas do Loninho no grupo da Equipe às 09:42:
//   "Vou ficar mais atenta, pode deixar! ⚠️"
//   "Beleza, vou focar mais nisso daqui pra frente!"
//   "Anotado! Vou lembrar disso 📝"
//
// Nenhuma carrega um dado, um nome, um prazo ou uma pergunta. É o agente acusando recebimento de
// cada fala do time, uma por uma. O campo `ignorar` do modelo de conversa não pega isto porque as
// mensagens ERAM dirigidas a ele — a falha não é de destinatário, é de valor: acusar recebimento
// custa uma notificação no celular de seis pessoas e não move nada.
//
// Regra aplicada em responderPapo: se a resposta é só cortesia E ninguém chamou o Loninho pelo
// nome, ele não fala. Quando chamam direto, responde sempre — silêncio com quem te chamou é
// grosseria, não economia.

const RX_SO_CORTESIA =
  /^(?:ok|opa|beleza|blz|show|boa|massa|perfeito|combinado|anotado|anotei|entendido|entendi|certo|fechado|tranquilo|pode deixar|sem problema|t[áa] certo|vou (?:ficar|focar|lembrar|anotar|ver|prestar)|vou considerar|obrigad[ao]|valeu)(?=[\s,.!…]|$)/iu;

/**
 * True quando a resposta não carrega NADA além de reconhecimento.
 *
 * Conservador de propósito: qualquer número, pergunta, lista ou nome próprio já a considera
 * informativa. Calar uma resposta útil é pior que deixar passar uma cortesia.
 */
export function ehSoRecibo(resposta: string): boolean {
  // Tira emoji/pontuação da frente antes de olhar a primeira palavra ("✅ Beleza…" é recibo igual).
  const t = resposta.trim().replace(/^[^\p{L}\p{N}]+/u, "").trim();
  if (!t) return true;
  if (t.length > 120) return false;      // resposta longa costuma trazer conteúdo
  if (/\d/.test(t)) return false;        // número = dado (prazo, quantidade, valor)
  if (/\?/.test(t)) return false;        // perguntou algo = espera resposta
  if (/\n\s*[•\-*]/.test(t)) return false; // lista = conteúdo
  if (!RX_SO_CORTESIA.test(t)) return false;

  // Nome próprio indica de quem/do que se trata ("Beleza, o Contele ficou pronto") — e aí a
  // mensagem informa, não é recibo. Mas maiúscula NÃO é sinal suficiente: toda frase começa com
  // uma. "Anotado! Vou lembrar disso" tem dois inícios de frase e nenhum nome próprio.
  // Só conta como nome próprio a maiúscula que aparece NO MEIO de uma frase.
  const semInicios = t
    .replace(/^[^]*?(?=$)/u, (m) => m)      // no-op, mantém o texto
    .split(/(?<=[.!?…])\s+/u)               // quebra em frases
    .map((frase) => frase.replace(/^\S+\s*/u, "")) // tira a primeira palavra de cada uma
    .join(" ");
  if (/(?:^|[\s(])[A-ZÁÉÍÓÚÂÊÔÃÕÇ]\p{L}{2,}/u.test(semInicios)) return false;

  return true;
}
