// lib/imagem/phash.ts — "esta arte é aquele anúncio?" sem ninguém dizer.
//
// dHash (difference hash): reduz a imagem a 9×8 em cinza e guarda, bit a bit, se cada pixel é mais
// claro que o vizinho da direita → 64 bits. Duas imagens iguais dão o mesmo hash; a mesma arte
// recortada/comprimida pela Meta fica a poucos bits de distância; artes diferentes ficam longe.
// Serve para casar a arte entregue pelo designer (card_attachments) com o anúncio que subiu
// (creative_snapshots) — o elo que fecha o ciclo pai × filho.

import sharp from "sharp";

export async function dhash(imagem: Buffer): Promise<string> {
  const { data } = await sharp(imagem).flatten({ background: "#ffffff" }).grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let bits = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += data[y * 9 + x] < data[y * 9 + x + 1] ? "1" : "0";
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function distancia(a: string, b: string): number {
  // 16 hex = 64 bits; compara nibble a nibble (sem BigInt literal: o target do tsconfig é < ES2020)
  let n = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i] ?? "0", 16) ^ parseInt(b[i] ?? "0", 16);
    while (x) { n += x & 1; x >>= 1; }
  }
  return n;
}

/** Até onde é "a mesma arte": recorte/compressão da Meta costuma ficar ≤ 8; peças diferentes > 20. */
export const LIMIAR_MESMA_ARTE = 10;

export async function hashDaUrl(url: string, timeoutMs = 20_000): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/")) return null;
    return await dhash(Buffer.from(await r.arrayBuffer()));
  } catch {
    return null;
  }
}
