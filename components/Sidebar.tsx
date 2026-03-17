"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Instagram,
  Palette,
  Users,
  Lock,
  ChevronRight,
  Zap,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/lib/context/RoleContext";

const avatarDotColorSidebar: Record<string, string> = {
  "text-purple-400": "bg-purple-400",
  "text-blue-400":   "bg-blue-400",
  "text-green-400":  "bg-green-400",
  "text-pink-400":   "bg-pink-400",
  "text-yellow-400": "bg-yellow-400",
};

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard", roles: ["admin", "manager", "traffic", "social", "designer"] },
  { href: "/traffic", icon: TrendingUp, label: "Tráfego Pago", roles: ["admin", "manager", "traffic"] },
  { href: "/social", icon: Instagram, label: "Social Media", roles: ["admin", "manager", "social", "designer"] },
  { href: "/design", icon: Palette, label: "Designer", roles: ["admin", "manager", "designer", "social"] },
  { href: "/clients", icon: Users, label: "Clientes", roles: ["admin", "manager"] },
  { href: "/communications", icon: MessageCircle, label: "Comunicação", roles: ["admin", "manager", "traffic", "social", "designer"] },
  { href: "/ceo", icon: Lock, label: "Área CEO", roles: ["admin"] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { role, currentProfile, roleLabel } = useRole();

  const visibleItems = navItems.filter((item) => item.roles.includes(role));

  return (
    <aside className="w-60 min-h-screen bg-sidebar border-r border-sidebar-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Zap size={16} className="text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-bold text-sidebar-foreground text-sm leading-none">Lone OS</h1>
          <p className="text-muted-foreground text-xs mt-0.5">v1.0</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visibleItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                active
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Icon
                size={18}
                className={cn(
                  "shrink-0 transition-colors",
                  active ? "text-sidebar-primary" : "text-muted-foreground group-hover:text-sidebar-foreground"
                )}
              />
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight size={14} className="text-sidebar-primary opacity-70" />}
              {item.href === "/ceo" && !active && (
                <Lock size={12} className="text-muted-foreground" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Current User */}
      <div className="mt-auto px-3 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-sidebar-accent/50">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
            <span className={`text-xs font-bold ${currentProfile.color}`}>{currentProfile.initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-sidebar-foreground leading-none truncate">{currentProfile.name}</p>
            <p className={`text-xs leading-none mt-0.5 ${currentProfile.color}`}>{roleLabel}</p>
          </div>
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${avatarDotColorSidebar[currentProfile.color] ?? "bg-green-400"}`}
            title="Online"
          />
        </div>
        <p className="text-muted-foreground text-xs text-center mt-3">Lone Mídia © 2026</p>
      </div>
    </aside>
  );
}
