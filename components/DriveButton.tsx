"use client";

import { FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface DriveButtonProps {
  driveLink?: string;
  clientName?: string;
  size?: "sm" | "md";
  className?: string;
}

export default function DriveButton({ driveLink, clientName, size = "sm", className }: DriveButtonProps) {
  const hasLink = !!driveLink;
  const isValid = hasLink && driveLink.includes("drive.google.com");

  if (size === "md") {
    return (
      <button
        onClick={() => isValid && window.open(driveLink, "_blank", "noopener,noreferrer")}
        disabled={!isValid}
        title={isValid ? `Abrir pasta Drive — ${clientName || "Cliente"}` : "Link do Drive n\u00e3o configurado"}
        className={cn(
          "group flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-200",
          isValid
            ? "border-[#0a34f5]/20 bg-[#0a34f5]/[0.04] hover:border-[#0a34f5]/50 hover:bg-[#0a34f5]/[0.08] hover:shadow-[0_0_20px_rgba(10,52,245,0.15)] cursor-pointer"
            : "border-zinc-800/50 bg-zinc-900/30 cursor-not-allowed opacity-50",
          className
        )}
      >
        <div className={cn(
          "w-7 h-7 rounded-lg flex items-center justify-center transition-all",
          isValid
            ? "bg-[#0a34f5]/15 shadow-[0_0_10px_rgba(10,52,245,0.2)] group-hover:shadow-[0_0_16px_rgba(10,52,245,0.4)]"
            : "bg-zinc-800/50"
        )}>
          <FolderOpen size={14} className={cn(
            "transition-all",
            isValid
              ? "text-[#0a34f5] drop-shadow-[0_0_4px_rgba(10,52,245,0.6)] group-hover:drop-shadow-[0_0_8px_rgba(10,52,245,0.8)]"
              : "text-zinc-600"
          )} />
        </div>
        <div className="text-left">
          <p className={cn(
            "text-[11px] font-medium leading-tight",
            isValid ? "text-foreground" : "text-zinc-600"
          )}>
            Pasta Drive
          </p>
          <p className="text-[9px] text-muted-foreground">
            {isValid ? "Abrir em nova aba" : "N\u00e3o configurado"}
          </p>
        </div>
      </button>
    );
  }

  // size === "sm" (compact)
  return (
    <button
      onClick={() => isValid && window.open(driveLink, "_blank", "noopener,noreferrer")}
      disabled={!isValid}
      title={isValid ? `Abrir pasta Drive — ${clientName || "Cliente"}` : "Link do Drive n\u00e3o configurado"}
      className={cn(
        "group relative w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200",
        isValid
          ? "border border-[#0a34f5]/20 bg-[#0a34f5]/[0.06] hover:border-[#0a34f5]/50 hover:bg-[#0a34f5]/[0.12] hover:shadow-[0_0_16px_rgba(10,52,245,0.25)] cursor-pointer"
          : "border border-zinc-800/40 bg-zinc-900/20 cursor-not-allowed",
        className
      )}
    >
      <FolderOpen size={14} className={cn(
        "transition-all",
        isValid
          ? "text-[#0a34f5] drop-shadow-[0_0_4px_rgba(10,52,245,0.6)] group-hover:drop-shadow-[0_0_8px_rgba(10,52,245,0.8)]"
          : "text-zinc-600"
      )} />
    </button>
  );
}
