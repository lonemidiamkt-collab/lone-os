// lib/meta/link-assinado.ts — o link de imagem da Meta tem prazo de validade dentro dele.
//
// As miniaturas do CDN da Meta (fbcdn.net) são URLs assinadas: o parâmetro `oe` é o vencimento em
// segundos Unix, em hexadecimal. Passou disso, a Meta devolve 403 — pra nós e pra OpenAI.
//
// 30/09/2026: a rotina de atributos dos criativos ficava vermelha com "Error while downloading
// file. Upstream status code: 403". Os anúncios tinham sido capturados em 25/09; os links venceram
// em 26 e 29/09, no meio do apagão da OpenAI, antes de a rotina conseguir processar. E já
// acontecia antes (24/09): anúncio que parou de gastar não é recapturado, e o link envelhece.

/** Quando o link vence, ou null se não dá pra saber (sem `oe`, ou não é da Meta). */
export function vencimentoDoLink(url: string | null | undefined): Date | null {
  if (!url) return null;
  const m = url.match(/[?&]oe=([0-9A-Fa-f]{6,10})(?:&|$)/);
  if (!m) return null;
  const s = parseInt(m[1], 16);
  return Number.isFinite(s) && s > 0 ? new Date(s * 1000) : null;
}

/**
 * O link já venceu (ou vence antes de dar tempo de usar)? Sem vencimento legível devolve false:
 * na dúvida tenta usar — um link que não é da Meta não tem por que ser tratado como velho.
 */
export function linkVencido(url: string | null | undefined, agora: Date, folgaMs = 3600_000): boolean {
  const v = vencimentoDoLink(url);
  return !!v && v.getTime() - folgaMs <= agora.getTime();
}

/** O erro da OpenAI (ou nosso) que quer dizer "não consegui baixar a imagem", não "a IA falhou". */
export function erroDeImagemIndisponivel(erro: string | null | undefined): boolean {
  return /error while downloading file|upstream status code:\s*4\d\d|failed to download image|invalid image url/i.test(erro ?? "");
}
