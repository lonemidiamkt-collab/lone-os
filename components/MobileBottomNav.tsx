"use client";

// Barra de navegação inferior (mobile) — dá cara de app. Só aparece < lg.
// Mostra os 4 destinos que cada papel mais abre + "Mais" (abre o menu completo/drawer).
// Os destinos vêm do menu único (lib/navegacao/menu.ts): mesmas telas e mesmas regras de papel
// da barra lateral.

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { useRole } from "@/lib/context/RoleContext";
import { useNav } from "@/lib/context/NavContext";
import { atalhosMobile, casarRota, menuDoPapel } from "@/lib/navegacao/menu";
import LeitorDaBusca from "@/components/navegacao/LeitorDaBusca";

export default function MobileBottomNav() {
  const { role } = useRole();
  const pathname = usePathname() || "";
  const { setMobileOpen } = useNav();
  const [busca, setBusca] = useState("");

  const grupos = useMemo(() => menuDoPapel(role), [role]);
  const items = useMemo(() => atalhosMobile(role), [role]);

  // Acende o atalho da tela exata; se a tela não tem atalho próprio (ex.: /traffic/budgets), acende
  // o primeiro atalho da mesma área.
  const idAtivo = useMemo(() => {
    const ativo = casarRota(grupos, pathname, busca);
    if (!ativo) return null;
    const exato = items.find((i) => i.id === ativo.item.id);
    if (exato) return exato.id;
    return items.find((i) => ativo.grupo.itens.some((it) => it.id === i.id))?.id ?? null;
  }, [grupos, items, pathname, busca]);

  // Rotas públicas por token (portal/ficha/relatório/onboarding) não têm barra.
  if (/^\/(portal|ficha|relatorio|onboarding)\//.test(pathname)) return null;
  if (items.length === 0) return null;

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar border-t border-sidebar-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navegação principal"
    >
      <LeitorDaBusca onChange={setBusca} />
      <div className="flex items-stretch justify-around h-14">
        {items.map((item) => {
          const active = item.id === idAtivo;
          const Icon = item.icone;
          return (
            <Link
              key={item.id}
              href={item.href}
              className="relative flex-1 flex flex-col items-center justify-center gap-1 min-w-0 active:scale-95 transition-transform"
              aria-current={active ? "page" : undefined}
            >
              {active && <span className="absolute top-0 h-[3px] w-8 rounded-full bg-primary" />}
              <Icon size={21} strokeWidth={active ? 2.4 : 1.9} className={active ? "text-primary" : "text-muted-foreground"} />
              <span className={`text-[10px] leading-none truncate max-w-[64px] ${active ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                {item.rotulo}
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
