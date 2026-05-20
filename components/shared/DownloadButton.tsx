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
 * Botão de download compatível com URLs cross-origin (Supabase Storage, Google Drive).
 * Usa window.open em vez de <a download> — o atributo download é bloqueado por browsers
 * para URLs cross-origin desde Chrome 65 (política de segurança).
 */
export default function DownloadButton({ url, title, className, size = "sm" }: DownloadButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setState("loading");

    // Google Drive: converte link de visualização para link de download direto
    let downloadUrl = url;
    if (url.includes("drive.google.com/file/d/")) {
      const fileId = url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
      if (fileId) downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    }

    window.open(downloadUrl, "_blank");
    setState("done");
    setTimeout(() => setState("idle"), 2000);
  };

  const iconSize = size === "md" ? 13 : 10;

  return (
    <button
      onClick={handleDownload}
      title={title ? `Baixar: ${title}` : "Baixar arte"}
      className={cn(
        "flex items-center gap-1 transition-colors",
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
      {state === "done" ? "Aberto!" : "Baixar Arte"}
    </button>
  );
}
