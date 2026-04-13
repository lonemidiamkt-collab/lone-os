"use client";

import { Loader2 } from "lucide-react";

interface Props {
  message?: string;
  size?: "sm" | "md" | "lg";
}

export default function LoadingSpinner({ message, size = "md" }: Props) {
  const iconSize = size === "sm" ? 16 : size === "lg" ? 28 : 20;

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <Loader2
        size={iconSize}
        className="text-[#0d4af5] animate-spin"
      />
      {message && (
        <p className="text-xs text-zinc-500">{message}</p>
      )}
    </div>
  );
}
