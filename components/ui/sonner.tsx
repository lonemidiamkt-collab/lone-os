"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/lib/context/ThemeContext";

/**
 * Wrapper tokenizado do sonner — único sistema de toast do app (ver ADR do Passo 5 da Fase 1 de
 * UX). Em vez de classNames com cor hard-coded, sobrescreve as CSS vars que o próprio sonner lê
 * (--normal-bg etc.) pelos tokens do design system, então `richColors` (toast.success/.error/
 * .warning) sai na paleta lone-* em vez da paleta padrão do sonner.
 */
export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      richColors
      closeButton
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-border": "var(--border)",
          "--normal-text": "var(--card-foreground)",
          "--success-bg": "var(--lone-success-bg)",
          "--success-border": "var(--lone-success-border)",
          "--success-text": "var(--lone-success)",
          "--error-bg": "var(--lone-danger-bg)",
          "--error-border": "var(--lone-danger-border)",
          "--error-text": "var(--lone-danger)",
          "--warning-bg": "var(--lone-warning-bg)",
          "--warning-border": "var(--lone-warning-border)",
          "--warning-text": "var(--lone-warning)",
          "--info-bg": "var(--lone-info-bg)",
          "--info-border": "var(--lone-info-border)",
          "--info-text": "var(--lone-info)",
        } as CSSProperties
      }
      {...props}
    />
  );
}
