"use client";

import { Toaster } from "sonner";
import { useTheme } from "next-themes";
import type { ComponentProps } from "react";

/** Toaster do sonner seguindo o tema atual (next-themes). */
export function ThemedToaster(props: ComponentProps<typeof Toaster>) {
  const { resolvedTheme } = useTheme();
  return <Toaster theme={(resolvedTheme as "light" | "dark") ?? "dark"} {...props} />;
}
