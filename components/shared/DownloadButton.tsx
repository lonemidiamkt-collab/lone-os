"use client";

import { useState } from "react";
import { Download, Loader, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface DownloadButtonProps {
  url: string;
  title?: string;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Botão de download real — força o download do arquivo em vez de abrir no browser.
 *
 * Para URLs do Supabase Storage (mesma origem: painel.lonemidia.com):
 *   fetch → blob → createObjectURL → <a download> → click
 *   Funciona para PNG, JPEG, PDF, MP4, qualquer tipo.
 *
 * Para Google Drive:
 *   Converte view-link → download-link e abre em nova aba (sem CORS).
 *
 * Fallback (qualquer erro): window.open na mesma URL.
 */
export default function DownloadButton({ url, title, className, size = "sm" }: DownloadButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (state === "loading") return;
    setState("loading");

    try {
      // Google Drive — cross-origin, não tem CORS, usa window.open
      if (url.includes("drive.google.com")) {
        const fileId = url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
        const driveUrl = fileId
          ? `https://drive.google.com/uc?export=download&id=${fileId}`
          : url;
        window.open(driveUrl, "_blank");
        setState("done");
        setTimeout(() => setState("idle"), 2000);
        return;
      }

      // Supabase Storage (mesma origem) — fetch como blob para download real
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Derivar extensão do Content-Type se o título não tiver
      const contentType = res.headers.get("content-type") ?? "";
      const ext = contentType.includes("pdf") ? ".pdf"
        : contentType.includes("mp4") ? ".mp4"
        : contentType.includes("webm") ? ".webm"
        : contentType.includes("png") ? ".png"
        : contentType.includes("jpeg") || contentType.includes("jpg") ? ".jpg"
        : contentType.includes("webp") ? ".webp"
        : contentType.includes("gif") ? ".gif"
        : "";

      const filename = title
        ? (title.includes(".") ? title : `${title}${ext}`)
        : `arte${ext}`;

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);

      setState("done");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      // Fallback: abre em nova aba
      window.open(url, "_blank");
      setState("done");
      setTimeout(() => setState("idle"), 2000);
    }
  };

  const iconSize = size === "md" ? 13 : 10;

  return (
    <button
      onClick={handleDownload}
      disabled={state === "loading"}
      title={title ? `Baixar: ${title}` : "Baixar arte"}
      className={cn(
        "flex items-center gap-1 transition-colors disabled:opacity-60",
        size === "md"
          ? "text-[11px] px-3 py-1.5 rounded-lg font-medium border border-white/[0.06] bg-white/[0.04] text-zinc-300 hover:text-white hover:bg-white/[0.1]"
          : "text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary hover:bg-primary/25",
        className
      )}
    >
      {state === "loading" ? (
        <Loader size={iconSize} className="animate-spin" />
      ) : state === "done" ? (
        <CheckCircle size={iconSize} className="text-emerald-400" />
      ) : (
        <Download size={iconSize} />
      )}
      {state === "loading" ? "Baixando..." : state === "done" ? "Baixado!" : "Baixar Arte"}
    </button>
  );
}
