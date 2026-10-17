"use client";

import { usePathname } from "next/navigation";
import AppShell from "@/components/AppShell";
import CascoComercial from "@/components/CascoComercial";
import { useCascoComercial } from "@/lib/navegacao/use-casco";

const PUBLIC_ROUTES = ["/onboarding", "/portal", "/ficha"];

export default function ConditionalAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const comercial = useCascoComercial(); // comercial.lonemidia.com → casco próprio (lib/navegacao/casco.ts)
  const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));

  if (isPublic) return <>{children}</>;
  if (comercial) return <CascoComercial>{children}</CascoComercial>;
  return <AppShell>{children}</AppShell>;
}
