"use client";

import { usePathname } from "next/navigation";
import AppShell from "@/components/AppShell";

const PUBLIC_ROUTES = ["/onboarding"];

export default function ConditionalAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));

  if (isPublic) return <>{children}</>;
  return <AppShell>{children}</AppShell>;
}
