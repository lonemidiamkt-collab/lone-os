"use client";

import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from "next-themes";

/**
 * Wrapper fino do next-themes.
 * - attribute="class": liga/desliga a classe .dark / .light no <html>.
 * - defaultTheme="dark" + enableSystem: default escuro, mas com opção "system".
 * - O script do next-themes seta a classe ANTES do paint → sem flash de hidratação.
 *
 * A API pública (`useTheme` -> { theme, toggleTheme }) é mantida igual à anterior
 * pra não quebrar Sidebar/settings.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      themes={["light", "dark"]}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}

export function useTheme() {
  const { resolvedTheme, setTheme } = useNextTheme();
  const theme: "dark" | "light" = resolvedTheme === "light" ? "light" : "dark";
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");
  return { theme, toggleTheme };
}
