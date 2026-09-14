import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { dhash, distancia, LIMIAR_MESMA_ARTE } from "@/lib/imagem/phash";

// A mesma arte, comprimida e recortada pela Meta, tem que continuar "a mesma"; outra arte, não.
async function arte(cor: string, texto: number): Promise<Buffer> {
  // um gradiente + um bloco: imagem sintética com estrutura (não uniforme)
  const svg = `<svg width="400" height="500"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${cor}"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>
    <rect width="400" height="500" fill="url(#g)"/><rect x="${40 + texto * 30}" y="200" width="200" height="90" fill="#111"/><circle cx="300" cy="120" r="${30 + texto * 10}" fill="#f5c400"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("dHash", () => {
  it("mesma arte comprimida em JPEG e recortada 4% = mesma; arte diferente = longe", async () => {
    const original = await arte("#1a2b6d", 0);
    const jpegRecortado = await sharp(original).extract({ left: 8, top: 10, width: 384, height: 480 }).jpeg({ quality: 60 }).toBuffer();
    // outra peça: composição diferente (gradiente vertical, blocos em outro lugar, sem círculo)
    const outra = await sharp(Buffer.from(`<svg width="400" height="500"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#222"/></linearGradient></defs>
      <rect width="400" height="500" fill="url(#g)"/><rect x="20" y="20" width="360" height="60" fill="#111"/><rect x="20" y="400" width="120" height="80" fill="#eee"/><rect x="260" y="380" width="120" height="100" fill="#000"/></svg>`)).png().toBuffer();
    const h1 = await dhash(original), h2 = await dhash(jpegRecortado), h3 = await dhash(outra);
    expect(h1).toHaveLength(16);
    expect(distancia(h1, h2)).toBeLessThanOrEqual(LIMIAR_MESMA_ARTE);
    expect(distancia(h1, h3)).toBeGreaterThan(LIMIAR_MESMA_ARTE);
    expect(distancia(h1, h1)).toBe(0);
  });
});
