"use client";

import { useTheme as useNextTheme } from "next-themes";

type Theme = "dark" | "light";

/**
 * Wrapper fino sobre next-themes para manter a API antiga `{ theme, toggleTheme }`
 * usada por Sidebar e settings. O provider real é o <ThemeProvider> global em
 * app/layout.tsx — não há mais provider próprio aqui.
 *
 * `theme` reflete o tema resolvido (resolvedTheme), então "system" já vem como
 * "dark"/"light" concreto.
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const { resolvedTheme, setTheme } = useNextTheme();
  const theme: Theme = resolvedTheme === "light" ? "light" : "dark";
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");
  return { theme, toggleTheme };
}
