"use client";

import { usePathname } from "next/navigation";
import AppShell from "@/components/AppShell";

const PUBLIC_ROUTES = ["/onboarding", "/relatorio", "/portal"];

export default function ConditionalAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));

  // Rotas públicas (cliente): tema sempre CLARO, independente do toggle do usuário.
  if (isPublic) return <div className="theme-force-light min-h-screen bg-background text-foreground">{children}</div>;
  return <AppShell>{children}</AppShell>;
}
