"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Barra de ações com rótulo que desliza ao passar o mouse (ou ao focar pelo teclado).
// Adaptado do padrão "expandable tabs": aqui cada item é uma AÇÃO — o clique executa na hora,
// o rótulo só aparece para dizer o que o ícone faz.

export interface ExpandableAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  href?: string;
  /** Mantém o rótulo aberto e destaca (ex.: página atual). */
  active?: boolean;
  /** Número no canto do ícone (ex.: notificações não lidas). */
  badge?: number;
  tone?: "default" | "danger";
}

export type ExpandableItem = ExpandableAction | { type: "separator"; key: string };

const transition = { type: "spring", bounce: 0, duration: 0.45 } as const;

export function ExpandableTabs({ items, className }: { items: ExpandableItem[]; className?: string }) {
  const [hovered, setHovered] = React.useState<string | null>(null);

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={cn("flex items-center gap-1 rounded-2xl border border-border bg-card p-1 shadow-sm", className)}
        onMouseLeave={() => setHovered(null)}
      >
        {items.map((item) => {
          if ("type" in item) {
            return <div key={item.key} className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />;
          }
          const aberto = hovered === item.key || !!item.active;
          const Icon = item.icon;
          const classe = cn(
            "relative flex h-8 items-center rounded-xl px-2 text-[13px] font-medium outline-none transition-colors",
            "focus-visible:ring-2 focus-visible:ring-ring",
            item.active
              ? "bg-muted text-primary"
              : item.tone === "danger"
                ? "text-muted-foreground hover:bg-lone-danger-bg hover:text-lone-danger"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
          );
          const conteudo = (
            <>
              <span className="relative flex shrink-0">
                <Icon size={17} strokeWidth={1.8} />
                {!!item.badge && item.badge > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground tabular-nums">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </span>
              <AnimatePresence initial={false}>
                {aberto && (
                  <motion.span
                    initial={{ width: 0, opacity: 0, marginLeft: 0 }}
                    animate={{ width: "auto", opacity: 1, marginLeft: 8 }}
                    exit={{ width: 0, opacity: 0, marginLeft: 0 }}
                    transition={transition}
                    className="overflow-hidden whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </>
          );
          const eventos = {
            onMouseEnter: () => setHovered(item.key),
            onFocus: () => setHovered(item.key),
            onBlur: () => setHovered((h) => (h === item.key ? null : h)),
            "aria-label": item.label,
            title: item.label,
          };
          return item.href ? (
            <Link key={item.key} href={item.href} className={classe} {...eventos} aria-current={item.active ? "page" : undefined}>
              {conteudo}
            </Link>
          ) : (
            <button key={item.key} type="button" onClick={item.onClick} className={classe} {...eventos}>
              {conteudo}
            </button>
          );
        })}
      </div>
    </MotionConfig>
  );
}
