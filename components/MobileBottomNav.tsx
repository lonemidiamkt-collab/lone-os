"use client";

// Barra de navegação inferior (mobile) — dá cara de app. Só aparece < lg.
// Mostra os 4 destinos principais do papel + "Mais" (abre o menu completo/drawer).
// Reusa PRIMARY_NAV do Sidebar (mesma fonte de verdade e mesmas regras de papel).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { useRole } from "@/lib/context/RoleContext";
import { useNav } from "@/lib/context/NavContext";
import { PRIMARY_NAV } from "@/components/Sidebar";

// Rótulos curtos pro espaço apertado do mobile.
const SHORT: Record<string, string> = {
  "Meu Trabalho": "Trabalho",
  "Defesa Ativa": "Defesa",
  "Área CEO": "CEO",
  "Sobre o Sistema": "Sobre",
};

export default function MobileBottomNav() {
  const { role } = useRole();
  const pathname = usePathname() || "";
  const { setMobileOpen } = useNav();

  // Rotas públicas por token (portal/ficha/relatório/onboarding) não têm barra.
  if (/^\/(portal|ficha|relatorio|onboarding)\//.test(pathname)) return null;

  const items = PRIMARY_NAV.filter((i) => i.roles.includes(role)).slice(0, 4);
  if (items.length === 0) return null;
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--sidebar)]/90 backdrop-blur-xl border-t border-sidebar-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navegação principal"
    >
      <div className="flex items-stretch justify-around h-14">
        {items.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex-1 flex flex-col items-center justify-center gap-1 min-w-0 active:scale-95 transition-transform"
              aria-current={active ? "page" : undefined}
            >
              {active && <span className="absolute top-0 h-[3px] w-8 rounded-full bg-primary" />}
              <Icon size={21} strokeWidth={active ? 2.4 : 1.9} className={active ? "text-primary" : "text-muted-foreground"} />
              <span className={`text-[10px] leading-none truncate max-w-[64px] ${active ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                {SHORT[item.label] ?? item.label}
              </span>
            </Link>
          );
        })}
        <button
          onClick={() => setMobileOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-1 text-muted-foreground active:scale-95 active:text-foreground transition-transform"
          aria-label="Abrir menu completo"
        >
          <MoreHorizontal size={21} strokeWidth={1.9} />
          <span className="text-[10px] leading-none">Mais</span>
        </button>
      </div>
    </nav>
  );
}
