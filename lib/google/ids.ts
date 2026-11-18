// lib/google/ids.ts — o ID da conta do Google Ads, puro (a ficha, no navegador, também usa).

/** "123-456-7890" ou "1234567890" → "1234567890". Outra coisa → null. */
export function normalizarIdAds(v: string | null | undefined): string | null {
  const d = String(v ?? "").replace(/[\s-]/g, "");
  return /^\d{10}$/.test(d) ? d : null;
}

/** "1234567890" → "123-456-7890" (como o Google Ads mostra). */
export function formatarIdAds(v: string | null | undefined): string {
  const d = normalizarIdAds(v);
  return d ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : String(v ?? "");
}
