"use client";

import { useEffect, RefObject } from "react";

interface UseImagePasteOptions {
  enabled: boolean;
  onPaste: (files: File[]) => void;
  containerRef?: RefObject<HTMLElement | null>;
}

export function useImagePaste({ enabled, onPaste, containerRef }: UseImagePasteOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: ClipboardEvent) => {
      // Não intercepta paste em inputs e textareas — usuário está digitando
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind !== "file") continue;
        if (!item.type.startsWith("image/")) continue;
        const raw = item.getAsFile();
        if (!raw) continue;
        // Renomeia para timestamp — getAsFile() retorna "image.png" genérico
        const ext = raw.type.split("/")[1] ?? "png";
        const renamed = new File([raw], `paste_${Date.now()}.${ext}`, { type: raw.type });
        imageFiles.push(renamed);
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        onPaste(imageFiles);
      }
    };

    const target = containerRef?.current ?? document;
    target.addEventListener("paste", handler as EventListener);
    return () => target.removeEventListener("paste", handler as EventListener);
  }, [enabled, onPaste, containerRef]);
}
