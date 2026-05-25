import { useEffect } from "react";

/**
 * Fecha modais/overlays via tecla ESC. Use junto com `enabled` pra ativar
 * só quando o overlay estiver aberto — evita listener "fantasma" rodando
 * o tempo todo.
 *
 * Ex.: useEscapeKey(open, onClose)
 */
export function useEscapeKey(enabled: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, onEscape]);
}
