"use client";

// Miniatura do anúncio no portal. Prefere a cópia no nosso Storage (não expira) à URL da Meta CDN,
// que é assinada e vence; quebrou → placeholder com o tipo provável (arte ou vídeo).

import { useState } from "react";
import { Film, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CriativoThumb({ url, path, name, className }: {
  url: string | null;
  path: string | null;
  name: string;
  /** Tamanho/raio — padrão 56px. */
  className?: string;
}) {
  const [quebrou, setQuebrou] = useState(false);
  const src = path ? `/supabase/storage/v1/object/public/meta-thumbnails/${path}` : url;
  const base = cn("h-14 w-14 shrink-0 rounded-lg border border-border", className);

  if (!src || quebrou) {
    const nome = name.toLowerCase();
    const video = nome.includes("video") || nome.includes("vídeo") || nome.includes("reel");
    const Icone = video ? Film : ImageIcon;
    return (
      <div className={cn(base, "flex flex-col items-center justify-center gap-0.5 bg-muted")} aria-hidden>
        <Icone size={16} className="text-lone-text-tertiary" />
        <span className="text-[9px] leading-none text-lone-text-tertiary">{video ? "Vídeo" : "Arte"}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" decoding="async" onError={() => setQuebrou(true)}
      className={cn(base, "bg-muted object-cover")} />
  );
}
