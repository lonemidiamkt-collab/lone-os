// lib/clients/logo-data-uri.ts — a logo do cliente como data: URI, para embutir em PDF.
//
// O renderizador de PDF (container chromium) não alcança o storage interno nem o domínio do painel,
// então imagem por URL sai quebrada no arquivo. Mesma leitura de /api/clients/[id]/logo: bucket
// brand-assets pelo service role, ou URL http(s) pública. Nunca lança: sem logo, null.

import { supabaseAdmin } from "@/lib/supabase/server";

const TETO_BYTES = 2_500_000; // logo maior que isso não cabe num PDF de uma página

export async function logoComoDataUri(docLogo: string | null | undefined): Promise<string | null> {
  if (!docLogo) return null;
  try {
    let bytes: ArrayBuffer;
    let mime: string;
    const marker = "/brand-assets/";
    if (docLogo.includes(marker)) {
      const objectPath = decodeURIComponent(docLogo.slice(docLogo.indexOf(marker) + marker.length));
      const { data: blob, error } = await supabaseAdmin.storage.from("brand-assets").download(objectPath);
      if (error || !blob) return null;
      bytes = await blob.arrayBuffer();
      mime = blob.type || "image/png";
    } else if (/^https?:\/\//.test(docLogo)) {
      const r = await fetch(docLogo, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      bytes = await r.arrayBuffer();
      mime = r.headers.get("content-type") || "image/png";
    } else {
      return null;
    }
    if (!mime.startsWith("image/") || bytes.byteLength > TETO_BYTES) return null;
    return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}
