"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/context/ThemeContext";

// Mesma curva usada no resto do Sidebar (transition-all + ease-[cubic-bezier(0.16,1,0.3,1)]).
const EASE = [0.16, 1, 0.3, 1] as const;

interface ThemeToggleProps {
  /** "icon": crossfade sol/lua no espaço de um botão-ícone (rail colapsado, 72px).
   *  "pill": trilho deslizante, precisa de mais largura (rail expandido, 200px). */
  variant?: "icon" | "pill";
  className?: string;
}

export function ThemeToggle(props: ThemeToggleProps) {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeToggleInner {...props} />
    </MotionConfig>
  );
}

function ThemeToggleInner({ variant = "icon", className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  if (variant === "pill") {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
        onClick={toggleTheme}
        className={cn(
          "relative flex w-14 h-7 items-center rounded-full border border-border bg-secondary px-1 transition-colors",
          isDark ? "justify-start" : "justify-end",
          className
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className="flex items-center justify-center w-5 h-5 rounded-full bg-card shadow-sm border border-border"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme}
              initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="flex items-center justify-center"
            >
              {isDark ? (
                <Moon size={12} className="text-muted-foreground" strokeWidth={1.8} />
              ) : (
                <Sun size={12} className="text-lone-warning" strokeWidth={1.8} />
              )}
            </motion.span>
          </AnimatePresence>
        </motion.span>
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
      onClick={toggleTheme}
      title={isDark ? "Modo claro" : "Modo escuro"}
      className={cn(
        "w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden text-muted-foreground hover:text-foreground hover:bg-accent transition-all",
        className
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
          transition={{ duration: 0.18, ease: EASE }}
          className="flex items-center justify-center"
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
