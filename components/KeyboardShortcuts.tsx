"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/lib/context/RoleContext";
import type { Role } from "@/lib/types";

const SHORTCUTS: { keys: [string, string]; label: string; href: string; roles: Role[] }[] = [
  { keys: ["g", "d"], label: "Dashboard", href: "/", roles: ["admin", "manager", "traffic", "social", "designer"] },
  { keys: ["g", "t"], label: "Tráfego Pago", href: "/traffic", roles: ["admin", "manager", "traffic"] },
  { keys: ["g", "s"], label: "Social Media", href: "/social", roles: ["admin", "manager", "social", "designer"] },
  { keys: ["g", "c"], label: "Clientes", href: "/clients", roles: ["admin", "manager"] },
];

// Editor de e-mail/legenda é contentEditable: sem isso, digitar "g" e "d" num texto tirava a pessoa da página.
function estaDigitando(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable || !!el.closest("[contenteditable]:not([contenteditable='false'])");
}

export default function KeyboardShortcuts() {
  const router = useRouter();
  const { role } = useRole();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const atalhos = useMemo(() => SHORTCUTS.filter((s) => s.roles.includes(role)), [role]);

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowHelp(false);
        setPendingKey(null);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (estaDigitando(e.target)) return;

      // ? = show help
      if (e.key === "?") {
        e.preventDefault();
        setShowHelp((p) => !p);
        return;
      }

      // Two-key shortcuts (g + key)
      if (pendingKey === "g") {
        const shortcut = atalhos.find((s) => s.keys[1] === e.key);
        if (shortcut) {
          e.preventDefault();
          setShowHelp(false);
          router.push(shortcut.href);
        }
        setPendingKey(null);
        return;
      }

      if (e.key === "g") {
        setPendingKey("g");
        timeout = setTimeout(() => setPendingKey(null), 1000);
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      clearTimeout(timeout);
    };
  }, [pendingKey, router, atalhos]);

  if (!showHelp) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" onClick={() => setShowHelp(false)} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-fade-in">
        <h2 className="text-sm font-bold text-foreground mb-4">Atalhos de Teclado</h2>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Busca global</span>
            <kbd className="px-2 py-0.5 rounded bg-muted border border-border text-[10px] font-mono text-foreground">⌘K / Ctrl+K</kbd>
          </div>
          {atalhos.map((s) => (
            <div key={s.href} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, i) => (
                  <span key={i}>
                    <kbd className="px-2 py-0.5 rounded bg-muted border border-border text-[10px] font-mono text-foreground">{k}</kbd>
                    {i < s.keys.length - 1 && <span className="text-[10px] text-muted-foreground mx-0.5">+</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Esta ajuda</span>
            <kbd className="px-2 py-0.5 rounded bg-muted border border-border text-[10px] font-mono text-foreground">?</kbd>
          </div>
        </div>

        <button
          onClick={() => setShowHelp(false)}
          className="w-full mt-4 text-xs text-muted-foreground hover:text-foreground py-2 text-center transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
