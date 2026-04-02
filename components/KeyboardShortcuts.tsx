"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/lib/context/RoleContext";

const SHORTCUTS = [
  { keys: ["g", "d"], label: "Dashboard", href: "/" },
  { keys: ["g", "t"], label: "Tráfego Pago", href: "/traffic" },
  { keys: ["g", "s"], label: "Social Media", href: "/social" },
  { keys: ["g", "c"], label: "Clientes", href: "/clients" },
  { keys: ["g", "m"], label: "Comunicação", href: "/communications" },
];

export default function KeyboardShortcuts() {
  const router = useRouter();
  const { role } = useRole();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const handler = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // ? = show help
      if (e.key === "?") {
        e.preventDefault();
        setShowHelp((p) => !p);
        return;
      }

      // Two-key shortcuts (g + key)
      if (pendingKey === "g") {
        const shortcut = SHORTCUTS.find((s) => s.keys[1] === e.key);
        if (shortcut) {
          e.preventDefault();
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
  }, [pendingKey, router, role]);

  if (!showHelp) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowHelp(false)} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-fade-in">
        <h2 className="text-sm font-bold text-foreground mb-4">Atalhos de Teclado</h2>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Busca global</span>
            <kbd className="px-2 py-0.5 rounded bg-muted border border-border text-[10px] font-mono text-foreground">Cmd+K</kbd>
          </div>
          {SHORTCUTS.map((s) => (
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
